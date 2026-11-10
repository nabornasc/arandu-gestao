import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import { aiUsage, auditLogs, telegramMessages, users } from '../db/schema.ts';
import { aiProvider, type FakeProvider } from '../services/assistant/provider.ts';
import { telegramBot, toTelegramHtml } from '../services/telegram.ts';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

const SECRET = 'segredo-de-teste-do-webhook';
const ME = {
  id: 999,
  is_bot: true,
  first_name: 'Arandu',
  username: 'arandu_teste_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};

let app: FastifyInstance;
let owner: Client;
// Chamadas que o bot faria à API do Telegram: nenhum teste fala com o Telegram de verdade.
let calls: { method: string; payload: Record<string, unknown> }[] = [];
let updateId = 1;
let nextChat = 7_000_000_000 + Math.floor(Math.random() * 1_000_000);
const fake = () => aiProvider() as FakeProvider;

const replies = () =>
  calls.filter((call) => call.method === 'sendMessage').map((call) => String(call.payload.text));

function webhook(payload: unknown, secret: string | null = SECRET) {
  return app.inject({
    method: 'POST',
    url: '/api/telegram/webhook',
    headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {},
    payload: payload as object,
  });
}

// Simula uma mensagem de texto numa conversa privada e devolve as respostas do bot.
async function say(chatId: number, text: string, type: 'private' | 'group' = 'private') {
  calls = [];
  const command = text.startsWith('/') ? text.split(' ')[0]?.length : 0;
  const response = await webhook({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat:
        type === 'private' ? { id: chatId, type, first_name: 'Ana' } : { id: chatId, type, title: 'Equipe' },
      from: { id: chatId, is_bot: false, first_name: 'Ana' },
      text,
      ...(command ? { entities: [{ type: 'bot_command', offset: 0, length: command }] } : {}),
    },
  });
  expect(response.statusCode).toBe(200);
  return replies();
}

async function link(client: Client, chatId: number) {
  const created = await client.post('/telegram/link');
  expect(created.status).toBe(200);
  const answer = await say(chatId, `/vincular ${created.body.code}`);
  expect(answer.join()).toMatch(/Sua conta está vinculada/);
}

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  telegramBot().api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: method === 'getMe' ? ME : true } as never;
  });
});
afterAll(() => app.close());
beforeEach(() => {
  calls = [];
});

describe('bot do Telegram', () => {
  it('o webhook só aceita o cabeçalho secreto e um update válido', async () => {
    expect((await webhook({ update_id: 1 }, null)).statusCode).toBe(404);
    expect((await webhook({ update_id: 1 }, 'segredo-errado-do-webhook')).statusCode).toBe(404);
    expect((await webhook({ nada: true })).statusCode).toBe(400);
  });

  it('conversa sem vínculo recebe só a instrução; /start avisa que é IA', async () => {
    const chat = nextChat++;
    const start = await say(chat, '/start');
    expect(start[0]).toMatch(/inteligência artificial/);
    expect(start[0]).toMatch(/vincular/);
    expect((await say(chat, 'Quanto faturei?'))[0]).toMatch(/vincule sua conta/);
    expect(fake().requests.some((request) => request.messages.at(-1)?.content === 'Quanto faturei?')).toBe(
      false,
    );
  });

  it('vincula com o código de Meu perfil, responde pelo assistente e lembra da conversa', async () => {
    const chat = nextChat++;
    const before = await owner.get('/telegram/link');
    expect(before.body).toEqual({ available: true, linked: false, botUsername: 'arandu_teste_bot' });

    const created = await owner.post('/telegram/link');
    expect(created.body.code).toMatch(/^\d{6}$/);
    expect(created.body.botUsername).toBe('arandu_teste_bot');
    const wrong = created.body.code === '000000' ? '111111' : '000000';
    expect((await say(chat, `/vincular ${wrong}`))[0]).toMatch(/inválido ou vencido/);
    expect((await say(chat, `/vincular ${created.body.code}`))[0]).toMatch(/Sua conta está vinculada/);
    expect((await owner.get('/telegram/link')).body.linked).toBe(true);
    // O código serve uma vez só.
    expect((await say(nextChat++, `/vincular ${created.body.code}`))[0]).toMatch(/inválido ou vencido/);

    const [entry] = await db
      .select({ actor: auditLogs.actor, data: auditLogs.data })
      .from(auditLogs)
      .where(and(eq(auditLogs.companyId, owner.companyId), eq(auditLogs.entity, 'user')));
    expect(entry).toMatchObject({ actor: 'telegram' });

    const first = await say(chat, 'Como crio um pedido?');
    expect(first[0]).toContain('Resposta de teste para: Como crio um pedido?');
    expect(calls.some((call) => call.method === 'sendChatAction')).toBe(true);
    await say(chat, 'E um orçamento?');
    expect(fake().requests.at(-1)?.messages).toEqual([
      { role: 'user', content: 'Como crio um pedido?' },
      { role: 'assistant', content: 'Resposta de teste para: Como crio um pedido?' },
      { role: 'user', content: 'E um orçamento?' },
    ]);

    const usage = await db.select().from(aiUsage).where(eq(aiUsage.companyId, owner.companyId));
    expect(usage.every((row) => row.channel === 'telegram')).toBe(true);
    expect(usage).toHaveLength(2);
  });

  it('as ferramentas usam as permissões do usuário vinculado', async () => {
    const seller = await addMember(app, owner, 'seller');
    const chat = nextChat++;
    await link(seller, chat);
    await say(chat, 'Quanto faturei? [ferramenta:faturamento_do_periodo]');
    const request = fake().requests.at(-1);
    expect(request?.tools?.map((tool) => tool.name)).not.toContain('faturamento_do_periodo');
    expect(replies()[0]).toMatch(/Ferramenta indisponível para este usuário/);
  });

  it('grupo sem o assistente não gera código nem conversa pelo bot', async () => {
    const accountant = await addMember(app, owner, 'accountant');
    expect((await accountant.post('/telegram/link')).status).toBe(403);
    const chat = nextChat++;
    await db.update(users).set({ telegramChatId: chat }).where(eq(users.id, accountant.userId));
    expect((await say(chat, 'Oi'))[0]).toBe('Seu grupo de acesso não inclui o assistente de IA.');
  });

  it('depois de 5 códigos errados, recusa até o código certo', async () => {
    const member = await addMember(app, owner, 'seller');
    const chat = nextChat++;
    const created = await member.post('/telegram/link');
    const wrong = created.body.code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) await say(chat, `/vincular ${wrong}`);
    expect((await say(chat, `/vincular ${created.body.code}`))[0]).toMatch(/Muitas tentativas/);
    expect((await member.get('/telegram/link')).body.linked).toBe(false);
  });

  it('código vencido não vincula', async () => {
    const member = await addMember(app, owner, 'seller');
    const created = await member.post('/telegram/link');
    await db
      .update(users)
      .set({ telegramLinkExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(users.id, member.userId));
    expect((await say(nextChat++, `/vincular ${created.body.code}`))[0]).toMatch(/inválido ou vencido/);
  });

  it('/sair e Meu perfil desvinculam e apagam a conversa guardada', async () => {
    const member = await addMember(app, owner, 'seller');
    const chat = nextChat++;
    await link(member, chat);
    await say(chat, 'Oi');
    expect((await say(chat, '/sair'))[0]).toMatch(/Conta desvinculada/);
    expect((await member.get('/telegram/link')).body.linked).toBe(false);
    const kept = await db.select().from(telegramMessages).where(eq(telegramMessages.userId, member.userId));
    expect(kept).toHaveLength(0);
    expect((await say(chat, 'Oi'))[0]).toMatch(/vincule sua conta/);

    await link(member, chat);
    expect((await member.del('/telegram/link')).status).toBe(204);
    expect((await say(chat, 'Oi'))[0]).toMatch(/vincule sua conta/);
  });

  it('o link de Meu perfil (/start com o código) vincula com um toque', async () => {
    const member = await addMember(app, owner, 'seller');
    const created = await member.post('/telegram/link');
    const answer = await say(nextChat++, `/start ${created.body.code}`);
    expect(answer[0]).toMatch(/inteligência artificial/);
    expect(answer[0]).toMatch(/Sua conta está vinculada/);
    expect((await member.get('/telegram/link')).body.linked).toBe(true);
  });

  it('o mesmo Telegram passa para a última conta vinculada', async () => {
    const a = await addMember(app, owner, 'seller');
    const b = await addMember(app, owner, 'seller');
    const chat = nextChat++;
    await link(a, chat);
    await link(b, chat);
    expect((await a.get('/telegram/link')).body.linked).toBe(false);
    expect((await b.get('/telegram/link')).body.linked).toBe(true);
  });

  it('ignora grupos e avisa quando a mensagem não é texto', async () => {
    expect(await say(-100123, 'Oi', 'group')).toEqual([]);
    calls = [];
    const response = await webhook({
      update_id: updateId++,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: nextChat, type: 'private', first_name: 'Ana' },
        photo: [{ file_id: 'x', file_unique_id: 'y', width: 1, height: 1 }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(replies()[0]).toMatch(/só entendo mensagens de texto/);
  });
});

describe('formatação para o Telegram', () => {
  it('converte negrito e código, escapa HTML e completa os endereços do sistema', () => {
    expect(toTelegramHtml('Clique em **Salvar** <já> & `F1`', 'https://app.test')).toBe(
      'Clique em <b>Salvar</b> &lt;já&gt; &amp; <code>F1</code>',
    );
    expect(
      toTelegramHtml('Veja /ajuda/vendas/criar-pedido ou (/contas-a-receber).', 'https://app.test'),
    ).toBe('Veja https://app.test/ajuda/vendas/criar-pedido ou (https://app.test/contas-a-receber).');
    expect(toTelegramHtml('Prazos 30/60/90 e R$ 10/mês', 'https://app.test')).toBe(
      'Prazos 30/60/90 e R$ 10/mês',
    );
  });
});
