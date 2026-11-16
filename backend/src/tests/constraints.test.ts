import { eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import {
  orderItems,
  people,
  personAddresses,
  products,
  receivables,
  salesGoals,
  users,
} from '../db/schema.ts';
import { pgCode } from '../lib/pgError.ts';
import { type Client, createApp, ownerExecute, signupCompany, today } from './helpers.ts';

// As regras das validações da tela também moram no banco (migrations 0040 a 0043): uma gravação que
// pule a API, um script ou um bug não deixa valor fora das regras.

let app: FastifyInstance;
let owner: Client;
let productId: number;
let orderId: number;
let customerId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (await owner.post('/products', { name: 'Caneca', type: 'product', price: 30, stock: 10 })).body
    .id;
  customerId = (await owner.post('/customers', { name: 'Cliente' })).body.id;
  orderId = (
    await owner.post('/orders', { orderDate: today(), customerId, items: [{ productId, quantity: 1 }] })
  ).body.id;
});
afterAll(() => app.close());

async function rejected(write: () => Promise<unknown>) {
  try {
    await write();
  } catch (error) {
    return pgCode(error);
  }
  return 'gravou';
}

describe('regras no banco', () => {
  it('recusa valores fora das regras mesmo gravando direto, sem passar pela API', async () => {
    const CHECK = '23514';
    expect(
      await rejected(() => db.update(products).set({ price: -1 }).where(eq(products.id, productId))),
    ).toBe(CHECK);
    expect(
      await rejected(() => db.update(products).set({ stock: -1 }).where(eq(products.id, productId))),
    ).toBe(CHECK);
    // Itens de pedido só aceitam inserção (permissões do arandue_app): a regra vale na inserção.
    expect(
      await rejected(() =>
        db.insert(orderItems).values({ orderId, productId, quantity: 0, unitPrice: 30, subtotal: 0 }),
      ),
    ).toBe(CHECK);
    expect(
      await rejected(() =>
        db
          .update(receivables)
          .set({ paidAmount: sql`${receivables.amount} + 1` })
          .where(eq(receivables.orderId, orderId)),
      ),
    ).toBe(CHECK);
    expect(
      await rejected(() =>
        db
          .insert(salesGoals)
          .values({ companyId: owner.companyId, month: '2026-11-15', userId: null, amount: 10 }),
      ),
    ).toBe(CHECK);
    expect(
      await rejected(() => db.update(people).set({ document: '123.456' }).where(eq(people.id, customerId))),
    ).toBe(CHECK);
    expect(
      await rejected(() =>
        db.insert(personAddresses).values({ personId: customerId, kind: 'delivery', zip: '78000-1' }),
      ),
    ).toBe(CHECK);
    // Valores dentro das regras continuam passando.
    expect(
      await rejected(() => db.update(people).set({ zip: '78000' }).where(eq(people.id, customerId))),
    ).toBe('gravou');
  });

  it('valor recusado por uma regra do banco chega à tela como 400, não como erro interno', async () => {
    await ownerExecute(
      "ALTER TABLE bank_accounts ADD CONSTRAINT teste_banco_recusado CHECK (bank_name <> 'Recusado')",
    );
    try {
      const response = await owner.post('/bank-accounts', {
        bankName: 'Recusado',
        accountName: 'Conta',
        accountType: 'checking',
        initialBalance: 0,
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Valor fora das regras do sistema.');
    } finally {
      await ownerExecute('ALTER TABLE bank_accounts DROP CONSTRAINT teste_banco_recusado');
    }
  });

  it('dois usuários nunca ficam com o mesmo código de vínculo do Telegram', async () => {
    const other = await signupCompany(app);
    const all = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.companyId, [owner.companyId, other.companyId]))
      .limit(2);
    const [first, second] = all;
    if (!first || !second) throw new Error('São precisos dois usuários.');
    const later = new Date(Date.now() + 60_000);
    await db
      .update(users)
      .set({ telegramLinkCode: 'mesmo', telegramLinkExpiresAt: later })
      .where(eq(users.id, first.id));
    expect(
      await rejected(() =>
        db
          .update(users)
          .set({ telegramLinkCode: 'mesmo', telegramLinkExpiresAt: later })
          .where(eq(users.id, second.id)),
      ),
    ).toBe('23505');
    await db
      .update(users)
      .set({ telegramLinkCode: null, telegramLinkExpiresAt: null })
      .where(eq(users.id, first.id));
  });
});
