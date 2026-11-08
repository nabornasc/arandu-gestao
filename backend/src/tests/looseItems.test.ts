import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let beer: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  beer = (await owner.post('/products', { name: 'Cerveja', type: 'product', price: 5, stock: 10 })).body.id;
});
afterAll(() => app.close());

const LOOSE = { description: 'Frete de gelo seco', quantity: 1, unitPrice: 35 };

describe('item avulso', () => {
  it('entra no orçamento e no pedido sem produto, não mexe no estoque e aparece nos relatórios', async () => {
    expect((await owner.post('/quotes', { items: [{ quantity: 1, unitPrice: 10 }] })).status).toBe(400);
    expect((await owner.post('/quotes', { items: [{ description: 'Sem preço', quantity: 1 }] })).status).toBe(
      400,
    );

    const quote = (await owner.post('/quotes', { items: [{ productId: beer, quantity: 2 }, LOOSE] })).body;
    expect(quote.total).toBe(45);
    expect(quote.items[1]).toMatchObject({
      productId: null,
      productName: 'Frete de gelo seco',
      subtotal: 35,
    });
    const mirror = (await owner.get(`/quotes/${quote.id}/mirror`)).body;
    expect(mirror.items.map((item: { name: string }) => item.name)).toEqual([
      'Cerveja',
      'Frete de gelo seco',
    ]);

    // Convertido em pedido, o avulso vai junto e só a cerveja baixa o estoque.
    await owner.post(`/quotes/${quote.id}/send`);
    await owner.post(`/quotes/${quote.id}/approve`);
    const order = (await owner.post(`/quotes/${quote.id}/convert`, { orderDate: today() })).body;
    expect(order.items.map((item: { productName: string }) => item.productName)).toEqual([
      'Cerveja',
      'Frete de gelo seco',
    ]);
    expect((await owner.get(`/products/${beer}`)).body.stock).toBe(8);

    const report = (await owner.get('/reports/order_items')).body;
    expect(JSON.stringify(report)).toContain('Frete de gelo seco');

    // Duplicar e editar mantêm o avulso.
    const copy = (await owner.post(`/orders/${order.id}/duplicate`, { orderDate: today() })).body;
    expect(copy.items[1]).toMatchObject({ productId: null, description: 'Frete de gelo seco' });
  });

  it('metro linear: só o comprimento vira a quantidade em metros', async () => {
    const quote = (
      await owner.post('/quotes', {
        items: [{ productId: beer, quantity: 1, unitPrice: 10, length: 250, measureUnit: 'cm' }],
      })
    ).body;
    expect(quote.items[0]).toMatchObject({ quantity: 2.5, length: 250, width: null, measureUnit: 'cm' });
    expect(quote.total).toBe(25);
    expect(
      (await owner.post('/quotes', { items: [{ productId: beer, quantity: 1, width: 2 }] })).status,
    ).toBe(400);
  });
});
