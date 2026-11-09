import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let other: Client;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  other = await signupCompany(app);
});
afterAll(() => app.close());

const product = async (name: string, stock: number | null, client = owner) =>
  (
    await client.post('/products', {
      name,
      type: stock === null ? 'service' : 'product',
      price: 10,
      stock,
    })
  ).body as { id: number };
const stockOf = async (id: number) => (await owner.get(`/products/${id}`)).body.stock as number;

describe('inventário', () => {
  it('ajusta só o que mudou, numa contagem por produto no extrato, com o motivo', async () => {
    const beer = await product('Cerveja', 24);
    const ice = await product('Gelo', 10);
    const response = await owner.post('/products/inventory', {
      reason: 'Inventário de novembro',
      items: [
        { productId: beer.id, counted: 20 },
        { productId: ice.id, counted: 10 },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ adjusted: 1, unchanged: 1 });
    expect(await stockOf(beer.id)).toBe(20);
    expect(await stockOf(ice.id)).toBe(10);

    const movements = (await owner.get(`/products/${beer.id}/stock-movements`)).body;
    expect(movements[0]).toMatchObject({
      kind: 'count',
      quantity: -4,
      balance: 20,
      reason: 'Inventário de novembro',
    });
    expect((await owner.get(`/products/${ice.id}/stock-movements`)).body).toHaveLength(1);
  });

  it('serviço, produto de outra empresa ou repetido recusam o inventário inteiro', async () => {
    const beer = await product('Refrigerante', 12);
    const service = await product('Entrega', null);
    const foreign = await product('Outro', 5, other);
    const counted = { productId: beer.id, counted: 3 };
    for (const wrong of [
      { productId: service.id, counted: 1 },
      { productId: foreign.id, counted: 1 },
      { productId: beer.id, counted: 2 },
    ]) {
      const response = await owner.post('/products/inventory', {
        reason: 'Contagem',
        items: [counted, wrong],
      });
      expect(response.status).toBe(400);
    }
    // Nada mudou: o inventário com erro não grava nenhuma linha.
    expect(await stockOf(beer.id)).toBe(12);
  });

  it('exige motivo, quantidade não negativa e a permissão de ajustar estoque', async () => {
    const beer = await product('Água', 30);
    expect(
      (await owner.post('/products/inventory', { reason: '', items: [{ productId: beer.id, counted: 1 }] }))
        .status,
    ).toBe(400);
    expect(
      (await owner.post('/products/inventory', { reason: 'X', items: [{ productId: beer.id, counted: -1 }] }))
        .status,
    ).toBe(400);
    const seller = await addMember(app, owner, 'seller');
    expect(
      (await seller.post('/products/inventory', { reason: 'X', items: [{ productId: beer.id, counted: 1 }] }))
        .status,
    ).toBe(403);
  });
});
