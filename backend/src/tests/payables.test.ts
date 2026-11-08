import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, PASSWORD, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let accountId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
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

const newExpense = async (amount: number, description = `Conta ${Math.random()}`) =>
  (
    await owner.post('/expenses', {
      description,
      category: 'Fixas',
      amount,
      expenseDate: today(),
      status: 'pending',
      bankAccountId: accountId,
    })
  ).body as { id: number; description: string };
const expenseOf = async (id: number) =>
  (await owner.get(`/expenses/${id}`)).body as { status: string; paidAmount: number };
const outflows = async (id: number) =>
  ((await owner.get('/transactions')).body as { expenseId: number | null; amount: number }[]).filter(
    (row) => row.expenseId === id,
  );

describe('baixa nas contas a pagar', () => {
  it('parcial, com juros e desconto: cada baixa gera uma saída; quita na última', async () => {
    const expense = await newExpense(300);
    const first = await owner.post('/expenses/pay', { items: [{ expenseId: expense.id, paid: 100 }] });
    expect(first.status).toBe(200);
    expect(await expenseOf(expense.id)).toMatchObject({ status: 'pending', paidAmount: 100 });

    // Saldo 200: paga 205 com 10 de juros e 5 de desconto → abate 200 e quita.
    await owner.post('/expenses/pay', {
      items: [{ expenseId: expense.id, interest: 10, discount: 5 }],
    });
    expect(await expenseOf(expense.id)).toMatchObject({ status: 'paid', paidAmount: 300 });
    expect((await outflows(expense.id)).map((row) => row.amount).sort()).toEqual([100, 205]);

    expect((await owner.post('/expenses/pay', { items: [{ expenseId: expense.id }] })).status).toBe(409);
    const payments = (await owner.get(`/expenses/${expense.id}/payments`)).body;
    expect(payments).toHaveLength(2);
  });

  it('em lote: várias contas de uma vez, e valor acima do saldo é recusado', async () => {
    const a = await newExpense(50);
    const b = await newExpense(70);
    expect((await owner.post('/expenses/pay', { items: [{ expenseId: a.id, paid: 60 }] })).status).toBe(400);
    const paid = await owner.post('/expenses/pay', { items: [{ expenseId: a.id }, { expenseId: b.id }] });
    expect(paid.body.map((row: { status: string }) => row.status)).toEqual(['paid', 'paid']);
  });

  it('estorno exige permissão, senha e motivo, e reabre o saldo', async () => {
    const expense = await newExpense(80);
    await owner.post('/expenses/pay', { items: [{ expenseId: expense.id }] });
    const [payment] = (await owner.get(`/expenses/${expense.id}/payments`)).body;

    expect(
      (await owner.post(`/expense-payments/${payment.id}/reverse`, { password: 'errada', reason: 'Teste' }))
        .status,
    ).toBe(403);
    const clerk = await addMember(app, owner, 'accountant');
    expect(
      (await clerk.post(`/expense-payments/${payment.id}/reverse`, { password: PASSWORD, reason: 'Teste' }))
        .status,
    ).toBe(403);

    const reversed = await owner.post(`/expense-payments/${payment.id}/reverse`, {
      password: PASSWORD,
      reason: 'Pago em duplicidade',
    });
    expect(reversed.body).toMatchObject({ status: 'pending', paidAmount: 0 });
    expect(await outflows(expense.id)).toHaveLength(0);
    const history = (await owner.get(`/expenses/${expense.id}/payments`)).body;
    expect(history[0]).toMatchObject({ reversalReason: 'Pago em duplicidade' });
    expect(
      (await owner.post(`/expense-payments/${payment.id}/reverse`, { password: PASSWORD, reason: 'De novo' }))
        .status,
    ).toBe(409);
  });

  it('pelo cadastro: com baixa parcial, o valor não fica abaixo do pago; "pago" quita o saldo', async () => {
    const expense = await newExpense(100);
    await owner.post('/expenses/pay', { items: [{ expenseId: expense.id, paid: 40 }] });
    const base = {
      description: expense.description,
      category: 'Fixas',
      expenseDate: today(),
      bankAccountId: accountId,
    };
    expect(
      (await owner.put(`/expenses/${expense.id}`, { ...base, amount: 30, status: 'pending' })).status,
    ).toBe(400);
    const paid = await owner.put(`/expenses/${expense.id}`, { ...base, amount: 100, status: 'paid' });
    expect(paid.body).toMatchObject({ status: 'paid', paidAmount: 100 });
    expect((await outflows(expense.id)).map((row) => row.amount).sort()).toEqual([40, 60]);
  });

  it('totais da lista: pago soma as baixas e em aberto soma o saldo', async () => {
    const expense = await newExpense(500, 'Fornecedor de gelo XYZ');
    await owner.post('/expenses/pay', { items: [{ expenseId: expense.id, paid: 125 }] });
    const page = (await owner.get('/expenses?page=1&q=gelo xyz')).body;
    expect(page.totals).toEqual({ amount: 500, paid: 125, pending: 375 });
  });
});
