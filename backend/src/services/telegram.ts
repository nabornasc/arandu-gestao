import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ASSISTANT_ATTACHMENT_TYPES,
  type AssistantAttachment,
} from '@arandue/shared/schemas';
import { and, asc, count, eq, gt, lt, ne, sql } from 'drizzle-orm';
import { Bot, type Context, GrammyError, InlineKeyboard } from 'grammy';
import type { Update } from 'grammy/types';
import { config } from '../config.ts';
import { db } from '../db/client.ts';
import { aiUsage, telegramLinkFailures, telegramMessages, users } from '../db/schema.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { AppError, notFound } from '../lib/errors.ts';
import { reportError } from '../lib/monitoring.ts';
import { cancelAction, confirmAction, type ProposedAction } from './assistant/actions.ts';
import { askAssistant } from './assistant/index.ts';
import { audit } from './audit.ts';
import { resolveTelegramChat, resolveUserCtx } from './auth.ts';

// Bot do Telegram (etapa 10d): o mesmo assistente do chat web, com as permissões do usuário vinculado.
// Este arquivo só traduz o Telegram para o núcleo do assistente e de volta.

const CODE_TTL_MS = 10 * 60 * 1000;
// Erros de código por conversa, dentro da validade de um código, antes de o bot recusar novas tentativas.
const MAX_LINK_FAILURES = 5;
const MESSAGES_PER_MINUTE = 20;
const HISTORY_SIZE = 10;
// A conversa guardada vale por pouco tempo: depois disso, o assistente começa do zero.
const HISTORY_WINDOW = sql`interval '2 hours'`;
// Limite de uma mensagem do Telegram é 4.096 caracteres; sobra espaço para as marcas de formatação.
const TELEGRAM_LIMIT = 4000;

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

const WELCOME = [
  'Olá! Sou o assistente do Arandu Gestão.',
  'Respondo dúvidas de uso do sistema e consulto os dados da sua empresa, com as mesmas permissões que você tem no sistema.',
  'As mensagens são processadas por inteligência artificial. Confira os números importantes no sistema.',
].join('\n\n');

const LINK_HELP = [
  'Para usar o assistente aqui, vincule sua conta:',
  '1. No Arandu Gestão, clique no seu nome, no alto da tela, e abra Meu perfil.',
  '2. Em Telegram, clique em Gerar código.',
  '3. Mande aqui: /vincular seguido do código. Exemplo: /vincular 123456',
].join('\n');

const LINKED_HELP =
  'Pode perguntar. Exemplos: "Quanto faturei este mês?", "Quais contas vencem esta semana?", "Como crio um orçamento?". Para desvincular, mande /sair.';

// ---------- Vínculo pela tela "Meu perfil" ----------

let botInstance: Bot | null = null;

export function telegramBot(): Bot {
  if (!config.TELEGRAM_BOT_TOKEN) throw new AppError(503, 'O bot do Telegram ainda não está configurado.');
  if (!botInstance) {
    // Cada chamada ao Telegram tem prazo curto: a função da Vercel encerra em 30 s.
    botInstance = new Bot(config.TELEGRAM_BOT_TOKEN, { client: { timeoutSeconds: 10 } });
    registerHandlers(botInstance);
  }
  return botInstance;
}

// O bot.init() do grammY repete o getMe sem parar quando a rede falha. Com prazo, a falha vira erro
// em vez de prender a requisição até a Vercel encerrar a função.
const INIT_TIMEOUT_MS = 8000;
async function initBot(bot: Bot) {
  if (bot.isInited()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      bot.init(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('O Telegram não respondeu a tempo (getMe).')),
          INIT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Nome do bot para o link t.me. Falha do Telegram aqui não impede o vínculo: a tela só mostra menos.
async function botUsername(): Promise<string | null> {
  try {
    const bot = telegramBot();
    await initBot(bot);
    return bot.botInfo.username;
  } catch (error) {
    await reportError(error);
    return null;
  }
}

export async function getTelegramLink(ctx: Ctx) {
  const [row] = await db.select({ chatId: users.telegramChatId }).from(users).where(eq(users.id, ctx.userId));
  if (!row) throw notFound();
  const available = Boolean(config.TELEGRAM_BOT_TOKEN);
  return {
    available,
    linked: row.chatId !== null,
    botUsername: available ? await botUsername() : null,
  };
}

// Código de 6 dígitos, válido por 10 minutos. Gerar outro invalida o anterior.
export async function createTelegramCode(ctx: Ctx) {
  authorize(ctx, 'assistant.use');
  telegramBot();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = hashCode(code);
    // Dois usuários nunca têm o mesmo código válido ao mesmo tempo.
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.telegramLinkCode, hash),
          gt(users.telegramLinkExpiresAt, new Date()),
          ne(users.id, ctx.userId),
        ),
      );
    if (taken) continue;
    await db
      .update(users)
      .set({ telegramLinkCode: hash, telegramLinkExpiresAt: expiresAt })
      .where(eq(users.id, ctx.userId));
    return { code, expiresAt: expiresAt.toISOString(), botUsername: await botUsername() };
  }
  throw new AppError(503, 'Não foi possível gerar o código agora. Tente de novo.');
}

export async function unlinkTelegram(ctx: Ctx) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ telegramChatId: null, telegramLinkCode: null, telegramLinkExpiresAt: null })
      .where(and(eq(users.id, ctx.userId), sql`${users.telegramChatId} IS NOT NULL`))
      .returning({ name: users.name });
    if (!row) return;
    await tx.delete(telegramMessages).where(eq(telegramMessages.userId, ctx.userId));
    await audit(tx, ctx, 'update', 'user', ctx.userId, {
      label: row.name,
      changes: [{ field: 'telegram', from: 'vinculado', to: 'desvinculado' }],
    });
  });
}

// ---------- Mensagens recebidas pelo bot ----------

async function linkChat(chatId: number, code: string): Promise<string> {
  const [failures] = await db
    .select({ total: count() })
    .from(telegramLinkFailures)
    .where(
      and(
        eq(telegramLinkFailures.chatId, chatId),
        gt(telegramLinkFailures.createdAt, new Date(Date.now() - CODE_TTL_MS)),
      ),
    );
  if ((failures?.total ?? 0) >= MAX_LINK_FAILURES) {
    return 'Muitas tentativas com código errado. Espere 10 minutos e gere um código novo em Meu perfil.';
  }

  const [user] = /^\d{6}$/.test(code)
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.telegramLinkCode, hashCode(code)),
            gt(users.telegramLinkExpiresAt, new Date()),
            eq(users.active, true),
          ),
        )
    : [];
  if (!user) {
    await db.insert(telegramLinkFailures).values({ chatId });
    // Só os erros recentes contam: os antigos são apagados.
    await db
      .delete(telegramLinkFailures)
      .where(lt(telegramLinkFailures.createdAt, new Date(Date.now() - CODE_TTL_MS)));
    return 'Código inválido ou vencido. Gere outro em Meu perfil e mande /vincular seguido do código.';
  }

  const ctx = await resolveUserCtx(user.id, 'telegram');
  return db.transaction(async (tx) => {
    // A conversa passa para o novo usuário: um Telegram fica ligado a uma conta só.
    const previous = await tx
      .update(users)
      .set({ telegramChatId: null })
      .where(and(eq(users.telegramChatId, chatId), ne(users.id, user.id)))
      .returning({ id: users.id });
    for (const { id } of previous) await tx.delete(telegramMessages).where(eq(telegramMessages.userId, id));
    const [row] = await tx
      .update(users)
      .set({ telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpiresAt: null })
      .where(eq(users.id, user.id))
      .returning({ name: users.name });
    if (ctx) {
      await audit(tx, ctx, 'update', 'user', user.id, {
        label: row?.name,
        changes: [{ field: 'telegram', from: 'desvinculado', to: 'vinculado' }],
      });
    }
    await tx.delete(telegramLinkFailures).where(eq(telegramLinkFailures.chatId, chatId));
    return `Pronto, ${row?.name ?? ''}! Sua conta está vinculada.\n\n${LINKED_HELP}`;
  });
}

async function history(userId: number) {
  const rows = await db
    .select({ role: telegramMessages.role, content: telegramMessages.content })
    .from(telegramMessages)
    .where(
      and(
        eq(telegramMessages.userId, userId),
        gt(telegramMessages.createdAt, sql`now() - ${HISTORY_WINDOW}`),
      ),
    )
    .orderBy(asc(telegramMessages.id));
  return rows.slice(-HISTORY_SIZE).map((row) => ({
    role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: row.content.slice(0, 4000),
  }));
}

// O arquivo enviado não fica guardado: o histórico só registra que houve um anexo.
async function remember(ctx: Ctx, question: string, reply: string) {
  await db.insert(telegramMessages).values([
    { companyId: ctx.companyId, userId: ctx.userId, role: 'user', content: question },
    { companyId: ctx.companyId, userId: ctx.userId, role: 'assistant', content: reply },
  ]);
  // Guarda só o necessário: apaga o que já saiu da janela da conversa.
  await db
    .delete(telegramMessages)
    .where(
      and(
        eq(telegramMessages.userId, ctx.userId),
        lt(telegramMessages.createdAt, sql`now() - ${HISTORY_WINDOW}`),
      ),
    );
}

async function questionsInLastMinute(userId: number) {
  const [row] = await db
    .select({ total: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gt(aiUsage.createdAt, sql`now() - interval '1 minute'`)));
  return row?.total ?? 0;
}

export interface TelegramAnswer {
  text: string;
  actions: ProposedAction[];
}

export async function answer(
  ctx: Ctx,
  text: string,
  attachment?: AssistantAttachment,
): Promise<TelegramAnswer> {
  if ((await questionsInLastMinute(ctx.userId)) >= MESSAGES_PER_MINUTE) {
    return { text: 'Muitas mensagens em pouco tempo. Espere um minuto e tente de novo.', actions: [] };
  }
  try {
    const result = await askAssistant(
      ctx,
      { message: text, attachment, history: await history(ctx.userId) },
      'telegram',
    );
    const question = attachment ? `${text}\n[anexo: ${attachment.name ?? attachment.mediaType}]` : text;
    await remember(ctx, question, result.reply);
    const notes = [
      result.truncated && '(A resposta ficou longa e foi cortada. Peça só a parte que falta.)',
      result.usage.warning && 'Aviso: o assistente já usou mais de 80% do limite do mês da empresa.',
    ].filter(Boolean);
    return { text: [result.reply, ...notes].join('\n\n'), actions: result.actions };
  } catch (error) {
    // Erros de negócio (sem permissão, cota, pergunta longa) viram resposta; o resto sobe para o log.
    if (error instanceof AppError) {
      const text =
        error.status === 403 ? 'Seu grupo de acesso não inclui o assistente de IA.' : error.message;
      return { text, actions: [] };
    }
    throw error;
  }
}

// ---------- Arquivos enviados ----------

// Baixa o arquivo do Telegram. Os testes trocam por um download falso.
let downloadFile = async (filePath: string): Promise<Buffer> => {
  const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Download do Telegram falhou: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
export function setTelegramDownload(fn: typeof downloadFile) {
  downloadFile = fn;
}

const TOO_BIG = 'O arquivo passa de 3 MB. Mande uma foto ou um PDF menor.';

async function fetchAttachment(
  c: Context,
  fileId: string,
  mediaType: AssistantAttachment['mediaType'],
  name?: string,
): Promise<AssistantAttachment | string> {
  const file = await c.api.getFile(fileId);
  if ((file.file_size ?? 0) > ASSISTANT_ATTACHMENT_MAX_BYTES || !file.file_path) return TOO_BIG;
  const data = await downloadFile(file.file_path);
  if (data.length > ASSISTANT_ATTACHMENT_MAX_BYTES) return TOO_BIG;
  return { mediaType, name: name ?? null, data: data.toString('base64') };
}

const READ_DOCUMENT =
  'Leia este documento e diga o que encontrou. Se tiver dados de cadastro, ofereça cadastrar.';

// ---------- Formatação ----------

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// O assistente escreve em Markdown simples; o Telegram recebe HTML. Endereços do sistema (/ajuda/...)
// viram links completos.
// Comandos do bot citados nas mensagens: continuam como comando, não viram link do sistema.
const BOT_COMMANDS = new Set(['/start', '/ajuda', '/vincular', '/sair']);

export function toTelegramHtml(text: string, baseUrl = config.ALLOWED_ORIGINS[0] ?? '') {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/(^|[\s(])(\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*)/g, (match, before: string, path: string) =>
      BOT_COMMANDS.has(path) ? match : `${before}${baseUrl}${path}`,
    );
}

async function send(c: Context, text: string) {
  const html = toTelegramHtml(text);
  if (html.length <= TELEGRAM_LIMIT) {
    try {
      await c.reply(html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    } catch (error) {
      // Formatação que o Telegram não aceita: manda o texto puro em vez de perder a resposta.
      if (!(error instanceof GrammyError && error.error_code === 400)) throw error;
    }
  }
  for (let start = 0; start < text.length; start += TELEGRAM_LIMIT) {
    await c.reply(text.slice(start, start + TELEGRAM_LIMIT), { link_preview_options: { is_disabled: true } });
  }
}

// Resposta do assistente e, para cada ação proposta, o resumo com os botões Confirmar e Cancelar.
async function reply(c: Context, result: TelegramAnswer) {
  await send(c, result.text);
  for (const action of result.actions) {
    const keyboard = new InlineKeyboard()
      .text('Confirmar', `acao:ok:${action.id}`)
      .text('Cancelar', `acao:nao:${action.id}`);
    await c.reply(`${escapeHtml(action.summary)}\n\n<i>Confira e toque em Confirmar. Vale 10 minutos.</i>`, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }
}

function registerHandlers(bot: Bot) {
  // Só conversa privada: em grupo, outras pessoas leriam os dados da empresa.
  bot.use(async (c, next) => {
    if (c.chat?.type === 'private') await next();
  });

  bot.command(['start', 'ajuda'], async (c) => {
    // O link "t.me/<bot>?start=<código>" de Meu perfil chega como "/start <código>": vincula direto.
    const code = c.match.trim();
    if (/^\d{6}$/.test(code)) return send(c, `${WELCOME}\n\n${await linkChat(c.chat.id, code)}`);
    const ctx = await resolveTelegramChat(c.chat.id);
    await send(c, `${WELCOME}\n\n${ctx ? LINKED_HELP : LINK_HELP}`);
  });

  bot.command('vincular', async (c) => {
    await send(c, await linkChat(c.chat.id, c.match.trim()));
  });

  bot.command('sair', async (c) => {
    const ctx = await resolveTelegramChat(c.chat.id);
    if (ctx) await unlinkTelegram(ctx);
    await send(c, ctx ? 'Conta desvinculada. Para voltar, gere um código novo em Meu perfil.' : LINK_HELP);
  });

  bot.on('message:text', async (c) => {
    const ctx = await resolveTelegramChat(c.chat.id);
    if (!ctx) return send(c, LINK_HELP);
    // "Digitando..." enquanto o assistente pensa; falha aqui não impede a resposta.
    await c.replyWithChatAction('typing').catch(() => undefined);
    await reply(c, await answer(ctx, c.message.text));
  });

  // Foto (o Telegram manda em JPEG, em vários tamanhos; o último é o maior) ou documento (imagem ou PDF).
  bot.on(['message:photo', 'message:document'], async (c) => {
    const ctx = await resolveTelegramChat(c.chat.id);
    if (!ctx) return send(c, LINK_HELP);
    const document = c.message.document;
    const mediaType = (document ? document.mime_type : 'image/jpeg') as AssistantAttachment['mediaType'];
    if (!ASSISTANT_ATTACHMENT_TYPES.includes(mediaType)) {
      return send(c, 'Envie uma foto, uma imagem (JPEG, PNG, WebP) ou um PDF.');
    }
    const fileId = document?.file_id ?? c.message.photo?.at(-1)?.file_id;
    if (!fileId) return send(c, 'Não consegui ler o arquivo. Tente de novo.');
    await c.replyWithChatAction('typing').catch(() => undefined);
    const attachment = await fetchAttachment(c, fileId, mediaType, document?.file_name);
    if (typeof attachment === 'string') return send(c, attachment);
    await reply(c, await answer(ctx, c.message.caption?.trim() || READ_DOCUMENT, attachment));
  });

  // Botões das ações propostas: grava (ou cancela) sem passar pela IA.
  bot.callbackQuery(/^acao:(ok|nao):([0-9a-f-]{36})$/, async (c) => {
    const ctx = c.chat ? await resolveTelegramChat(c.chat.id) : null;
    if (!ctx) {
      await c.answerCallbackQuery({ text: 'Conta não vinculada.' });
      return;
    }
    const [, choice, id] = c.match;
    let text: string;
    try {
      const result = choice === 'ok' ? await confirmAction(ctx, id) : await cancelAction(ctx, id);
      text = 'path' in result ? `${result.message} Abra em ${result.path}` : result.message;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      text = error.message;
    }
    await c.answerCallbackQuery();
    // Tira os botões da mensagem do resumo: a ação não pode ser usada de novo.
    await c.editMessageReplyMarkup().catch(() => undefined);
    await send(c, text);
  });

  bot.on('message', (c) =>
    send(c, 'Por enquanto, entendo texto, fotos e documentos (imagem ou PDF). Áudio ainda não.'),
  );
}

// ---------- Webhook ----------

// Confere o cabeçalho X-Telegram-Bot-Api-Secret-Token em tempo constante.
export function validWebhookSecret(header: unknown) {
  const secret = config.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Erro ao tratar uma mensagem vai para o log, mas o webhook responde 200: senão o Telegram reenvia
// a mesma mensagem várias vezes.
export async function handleTelegramUpdate(update: Update) {
  const bot = telegramBot();
  try {
    await initBot(bot);
    await bot.handleUpdate(update);
  } catch (error) {
    console.error('[telegram] falha ao tratar a mensagem:', error instanceof Error ? error.message : error);
    await reportError(error);
  }
}

// Usado só pelos testes: descarta o bot para que cada arquivo instale a própria interceptação.
export function resetTelegramBot() {
  botInstance = null;
}
