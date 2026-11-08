import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
});
afterAll(() => app.close());

describe('layout do dashboard', () => {
  it('cada usuário guarda o próprio layout; null volta ao padrão', async () => {
    expect((await owner.get('/preferences/dashboard')).body).toBeNull();
    const layout = {
      blocks: [
        { id: 'revenue_month', size: 'S' },
        { id: 'sales_chart', size: 'L' },
      ],
    };
    expect((await owner.put('/preferences/dashboard', { layout })).body).toEqual(layout);
    expect((await owner.get('/preferences/dashboard')).body).toEqual(layout);

    const accountant = await addMember(app, owner, 'accountant');
    expect((await accountant.get('/preferences/dashboard')).body).toBeNull();

    await owner.put('/preferences/dashboard', { layout: null });
    expect((await owner.get('/preferences/dashboard')).body).toBeNull();
  });

  it('confere o formato', async () => {
    const bad = [
      { blocks: [{ id: 'x', size: 'XL' }] },
      { blocks: [{ id: 'Nome com espaço', size: 'S' }] },
      {
        blocks: [
          { id: 'a', size: 'S' },
          { id: 'a', size: 'M' },
        ],
      },
    ];
    for (const layout of bad)
      expect((await owner.put('/preferences/dashboard', { layout })).status).toBe(400);
  });

  it('quem não vê a visão geral não tem layout', async () => {
    const seller = await addMember(app, owner, 'seller');
    expect((await seller.get('/preferences/dashboard')).status).toBe(403);
  });
});

describe('dados dos blocos', () => {
  it('vendas dos 12 meses, mais vendidos, a receber, orçamentos aguardando e CRM', async () => {
    const product = (await owner.post('/products', { name: 'Gelo', type: 'service', price: 10 })).body.id;
    await owner.post('/orders', { orderDate: today(), items: [{ productId: product, quantity: 3 }] });
    const quote = (await owner.post('/quotes', { items: [{ productId: product, quantity: 2 }] })).body;
    await owner.post(`/quotes/${quote.id}/send`);

    const { body } = await owner.get('/dashboard');
    expect(body.salesByMonth).toHaveLength(12);
    expect(body.salesByMonth.at(-1)).toEqual({ month: today().slice(0, 7), total: 30 });
    expect(body.topProducts).toEqual([{ name: 'Gelo', quantity: 3, total: 30 }]);
    expect(body.receivables).toEqual({ open: 30, overdue: 0 });
    expect(body.quotesAwaiting).toEqual({ count: 1, total: 20 });
    expect(body.crm).toMatchObject({ open: 0, wonMonth: 0 });
  });

  it('dado sem permissão não vem', async () => {
    const group = await owner.post('/access-groups', {
      name: 'Só indicadores',
      permissions: ['analytics.read'],
    });
    const viewer = await addMember(app, owner, group.body.id);
    const { body } = await viewer.get('/dashboard');
    expect(body).toMatchObject({
      receivables: null,
      quotesAwaiting: null,
      salesByMonth: null,
      topProducts: null,
      crm: null,
    });
  });
});
