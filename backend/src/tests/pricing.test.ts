import { pricingResult, suggestPrice } from '@arandue/shared/pricing';
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

// Dia 10 do mês, "back" meses atrás.
const monthsAgo = (back: number) => {
  const [year = 0, month = 1] = today().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 - back, 10)).toISOString().slice(0, 10);
};

describe('cálculo do preço', () => {
  it('markup divisor: custo ÷ (1 − rateio − variáveis − margem)', () => {
    // Rateio 2.000 / 10.000 = 20%; 20% + 10% + 20% = 50%: preço = 10 / 0,5.
    const result = suggestPrice({
      cost: 10,
      fixedExpenses: 2000,
      monthlyRevenue: 10000,
      variablePercent: 10,
      marginPercent: 20,
    });
    expect(result).toMatchObject({
      ok: true,
      price: 20,
      overheadPercent: 20,
      profit: 4,
      marginPercent: 20,
      contribution: 8,
      contributionPercent: 40,
      breakEvenRevenue: 5000,
      breakEvenUnits: 250,
    });
  });

  it('soma de 100% ou mais não tem preço possível; sem faturamento não há rateio', () => {
    expect(
      suggestPrice({
        cost: 10,
        fixedExpenses: 5000,
        monthlyRevenue: 10000,
        variablePercent: 20,
        marginPercent: 30,
      }),
    ).toMatchObject({ ok: false, overheadPercent: 50 });
    expect(
      suggestPrice({
        cost: 10,
        fixedExpenses: 900,
        monthlyRevenue: 0,
        variablePercent: 0,
        marginPercent: 50,
      }),
    ).toMatchObject({ ok: true, price: 20, overheadPercent: 0 });
  });

  it('preço atual abaixo do custo mostra prejuízo e sem ponto de equilíbrio', () => {
    const result = pricingResult(
      { cost: 10, fixedExpenses: 1000, monthlyRevenue: 5000, variablePercent: 0 },
      8,
    );
    expect(result).toMatchObject({
      profit: -3.6,
      contribution: -2,
      breakEvenUnits: null,
      breakEvenRevenue: null,
    });
  });
});

describe('base da precificação', () => {
  it('médias dos três meses fechados: faturamento sem cancelados e despesas pagas por categoria', async () => {
    const product = (await owner.post('/products', { name: 'Serviço', type: 'service', price: 100 })).body.id;
    const sell = (date: string, quantity: number) =>
      owner.post('/orders', { orderDate: date, items: [{ productId: product, quantity }] });
    await sell(monthsAgo(1), 30);
    await sell(monthsAgo(2), 30);
    await sell(monthsAgo(4), 50); // fora da janela
    await sell(today(), 10); // mês corrente fica de fora
    const cancelled = (await sell(monthsAgo(1), 5)).body;
    await owner.put(`/orders/${cancelled.id}`, { status: 'cancelled', reason: 'Teste' });

    const pay = (category: string, amount: number, date: string) =>
      owner.post('/expenses', { description: category, category, amount, expenseDate: date, status: 'paid' });
    await pay('Aluguel', 900, monthsAgo(1));
    await pay('Aluguel', 900, monthsAgo(2));
    await pay('Aluguel', 900, monthsAgo(3));
    await pay('Mercadorias', 300, monthsAgo(1));
    await owner.post('/expenses', {
      description: 'Pendente',
      category: 'Aluguel',
      amount: 999,
      expenseDate: monthsAgo(1),
      status: 'pending',
    });

    const { body } = await owner.get('/pricing/base');
    expect(body).toMatchObject({ months: 3, monthlyRevenue: 2000 });
    expect(body.expenses).toEqual([
      { category: 'Aluguel', monthly: 900 },
      { category: 'Mercadorias', monthly: 100 },
    ]);
  });

  it('exige ver custos', async () => {
    const seller = await addMember(app, owner, 'seller');
    expect((await seller.get('/pricing/base')).status).toBe(403);
  });
});
