import type { Permission } from '@arandue/shared/permissions';
import {
  opportunitySchema,
  type PersonInput,
  personSchema,
  productSchema,
  quoteSchema,
} from '@arandue/shared/schemas';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.ts';
import { aiPendingActions, people, products } from '../../db/schema.ts';
import { authorize, type Ctx } from '../../lib/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { createCustomer } from '../customers.ts';
import { createOpportunity } from '../opportunities.ts';
import { createProduct } from '../products.ts';
import { createQuote } from '../quotes.ts';
import { createSupplier } from '../suppliers.ts';

// Ações que gravam. A IA nunca grava: a ferramenta "propor_..." valida os dados com o mesmo schema da
// tela e cria uma ação pendente com um resumo montado aqui (não pelo modelo). Só o clique em Confirmar,
// no chat ou no Telegram, chama o serviço, sem passar pela IA, com as permissões atuais do usuário.

export type ActionChannel = 'web' | 'telegram';
export const ACTION_TTL_MS = 10 * 60 * 1000;

export interface ProposedAction {
  id: string;
  kind: ActionKind;
  summary: string;
  expiresAt: string;
}

// O que as ferramentas de uma pergunta criaram: volta junto com a resposta, para mostrar os botões.
export interface ToolSession {
  channel: ActionChannel;
  actions: ProposedAction[];
}

const money = (value: number | null | undefined) =>
  value == null ? null : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const line = (label: string, value: unknown) =>
  value === null || value === undefined || value === '' ? null : `${label}: ${value}`;
const lines = (...items: (string | null)[]) => items.filter(Boolean).join('\n');

function formatDocument(kind: string | undefined, document: string | null | undefined) {
  if (!document) return null;
  return kind === 'company'
    ? document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

// Campos de pessoa que o assistente preenche. Contatos e endereços extras ficam para a tela.
const personProperties = {
  kind: {
    type: 'string',
    enum: ['individual', 'company'],
    description: 'individual (CPF) ou company (CNPJ)',
  },
  document: { type: 'string', description: 'CPF ou CNPJ, só números' },
  name: { type: 'string', description: 'Nome ou nome fantasia' },
  legalName: { type: 'string', description: 'Razão social' },
  email: { type: 'string' },
  phone: { type: 'string' },
  mobile: { type: 'string', description: 'Celular ou WhatsApp' },
  stateRegistration: { type: 'string', description: 'Inscrição estadual' },
  zip: { type: 'string', description: 'CEP, só números' },
  street: { type: 'string' },
  number: { type: 'string' },
  complement: { type: 'string' },
  district: { type: 'string', description: 'Bairro' },
  city: { type: 'string' },
  state: { type: 'string', description: 'UF com 2 letras' },
  notes: { type: 'string', description: 'Observações' },
};
const personPick = Object.keys(personProperties) as (keyof PersonInput)[];

function personSummary(title: string, data: z.output<typeof personSchema>) {
  const address = [data.street, data.number, data.complement, data.district].filter(Boolean).join(', ');
  const city = data.city ? `${data.city}${data.state ? `/${data.state}` : ''}` : null;
  return lines(
    title,
    line('Nome', data.name),
    line('Razão social', data.legalName),
    line(data.kind === 'company' ? 'CNPJ' : 'CPF', formatDocument(data.kind, data.document)),
    line('Inscrição estadual', data.stateRegistration),
    line('E-mail', data.email),
    line('Telefone', data.phone),
    line('Celular', data.mobile),
    line('Endereço', address || null),
    line('Cidade', city),
    line('CEP', data.zip),
    line('Observações', data.notes),
  );
}

// Documento já cadastrado: o aviso volta ao modelo na hora, em vez de o usuário descobrir no Confirmar.
async function assertNewDocument(ctx: Ctx, data: z.output<typeof personSchema>) {
  if (!data.document) return;
  const [row] = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(and(eq(people.companyId, ctx.companyId), eq(people.document, data.document)));
  if (row) {
    throw new AppError(
      409,
      `Já existe um cadastro com este ${data.kind === 'company' ? 'CNPJ' : 'CPF'}: ${row.name} (/pessoas/${row.id}). ` +
        'Não proponha de novo; ofereça abrir o cadastro existente.',
    );
  }
}

const pick = (input: unknown, keys: string[]) =>
  Object.fromEntries(
    Object.entries((input ?? {}) as Record<string, unknown>).filter(
      ([key, value]) => keys.includes(key) && value !== null && value !== '',
    ),
  );

interface ActionDefinition {
  tool: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission: Permission;
  // Valida e devolve os dados que o serviço vai receber e o resumo para o usuário conferir.
  prepare(ctx: Ctx, input: unknown): Promise<{ payload: unknown; summary: string }>;
  execute(ctx: Ctx, payload: unknown): Promise<{ message: string; path: string }>;
}

const productNames = async (ctx: Ctx, ids: number[]) => {
  if (!ids.length) return new Map<number, string>();
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.companyId, ctx.companyId), inArray(products.id, ids)));
  return new Map(rows.map((row) => [row.id, row.name]));
};

const customerName = async (ctx: Ctx, id: number | null | undefined) => {
  if (!id) return null;
  const [row] = await db
    .select({ name: people.name })
    .from(people)
    .where(and(eq(people.id, id), eq(people.companyId, ctx.companyId), eq(people.isCustomer, true)));
  if (!row) throw new AppError(400, 'Cliente não encontrado. Use buscar_cliente para achar o id.');
  return row.name;
};

const ACTIONS = {
  customer: {
    tool: 'propor_cadastro_cliente',
    description:
      'Prepara o cadastro de um CLIENTE para o usuário conferir e confirmar. Não grava nada. Use os dados que o ' +
      'usuário informou ou que estão no documento enviado; não invente campos.',
    inputSchema: { type: 'object', properties: personProperties, required: ['name'] },
    permission: 'customers.create',
    async prepare(ctx, input) {
      const payload = personSchema.parse({ ...pick(input, personPick), isCustomer: true });
      await assertNewDocument(ctx, payload);
      return { payload, summary: personSummary('Novo cliente', payload) };
    },
    async execute(ctx, payload) {
      const row = await createCustomer(ctx, payload as PersonInput);
      return { message: `Cliente ${row.name} cadastrado.`, path: `/clientes/${row.id}/ficha` };
    },
  },
  supplier: {
    tool: 'propor_cadastro_fornecedor',
    description:
      'Prepara o cadastro de um FORNECEDOR para o usuário conferir e confirmar. Não grava nada. Use só os dados ' +
      'informados ou presentes no documento.',
    inputSchema: { type: 'object', properties: personProperties, required: ['name'] },
    permission: 'suppliers.create',
    async prepare(ctx, input) {
      const payload = personSchema.parse({ ...pick(input, personPick), isSupplier: true });
      await assertNewDocument(ctx, payload);
      return { payload, summary: personSummary('Novo fornecedor', payload) };
    },
    async execute(ctx, payload) {
      const row = await createSupplier(ctx, payload as PersonInput);
      return { message: `Fornecedor ${row.name} cadastrado.`, path: `/pessoas/${row.id}` };
    },
  },
  product: {
    tool: 'propor_cadastro_produto',
    description:
      'Prepara o cadastro de um PRODUTO ou SERVIÇO para o usuário conferir e confirmar. Não grava nada. ' +
      'Preço e custo em reais.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string', description: 'Código próprio (opcional)' },
        type: { type: 'string', enum: ['product', 'service'] },
        price: { type: 'number', description: 'Preço de venda' },
        cost: { type: 'number', description: 'Custo (opcional)' },
        unit: { type: 'string', enum: ['UN', 'CX', 'KG', 'L', 'M', 'M2'] },
        groupName: { type: 'string', description: 'Grupo (opcional)' },
        minStock: { type: 'number', description: 'Estoque mínimo (opcional)' },
      },
      required: ['name', 'type', 'price'],
    },
    permission: 'products.create',
    async prepare(_ctx, input) {
      const payload = productSchema.parse(
        pick(input, ['name', 'code', 'type', 'price', 'cost', 'unit', 'groupName', 'minStock']),
      );
      return {
        payload,
        summary: lines(
          payload.type === 'service' ? 'Novo serviço' : 'Novo produto',
          line('Nome', payload.name),
          line('Código', payload.code),
          line('Preço', money(payload.price)),
          line('Custo', money(payload.cost)),
          line('Unidade', payload.type === 'product' ? payload.unit : null),
          line('Grupo', payload.groupName),
          line('Estoque mínimo', payload.minStock),
        ),
      };
    },
    async execute(ctx, payload) {
      const row = await createProduct(ctx, payload as z.input<typeof productSchema>);
      return {
        message: `${row.type === 'service' ? 'Serviço' : 'Produto'} ${row.name} cadastrado.`,
        path: '/produtos',
      };
    },
  },
  opportunity: {
    tool: 'propor_oportunidade_crm',
    description:
      'Prepara uma OPORTUNIDADE no CRM (negócio em andamento) para o usuário conferir e confirmar. Não grava ' +
      'nada. customerId vem de buscar_cliente; sem cliente cadastrado, use contactName e contactPhone.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Ex.: Reforma da cozinha' },
        customerId: { type: 'number' },
        contactName: { type: 'string' },
        contactPhone: { type: 'string' },
        contactEmail: { type: 'string' },
        source: { type: 'string', description: 'Origem, ex.: Indicação, Instagram, Telefone' },
        estimatedValue: { type: 'number' },
        expectedCloseDate: { type: 'string', description: 'AAAA-MM-DD' },
        nextAction: { type: 'string', description: 'Próximo passo combinado' },
        nextActionAt: { type: 'string', description: 'AAAA-MM-DD' },
      },
      required: ['title', 'source'],
    },
    permission: 'opportunities.create',
    async prepare(ctx, input) {
      const payload = opportunitySchema.parse(
        pick(input, [
          'title',
          'customerId',
          'contactName',
          'contactPhone',
          'contactEmail',
          'source',
          'estimatedValue',
          'expectedCloseDate',
          'nextAction',
          'nextActionAt',
        ]),
      );
      return {
        payload,
        summary: lines(
          'Nova oportunidade no CRM',
          line('Título', payload.title),
          line('Cliente', await customerName(ctx, payload.customerId)),
          line('Contato', payload.contactName),
          line('Telefone', payload.contactPhone),
          line('E-mail', payload.contactEmail),
          line('Origem', payload.source),
          line('Valor estimado', money(payload.estimatedValue)),
          line('Previsão de fechamento', payload.expectedCloseDate),
          line('Próxima ação', payload.nextAction),
          line('Data da próxima ação', payload.nextActionAt),
        ),
      };
    },
    async execute(ctx, payload) {
      const row = await createOpportunity(ctx, payload as z.input<typeof opportunitySchema>);
      return { message: `Oportunidade "${row.title}" criada no CRM.`, path: `/crm/${row.id}` };
    },
  },
  quote: {
    tool: 'propor_rascunho_orcamento',
    description:
      'Prepara um ORÇAMENTO em rascunho para o usuário conferir e confirmar. Não grava nada. customerId vem de ' +
      'buscar_cliente e productId de buscar_produto; item sem produto cadastrado leva description e unitPrice.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'number' },
        validUntil: { type: 'string', description: 'Validade, AAAA-MM-DD' },
        notes: { type: 'string', description: 'Observações para o cliente' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'number' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
            },
            required: ['quantity'],
          },
        },
      },
      required: ['items'],
    },
    permission: 'quotes.create',
    async prepare(ctx, input) {
      const raw = (input ?? {}) as { items?: unknown[] };
      const payload = quoteSchema.parse({
        ...pick(input, ['customerId', 'validUntil', 'notes']),
        items: (raw.items ?? []).map((item) =>
          pick(item, ['productId', 'description', 'quantity', 'unitPrice']),
        ),
      });
      const names = await productNames(
        ctx,
        payload.items.flatMap((item) => (item.productId ? [item.productId] : [])),
      );
      const itemLines = payload.items.map((item) => {
        const name = item.productId ? names.get(item.productId) : item.description;
        if (item.productId && !name) throw new AppError(400, `Produto ${item.productId} não encontrado.`);
        const price = item.unitPrice === undefined ? 'preço do cadastro' : money(item.unitPrice);
        return `- ${item.quantity} × ${name} (${price})`;
      });
      return {
        payload,
        summary: lines(
          'Novo orçamento (rascunho)',
          line('Cliente', await customerName(ctx, payload.customerId)),
          line('Validade', payload.validUntil),
          'Itens:',
          ...itemLines,
          line('Observações', payload.notes),
        ),
      };
    },
    async execute(ctx, payload) {
      const row = await createQuote(ctx, payload as z.input<typeof quoteSchema>);
      return {
        message: 'Orçamento criado em rascunho. Confira e envie pela tela do orçamento.',
        path: `/orcamentos/${row.id}`,
      };
    },
  },
} satisfies Record<string, ActionDefinition>;

export type ActionKind = keyof typeof ACTIONS;
const KINDS = Object.keys(ACTIONS) as ActionKind[];

export const ACTION_TOOLS = KINDS.map((kind) => ({ kind, ...ACTIONS[kind] }));

// Mensagem de erro de validação legível para o modelo corrigir ou perguntar ao usuário.
function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || 'dados'}: ${issue.message}`).join('; ');
}

export async function proposeAction(ctx: Ctx, kind: ActionKind, input: unknown, session: ToolSession) {
  const action = ACTIONS[kind];
  authorize(ctx, action.permission);
  let prepared: { payload: unknown; summary: string };
  try {
    prepared = await action.prepare(ctx, input);
  } catch (error) {
    if (error instanceof z.ZodError) return { erro: `Dados inválidos: ${validationMessage(error)}` };
    if (error instanceof AppError) return { erro: error.message };
    throw error;
  }
  const expiresAt = new Date(Date.now() + ACTION_TTL_MS);
  // Limpeza: pedidos antigos (resolvidos ou vencidos) não ficam guardados.
  await db.delete(aiPendingActions).where(lt(aiPendingActions.createdAt, sql`now() - interval '1 day'`));
  const [row] = await db
    .insert(aiPendingActions)
    .values({
      companyId: ctx.companyId,
      userId: ctx.userId,
      channel: session.channel,
      kind,
      payload: prepared.payload,
      summary: prepared.summary,
      expiresAt,
    })
    .returning({ id: aiPendingActions.id });
  if (!row) throw new Error('Falha ao criar a ação pendente.');
  session.actions.push({ id: row.id, kind, summary: prepared.summary, expiresAt: expiresAt.toISOString() });
  return {
    acaoPendente: true,
    resumo: prepared.summary,
    instrucao:
      'Nada foi gravado. Diga ao usuário para conferir o resumo e clicar em Confirmar (vale 10 minutos). ' +
      'Não repita o resumo inteiro.',
  };
}

const idSchema = z.uuid('Ação inválida.');

// Reserva a ação (pending -> confirming) numa única atualização: dois cliques não gravam duas vezes.
async function claim(ctx: Ctx, id: string, status: 'confirming' | 'cancelled') {
  const [row] = await db
    .update(aiPendingActions)
    .set({ status, resolvedAt: new Date() })
    .where(
      and(
        eq(aiPendingActions.id, id),
        eq(aiPendingActions.userId, ctx.userId),
        eq(aiPendingActions.companyId, ctx.companyId),
        eq(aiPendingActions.status, 'pending'),
        gt(aiPendingActions.expiresAt, new Date()),
      ),
    )
    .returning();
  return row;
}

async function explainMissing(ctx: Ctx, id: string): Promise<never> {
  const [row] = await db
    .select({ status: aiPendingActions.status, expiresAt: aiPendingActions.expiresAt })
    .from(aiPendingActions)
    .where(and(eq(aiPendingActions.id, id), eq(aiPendingActions.userId, ctx.userId)));
  if (!row) throw notFound('Ação não encontrada.');
  if (row.status === 'confirmed') throw new AppError(409, 'Esta ação já foi confirmada.');
  if (row.status === 'cancelled') throw new AppError(409, 'Esta ação foi cancelada.');
  if (row.status === 'failed')
    throw new AppError(409, 'Esta ação falhou. Peça ao assistente para preparar de novo.');
  throw new AppError(409, 'A ação venceu (10 minutos). Peça ao assistente para preparar de novo.');
}

// Confirma e grava pelo serviço da tela. O ator da auditoria é o canal: assistente (web) ou Telegram.
export async function confirmAction(ctx: Ctx, rawId: unknown) {
  const id = idSchema.parse(rawId);
  const row = await claim(ctx, id, 'confirming');
  if (!row) return explainMissing(ctx, id);
  const action = ACTIONS[row.kind as ActionKind];
  if (!action) throw new AppError(400, 'Tipo de ação desconhecido.');
  const actor = row.channel === 'telegram' ? 'telegram' : 'assistant';
  try {
    const result = await action.execute({ ...ctx, actor }, row.payload);
    await db
      .update(aiPendingActions)
      .set({ status: 'confirmed', resultPath: result.path })
      .where(eq(aiPendingActions.id, id));
    return result;
  } catch (error) {
    await db.update(aiPendingActions).set({ status: 'failed' }).where(eq(aiPendingActions.id, id));
    throw error;
  }
}

export async function cancelAction(ctx: Ctx, rawId: unknown) {
  const id = idSchema.parse(rawId);
  if (!(await claim(ctx, id, 'cancelled'))) return explainMissing(ctx, id);
  return { message: 'Ação cancelada. Nada foi gravado.' };
}
