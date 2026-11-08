import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let seller: Client;
let sellerId: number;
let productId: number;
const month = today().slice(0, 7);

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  seller = await addMember(app, owner, 'seller');
  sellerId = (await seller.get('/auth/me')).body.id;
  productId = (await owner.post('/products', { name: 'Serviço', type: 'service', price: 100 })).body.id;
});
afterAll(() => app.close());

const sell = (client: Client, quantity: number) =>
  client.post('/orders', { orderDate: today(), items: [{ productId, quantity }] });

describe('metas de venda', () => {
  it('meta da empresa e por vendedor, com o realizado do mês sem cancelados', async () => {
    await sell(owner, 3);
    await sell(seller, 2);
    const cancelled = (await sell(seller, 5)).body;
    await owner.put(`/orders/${cancelled.id}`, { status: 'cancelled', reason: 'Teste' });

    const saved = await owner.put('/goals', {
      month,
      company: 1000,
      sellers: [{ userId: sellerId, amount: 400 }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.company).toEqual({ target: 1000, achieved: 500 });
    expect(saved.body.sellers.find((row: { userId: number }) => row.userId === sellerId)).toMatchObject({
      target: 400,
      achieved: 200,
    });

    // Valor vazio apaga; o histórico registra com o nome do vendedor.
    await owner.put('/goals', { month, company: 1200, sellers: [{ userId: sellerId, amount: null }] });
    const { body } = await owner.get(`/goals?month=${month}`);
    expect(body.company.target).toBe(1200);
    expect(body.sellers.find((row: { userId: number }) => row.userId === sellerId).target).toBeNull();
    const entry = (await owner.get('/history')).body.rows[0];
    expect(entry.summary).toMatch(/Meta da empresa|Meta de/);

    // O bloco da visão geral usa o mês corrente.
    expect((await owner.get('/dashboard')).body.goals.company).toEqual({ target: 1200, achieved: 500 });
  });

  it('valida e confere permissão e empresa', async () => {
    expect((await owner.put('/goals', { month: '2026-13', company: 1, sellers: [] })).status).toBe(400);
    expect((await owner.put('/goals', { month, company: -5, sellers: [] })).status).toBe(400);
    expect((await seller.put('/goals', { month, company: 1, sellers: [] })).status).toBe(403);
    const other = await signupCompany(app);
    expect(
      (await other.put('/goals', { month, company: null, sellers: [{ userId: sellerId, amount: 10 }] }))
        .status,
    ).toBe(400);
    expect((await other.get(`/goals?month=${month}`)).body.company).toEqual({ target: null, achieved: 0 });
  });
});
