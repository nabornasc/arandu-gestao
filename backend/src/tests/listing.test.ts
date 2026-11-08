import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (await owner.post('/products', { name: 'Serviço', type: 'service', price: 100 })).body.id;
});
afterAll(() => app.close());

const customer = async (name: string, client = owner) =>
  (await client.post('/customers', { name })).body.id as number;
const order = async (customerId: number, orderDate: string, extra: Record<string, unknown> = {}) =>
  (await owner.post('/orders', { customerId, orderDate, items: [{ productId, quantity: 1 }], ...extra }))
    .body;

describe('listas paginadas no servidor', () => {
  it('sem "page", a lista continua sendo um array simples', async () => {
    expect(Array.isArray((await owner.get('/orders')).body)).toBe(true);
    expect(Array.isArray((await owner.get('/receivables')).body)).toBe(true);
  });

  it('pedidos: texto sem acento, número, período, status e totais sobre todo o filtro', async () => {
    const joao = await customer('João Peçanha');
    const first = await order(joao, '2026-03-05');
    await order(joao, '2026-03-20');
    const cancelled = await order(joao, '2026-04-02');
    await owner.put(`/orders/${cancelled.id}`, { status: 'cancelled', reason: 'Desistiu' });

    const byText = (await owner.get('/orders?page=1&q=joao pecanha')).body;
    expect(byText).toMatchObject({ total: 3, page: 1, pageSize: 25 });
    // Cancelado não entra no valor vendido.
    expect(byText.totals).toEqual({ value: 200, pending: 200 });

    const byNumber = (await owner.get(`/orders?page=1&q=%23${first.number}`)).body;
    expect(byNumber.rows.map((row: { id: number }) => row.id)).toEqual([first.id]);

    const march = (await owner.get('/orders?page=1&q=pecanha&from=2026-03-01&to=2026-03-31')).body;
    expect(march.total).toBe(2);
    const onlyCancelled = (await owner.get('/orders?page=1&q=pecanha&status=cancelled')).body;
    expect(onlyCancelled.rows.map((row: { id: number }) => row.id)).toEqual([cancelled.id]);
  });

  it('a página corta as linhas, mas o total e as somas contam tudo', async () => {
    for (let index = 0; index < 27; index++) {
      await owner.post('/expenses', {
        description: `Gelo lote ${index}`,
        category: 'Insumos',
        amount: 10,
        expenseDate: today(),
        status: index < 7 ? 'paid' : 'pending',
      });
    }
    const first = (await owner.get('/expenses?page=1&pageSize=25&q=gelo lote')).body;
    expect(first.rows).toHaveLength(25);
    expect(first).toMatchObject({ total: 27, totals: { amount: 270, paid: 70, pending: 200 } });
    const second = (await owner.get('/expenses?page=2&pageSize=25&q=gelo lote')).body;
    expect(second.rows).toHaveLength(2);
    const ids = new Set([...first.rows, ...second.rows].map((row: { id: number }) => row.id));
    expect(ids.size).toBe(27);
  });

  it('contas a receber: a parcela "2/3" continua certa com filtro de período', async () => {
    const id = await customer('Cliente parcelado');
    const created = await order(id, today(), {
      items: [{ productId, quantity: 3 }],
      installments: [
        { dueDate: '2031-01-10', amount: 100, method: 'Pix' },
        { dueDate: '2031-02-10', amount: 100, method: 'Pix' },
        { dueDate: '2031-03-10', amount: 100, method: 'Pix' },
      ],
    });
    const response = await owner.get('/receivables?page=1&from=2031-02-01&to=2031-02-28&status=open');
    const page = response.body;
    const row = page.rows.find((item: { orderId: number }) => item.orderId === created.id);
    expect(row).toMatchObject({ position: 2, titleCount: 3 });
    expect(page.totals).toMatchObject({ amount: 100, open: 100, overdue: 0 });
  });

  it('parâmetros inválidos voltam 400; o escopo "só os próprios" vale na página', async () => {
    expect((await owner.get('/orders?page=1&status=nada')).status).toBe(400);
    expect((await owner.get('/orders?page=1&pageSize=7')).status).toBe(400);
    expect((await owner.get('/orders?page=1&from=2026-05-01&to=2026-04-01')).status).toBe(400);

    const group = await owner.post('/access-groups', {
      name: 'Só os próprios',
      ownOnly: true,
      permissions: ['customers.read', 'customers.create', 'products.read', 'quotes.read', 'quotes.create'],
    });
    const member = await addMember(app, owner, group.body.id);
    const mine = await customer('Cliente do membro', member);
    await member.post('/quotes', { customerId: mine, items: [{ productId, quantity: 1 }] });
    await owner.post('/quotes', { customerId: mine, items: [{ productId, quantity: 2 }] });
    const page = (await member.get('/quotes?page=1')).body;
    expect(page.total).toBe(1);
    expect(page.totals.value).toBe(100);
  });
});
