import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import { orders } from '../db/schema.ts';
import { pgCode } from '../lib/pgError.ts';
import { runInRequestContext, setTenantCompany } from '../lib/tenant.ts';
import { type Client, createApp, signupCompany, today } from './helpers.ts';

// Isolamento entre empresas no próprio banco (migração 0045): mesmo uma consulta sem filtro de empresa,
// dentro da requisição de uma empresa, só enxerga as linhas dela.

let app: FastifyInstance;
let a: Client;
let b: Client;
let orderOfB: number;

beforeAll(async () => {
  app = await createApp();
  a = await signupCompany(app);
  b = await signupCompany(app);
  for (const client of [a, b]) {
    const productId = (
      await client.post('/products', { name: 'Caneca', type: 'product', price: 30, stock: 10 })
    ).body.id;
    const order = await client.post('/orders', { orderDate: today(), items: [{ productId, quantity: 1 }] });
    if (client === b) orderOfB = order.body.id;
  }
});
afterAll(() => app.close());

const inRequest = <T>(companyId: number | null, fn: () => Promise<T>) =>
  new Promise<T>((resolve, reject) =>
    runInRequestContext(() => {
      if (companyId !== null) setTenantCompany(companyId);
      fn().then(resolve, reject);
    }),
  );

// Empresas que aparecem numa consulta sem nenhum filtro de empresa.
const companiesSeen = async (table: 'orders' | 'products' | 'audit_logs') => {
  const rows = await db.execute<{ company_id: number }>(
    sql`SELECT DISTINCT company_id FROM ${sql.identifier(table)} ORDER BY 1`,
  );
  return rows.map((row) => row.company_id);
};

describe('isolamento entre empresas no banco', () => {
  it('consulta sem filtro de empresa só enxerga a empresa da requisição', async () => {
    for (const table of ['orders', 'products', 'audit_logs'] as const) {
      expect(await inRequest(a.companyId, () => companiesSeen(table))).toEqual([a.companyId]);
      expect(await inRequest(b.companyId, () => companiesSeen(table))).toEqual([b.companyId]);
    }
  });

  it('tabelas filhas seguem o pai: itens de pedido de outra empresa não aparecem', async () => {
    const seen = await inRequest(a.companyId, async () => {
      const rows = await db.execute<{ total: number }>(
        sql`SELECT count(*)::int AS total FROM order_items WHERE order_id = ${orderOfB}`,
      );
      return rows[0]?.total;
    });
    expect(seen).toBe(0);
  });

  it('não grava linha em nome de outra empresa', async () => {
    const code = await inRequest(a.companyId, async () => {
      try {
        await db.update(orders).set({ companyId: b.companyId }).where(sql`true`);
        return 'gravou';
      } catch (error) {
        return pgCode(error);
      }
    });
    // 42501: a linha nova não passa no WITH CHECK da policy.
    expect(code).toBe('42501');
  });

  it('requisição sem empresa e sem modo sistema não enxerga nada', async () => {
    expect(await inRequest(null, () => companiesSeen('orders'))).toEqual([]);
  });

  it('pela API, a empresa A continua sem acesso ao pedido da B', async () => {
    expect((await a.get(`/orders/${orderOfB}`)).status).toBe(404);
  });
});
