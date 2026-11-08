import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (await owner.post('/products', { name: 'Gelo', type: 'service', price: 10 })).body.id;
});
afterAll(() => app.close());

const addDays = (days: number) =>
  new Date(Date.parse(`${today()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('entrega no pedido', () => {
  it('previsão no pedido, entrada na agenda, marcar e desfazer com histórico', async () => {
    const forecast = addDays(3);
    const order = (
      await owner.post('/orders', {
        orderDate: today(),
        deliveryDate: forecast,
        items: [{ productId, quantity: 1 }],
      })
    ).body;
    expect(order).toMatchObject({ deliveryDate: forecast, deliveredOn: null });

    const agenda = (await owner.get(`/agenda?from=${today()}&to=${addDays(7)}`)).body;
    expect(agenda).toContainEqual(
      expect.objectContaining({ kind: 'delivery', path: `/pedidos/${order.id}` }),
    );

    const delivered = (await owner.post(`/orders/${order.id}/delivery`, { delivered: true })).body;
    expect(delivered.deliveredOn).toBe(today());
    const after = (await owner.get(`/agenda?from=${today()}&to=${addDays(7)}`)).body;
    expect(after.some((row: { kind: string }) => row.kind === 'delivery')).toBe(false);

    expect(
      (await owner.post(`/orders/${order.id}/delivery`, { delivered: false })).body.deliveredOn,
    ).toBeNull();
    const entry = (await owner.get('/history')).body.rows[0];
    expect(entry.summary).toMatch(/entregue em/i);

    // A previsão muda pela edição do pedido.
    const edited = (await owner.put(`/orders/${order.id}`, { deliveryDate: addDays(5) })).body;
    expect(edited.deliveryDate).toBe(addDays(5));
  });

  it('cancelado não entrega; sem permissão de editar, não marca', async () => {
    const order = (await owner.post('/orders', { orderDate: today(), items: [{ productId, quantity: 1 }] }))
      .body;
    await owner.put(`/orders/${order.id}`, { status: 'cancelled', reason: 'Teste' });
    expect((await owner.post(`/orders/${order.id}/delivery`, { delivered: true })).status).toBe(409);

    const accountant = await addMember(app, owner, 'accountant');
    expect((await accountant.post(`/orders/${order.id}/delivery`, { delivered: true })).status).toBe(403);
  });
});
