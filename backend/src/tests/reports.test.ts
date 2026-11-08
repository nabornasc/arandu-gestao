import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (
    await owner.post('/products', { name: 'Cerveja', type: 'product', price: 5, cost: 3, stock: 100 })
  ).body.id;
  const customerId = (await owner.post('/customers', { name: 'Bar do Teste' })).body.id;
  await owner.post('/orders', { customerId, orderDate: today(), items: [{ productId, quantity: 4 }] });
  await owner.post('/orders', { customerId, orderDate: '2026-01-10', items: [{ productId, quantity: 2 }] });
  await owner.post('/expenses', {
    description: '=SOMA(A1:A9)',
    category: 'Mercadorias',
    amount: 1234.5,
    expenseDate: today(),
    status: 'pending',
  });
});
afterAll(() => app.close());

const csv = (client: Client, path: string) =>
  app.inject({ method: 'GET', url: `/api${path}`, headers: { cookie: client.cookie } });

describe('relatórios', () => {
  it('lista só os relatórios dos módulos que o grupo vê', async () => {
    const all = (await owner.get('/reports')).body.map((report: { id: string }) => report.id);
    expect(all).toEqual(expect.arrayContaining(['orders', 'payables', 'stock_position', 'price_formation']));

    const seller = await addMember(app, owner, 'seller');
    const ids = (await seller.get('/reports')).body.map((report: { id: string }) => report.id);
    expect(ids).toContain('orders');
    expect(ids).not.toContain('payables');
    // Custo e margem exigem a permissão de ver custos.
    expect(ids).not.toContain('price_formation');
    expect((await seller.get('/reports/price_formation')).status).toBe(404);
  });

  it('filtra pelo período na data do relatório e traduz os códigos', async () => {
    const result = (await owner.get(`/reports/orders?from=${today()}&to=${today()}`)).body;
    expect(result.rows).toEqual([
      expect.objectContaining({ customer: 'Bar do Teste', status: 'Pendente', total: 20, date: today() }),
    ]);
    expect(result.columns.map((column: { key: string }) => column.key)).toEqual([
      'number',
      'date',
      'customer',
      'status',
      'total',
    ]);
    expect((await owner.get('/reports/orders')).body.rows).toHaveLength(2);
    expect((await owner.get('/reports/orders?from=10-01-2026')).status).toBe(400);
  });

  it('formação de preço calcula lucro e margem', async () => {
    const rows = (await owner.get('/reports/price_formation')).body.rows;
    expect(rows).toEqual([
      expect.objectContaining({
        product: 'Cerveja',
        type: 'Produto',
        cost: 3,
        price: 5,
        profit: 2,
        margin: 40,
      }),
    ]);
  });

  it('"só os próprios" vê só os pedidos que criou', async () => {
    const group = (
      await owner.post('/access-groups', {
        name: 'Só meus pedidos',
        ownOnly: true,
        permissions: ['orders.read', 'orders.create', 'reports.read'],
      })
    ).body;
    const ana = await addMember(app, owner, group.id);
    await ana.post('/orders', { orderDate: today(), items: [{ productId, quantity: 1 }] });
    const rows = (await ana.get('/reports/orders')).body.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 5 });
  });

  it('CSV para o Excel: ponto e vírgula, vírgula decimal, fórmula neutralizada e registro no histórico', async () => {
    const response = await csv(owner, `/reports/payables/csv?from=${today()}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="payables-.*\.csv"/);
    const [header, line] = response.body.replace(/^﻿/, '').trim().split('\r\n');
    expect(response.body.startsWith('﻿')).toBe(true);
    expect(header).toBe('Data;Descrição;Categoria;Fornecedor;Valor');
    expect(line).toBe(`${today().split('-').reverse().join('/')};'=SOMA(A1:A9);Mercadorias;;1234,5`);

    const latest = (await owner.get('/history')).body.rows[0];
    expect(latest).toMatchObject({
      summary: 'Exportou em CSV',
      label: 'Contas a pagar',
      module: 'Relatórios',
    });
  });

  it('exportar exige permissão própria; empresas separadas', async () => {
    const seller = await addMember(app, owner, 'seller');
    expect((await csv(seller, '/reports/orders/csv')).statusCode).toBe(403);

    const other = await signupCompany(app);
    expect((await other.get('/reports/orders')).body.rows).toEqual([]);
  });
});
