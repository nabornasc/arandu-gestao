import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, PASSWORD, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;
let accountId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (await owner.post('/products', { name: 'Serviço', type: 'service', price: 100 })).body.id;
  accountId = (
    await owner.post('/bank-accounts', {
      bankName: 'Banco',
      accountName: 'Principal',
      accountType: 'checking',
      initialBalance: 0,
    })
  ).body.id;
});
afterAll(() => app.close());

const customer = async (name: string) => (await owner.post('/customers', { name })).body.id as number;
const order = async (customerId: number, quantity = 1) =>
  (await owner.post('/orders', { customerId, orderDate: today(), items: [{ productId, quantity }] }))
    .body as {
    id: number;
    receivables: { id: number }[];
  };
const balance = async () => (await owner.get('/dashboard')).body.balance as number;

describe('adiantamentos do cliente', () => {
  it('entra no caixa, quita contas sem nova entrada e o estorno da baixa devolve o crédito', async () => {
    const id = await customer('Cliente com crédito');
    const before = await balance();
    const created = await owner.post(`/customers/${id}/advances`, {
      amount: 150,
      date: today(),
      bankAccountId: accountId,
    });
    expect(created.status).toBe(201);
    expect(created.body.balance).toBe(150);
    expect(await balance()).toBe(before + 150);

    const first = await order(id);
    const settled = await owner.post('/receivables/settle', {
      useAdvance: true,
      items: [{ receivableId: first.receivables[0]?.id }],
    });
    expect(settled.status).toBe(200);
    expect((await owner.get(`/orders/${first.id}`)).body.status).toBe('paid');
    // Pagou com o crédito: o caixa não muda de novo.
    expect(await balance()).toBe(before + 150);
    expect((await owner.get(`/customers/${id}/advances`)).body.balance).toBe(50);

    // Crédito insuficiente para mais 100.
    const second = await order(id);
    expect(
      (
        await owner.post('/receivables/settle', {
          useAdvance: true,
          items: [{ receivableId: second.receivables[0]?.id }],
        })
      ).status,
    ).toBe(400);

    // Estornar a baixa devolve o crédito.
    const payment = (await owner.get(`/orders/${first.id}`)).body.payments[0];
    await owner.post(`/receivable-payments/${payment.id}/reverse`, { password: PASSWORD, reason: 'Teste' });
    expect((await owner.get(`/customers/${id}/advances`)).body.balance).toBe(150);
  });

  it('adiantamento só se estorna inteiro e sem uso; contas de outro cliente não usam o crédito', async () => {
    const a = await customer('Cliente A');
    const b = await customer('Cliente B');
    const { rows } = (
      await owner.post(`/customers/${a}/advances`, { amount: 100, date: today(), bankAccountId: accountId })
    ).body;
    const orderA = await order(a, 1);
    const orderB = await order(b, 1);
    expect(
      (
        await owner.post('/receivables/settle', {
          useAdvance: true,
          items: [{ receivableId: orderA.receivables[0]?.id }, { receivableId: orderB.receivables[0]?.id }],
        })
      ).status,
    ).toBe(400);

    await owner.post('/receivables/settle', {
      useAdvance: true,
      items: [{ receivableId: orderA.receivables[0]?.id, received: 30 }],
    });
    expect(
      (await owner.post(`/advances/${rows[0].id}/reverse`, { password: PASSWORD, reason: 'Teste' })).status,
    ).toBe(409);
  });

  it('registrar exige baixa; estornar exige estorno; empresas separadas', async () => {
    const id = await customer('Cliente C');
    const accountant = await addMember(app, owner, 'accountant');
    expect(
      (
        await accountant.post(`/customers/${id}/advances`, {
          amount: 10,
          date: today(),
          bankAccountId: accountId,
        })
      ).status,
    ).toBe(403);
    const other = await signupCompany(app);
    expect((await other.get(`/customers/${id}/advances`)).status).toBe(404);
  });
});
