import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (await owner.post('/products', { name: 'Montagem', type: 'service', price: 50 })).body.id;
});
afterAll(() => app.close());

const newOrder = (extra: Record<string, unknown> = {}) =>
  owner.post('/orders', { orderDate: today(), items: [{ productId, quantity: 1 }], ...extra });

describe('número do pedido do cliente', () => {
  it('fica no pedido, sem espaços nas pontas, e vazio vira nulo', async () => {
    const order = (await newOrder({ customerOrderNumber: '  OC-2026/118 ' })).body;
    expect(order.customerOrderNumber).toBe('OC-2026/118');
    expect((await newOrder({ customerOrderNumber: '' })).body.customerOrderNumber).toBeNull();
  });

  it('muda pela edição e a mudança entra no histórico', async () => {
    const order = (await newOrder()).body;
    const edited = (await owner.put(`/orders/${order.id}`, { customerOrderNumber: 'PO-7781' })).body;
    expect(edited.customerOrderNumber).toBe('PO-7781');
    // Editar outra coisa não apaga o número.
    const again = (await owner.put(`/orders/${order.id}`, { notes: 'Entregar pela manhã' })).body;
    expect(again.customerOrderNumber).toBe('PO-7781');
    const entry = (await owner.get('/history')).body.rows.find((row: { summary: string }) =>
      /ordem de compra/i.test(row.summary),
    );
    expect(entry).toBeTruthy();
  });

  it('a lista e a busca rápida acham o pedido pelo número do cliente', async () => {
    const order = (await newOrder({ customerOrderNumber: 'OC-ZETA-55' })).body;
    const page = (await owner.get('/orders?page=1&q=zeta-55')).body;
    expect(page.rows.map((row: { id: number }) => row.id)).toEqual([order.id]);
    const results = (await owner.get('/search?q=OC-ZETA')).body as {
      type: string;
      id: number;
      detail: string;
    }[];
    const found = results.find((row) => row.type === 'order' && row.id === order.id);
    expect(found?.detail).toContain('OC-ZETA-55');
  });

  it('número longo demais é recusado', async () => {
    expect((await newOrder({ customerOrderNumber: 'X'.repeat(41) })).status).toBe(400);
  });
});
