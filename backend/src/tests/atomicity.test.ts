import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { and, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import {
  aiPendingActions,
  attachments,
  auditLogs,
  companies,
  orders,
  receivables,
  type stockMovements,
  users,
} from '../db/schema.ts';
import { type Client, createApp, login, ownerExecute, PASSWORD, signupCompany, today } from './helpers.ts';

// Operações que gravam em várias tabelas acontecem inteiras ou não acontecem. Cada teste faz o banco
// recusar um passo do meio (trigger temporário que levanta erro) e confere que nada ficou gravado.

let app: FastifyInstance;
let owner: Client;
let accountId: number;
let customerId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  accountId = (
    await owner.post('/bank-accounts', {
      bankName: 'Banco',
      accountName: 'Conta',
      accountType: 'checking',
      initialBalance: 0,
    })
  ).body.id;
  customerId = (await owner.post('/customers', { name: 'Cliente' })).body.id;
});
afterAll(() => app.close());

// Faz o banco recusar `operation` em `table` enquanto `run` executa.
async function failingOn(table: string, operation: 'INSERT' | 'UPDATE', run: () => Promise<void>) {
  const name = `falha_simulada_${table}`;
  await ownerExecute(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada em ${table}'; END $$`,
  );
  await ownerExecute(
    `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`,
  );
  try {
    await run();
  } finally {
    await ownerExecute(`DROP TRIGGER ${name} ON ${table}`);
    await ownerExecute(`DROP FUNCTION ${name}()`);
  }
}

const newProduct = async (stock: number) =>
  (await owner.post('/products', { name: `Produto ${randomUUID()}`, type: 'product', price: 50, stock })).body
    .id as number;
const stockOf = async (id: number) => (await owner.get(`/products/${id}`)).body.stock as number;
const rowsOf = async (table: typeof orders | typeof receivables | typeof stockMovements) => {
  const [row] = await db.select({ total: count() }).from(table).where(eq(table.companyId, owner.companyId));
  return row?.total ?? 0;
};
const paidOrder = async (productId: number) =>
  (
    await owner.post('/orders', {
      orderDate: today(),
      status: 'paid',
      bankAccountId: accountId,
      items: [{ productId, quantity: 1 }],
    })
  ).body;

describe('operações inteiras ou nenhuma', () => {
  it('venda paga: falha no caixa desfaz pedido, itens, estoque e contas a receber', async () => {
    const productId = await newProduct(5);
    const before = { orders: await rowsOf(orders), receivables: await rowsOf(receivables) };
    await failingOn('cash_transactions', 'INSERT', async () => {
      expect(
        (
          await owner.post('/orders', {
            orderDate: today(),
            status: 'paid',
            bankAccountId: accountId,
            items: [{ productId, quantity: 2 }],
          })
        ).status,
      ).toBe(500);
    });
    expect(await rowsOf(orders)).toBe(before.orders);
    expect(await rowsOf(receivables)).toBe(before.receivables);
    expect(await stockOf(productId)).toBe(5);
  });

  it('estorno de baixa: falha na auditoria mantém a baixa, o título e o caixa', async () => {
    const order = await paidOrder(await newProduct(5));
    const paymentId = order.payments[0].id as number;
    const cashBefore = (await owner.get('/transactions')).body.length;
    await failingOn('audit_logs', 'INSERT', async () => {
      const response = await owner.post(`/receivable-payments/${paymentId}/reverse`, {
        reason: 'Pix devolvido',
        password: PASSWORD,
      });
      expect(response.status).toBe(500);
    });
    const after = (await owner.get(`/orders/${order.id}`)).body;
    expect(after.status).toBe('paid');
    expect(after.payments[0].reversedAt).toBeNull();
    expect((await owner.get('/transactions')).body.length).toBe(cashBefore);
  });

  it('cancelamento: falha no extrato do estoque mantém o pedido e o estoque', async () => {
    const productId = await newProduct(5);
    const order = (await owner.post('/orders', { orderDate: today(), items: [{ productId, quantity: 2 }] }))
      .body;
    expect(await stockOf(productId)).toBe(3);
    await failingOn('stock_movements', 'INSERT', async () => {
      const response = await owner.put(`/orders/${order.id}`, { status: 'cancelled', reason: 'Desistiu' });
      expect(response.status).toBe(500);
    });
    expect((await owner.get(`/orders/${order.id}`)).body.status).toBe(order.status);
    expect(await stockOf(productId)).toBe(3);
  });

  it('conversão de orçamento: falha depois de criar o pedido desfaz o pedido e mantém o orçamento', async () => {
    const productId = await newProduct(5);
    const quote = (await owner.post('/quotes', { customerId, items: [{ productId, quantity: 1 }] })).body;
    await owner.post(`/quotes/${quote.id}/send`);
    await owner.post(`/quotes/${quote.id}/approve`);
    const ordersBefore = await rowsOf(orders);
    await failingOn('stock_movements', 'INSERT', async () => {
      expect((await owner.post(`/quotes/${quote.id}/convert`, { orderDate: today() })).status).toBe(500);
    });
    expect((await owner.get(`/quotes/${quote.id}`)).body.status).toBe('approved');
    expect(await rowsOf(orders)).toBe(ordersBefore);
    expect(await stockOf(productId)).toBe(5);
    // Sem o erro, a mesma conversão funciona: nada ficou pela metade.
    expect((await owner.post(`/quotes/${quote.id}/convert`, { orderDate: today() })).status).toBe(201);
  });

  it('cadastro de empresa: falha ao criar a sessão não deixa empresa nem usuário', async () => {
    const email = `atomico-${randomUUID()}@teste.test`;
    const companyName = `Empresa ${randomUUID()}`;
    await failingOn('sessions', 'INSERT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { companyName, name: 'Dona', email, password: PASSWORD },
      });
      expect(response.statusCode).toBe(500);
    });
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    expect(await db.select().from(companies).where(eq(companies.name, companyName))).toHaveLength(0);
    // O mesmo cadastro depois funciona: o e-mail não ficou preso.
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { companyName, name: 'Dona', email, password: PASSWORD },
    });
    expect(again.statusCode).toBe(201);
  });

  it('login: falha ao criar a sessão não registra login na auditoria', async () => {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.companyId, owner.companyId));
    const logins = async () => {
      const [row] = await db
        .select({ total: count() })
        .from(auditLogs)
        .where(and(eq(auditLogs.userId, user?.id ?? 0), eq(auditLogs.action, 'login')));
      return row?.total ?? 0;
    };
    const before = await logins();
    await failingOn('sessions', 'INSERT', async () => {
      expect((await login(app, user?.email ?? '')).statusCode).toBe(500);
    });
    expect(await logins()).toBe(before);
  });

  it('ação do assistente presa entre gravar e marcar como confirmada não grava de novo e explica', async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.companyId, owner.companyId));
    // Estado de quando o servidor cai depois de gravar o cadastro e antes de marcar a ação como confirmada.
    const [action] = await db
      .insert(aiPendingActions)
      .values({
        companyId: owner.companyId,
        userId: user?.id ?? 0,
        channel: 'web',
        kind: 'customer',
        payload: { name: 'Cliente da ação' },
        summary: 'Novo cliente',
        status: 'confirming',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .returning({ id: aiPendingActions.id });
    const response = await owner.post(`/assistant/actions/${action?.id}/confirm`);
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/já foi enviada para gravação/);
  });

  it('exclusão de anexo: falha na auditoria mantém a linha e o arquivo', async () => {
    const opportunityId = (await owner.post('/opportunities', { title: 'Anexo', customerId, source: 'Site' }))
      .body.id;
    const content = Buffer.from('arquivo de teste');
    const created = await owner.post(`/opportunities/${opportunityId}/attachments`, {
      name: 'nota.txt',
      mimeType: 'text/plain',
      size: content.length,
    });
    await app.inject({
      method: 'PUT',
      url: created.body.upload.url,
      headers: created.body.upload.headers,
      payload: content,
    });
    expect((await owner.post(`/attachments/${created.body.id}/complete`)).status).toBe(200);
    const [row] = await db.select().from(attachments).where(eq(attachments.id, created.body.id));
    const stored = path.resolve('.uploads-test', row?.storageKey ?? '');
    expect(existsSync(stored)).toBe(true);

    await failingOn('audit_logs', 'INSERT', async () => {
      expect((await owner.del(`/attachments/${created.body.id}`)).status).toBe(500);
    });
    expect(await db.select().from(attachments).where(eq(attachments.id, created.body.id))).toHaveLength(1);
    expect(existsSync(stored)).toBe(true);
  });
});
