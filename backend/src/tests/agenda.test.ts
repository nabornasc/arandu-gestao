import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;

const shift = (days: number) =>
  new Date(Date.parse(`${today()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const range = (from = shift(-1), to = shift(30)) => `/agenda?from=${from}&to=${to}`;
type Item = {
  id: string;
  kind: string;
  date: string;
  time: string | null;
  title: string;
  eventId: number | null;
};

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  const productId = (await owner.post('/products', { name: 'Gelo', type: 'product', price: 10, stock: 50 }))
    .body.id;
  const customerId = (await owner.post('/customers', { name: 'Bar do Teste' })).body.id;
  await owner.post('/opportunities', {
    title: 'Festa junina',
    contactName: 'Ana',
    source: 'Site',
    nextAction: 'Ligar para fechar',
    nextActionAt: shift(2),
  });
  const quote = (
    await owner.post('/quotes', { customerId, validUntil: shift(5), items: [{ productId, quantity: 1 }] })
  ).body;
  await owner.post(`/quotes/${quote.id}/send`);
  await owner.post('/orders', {
    customerId,
    orderDate: today(),
    installments: [{ dueDate: shift(10), amount: 30, method: 'PIX' }],
    items: [{ productId, quantity: 3 }],
  });
  await owner.post('/expenses', {
    description: 'Aluguel',
    category: 'Aluguel',
    amount: 900,
    expenseDate: shift(7),
    status: 'pending',
  });
});
afterAll(() => app.close());

describe('agenda', () => {
  it('junta tarefas, próximas ações, validades e vencimentos, em ordem de data e hora', async () => {
    await owner.post('/agenda/events', { title: 'Sem hora', date: shift(1) });
    await owner.post('/agenda/events', { title: 'Às 9h', date: shift(1), time: '09:00' });
    const items: Item[] = (await owner.get(range())).body;
    expect(items.map((item) => [item.kind, item.date])).toEqual([
      ['task', shift(1)],
      ['task', shift(1)],
      ['opportunity', shift(2)],
      ['quote', shift(5)],
      ['payable', shift(7)],
      ['receivable', shift(10)],
    ]);
    expect(items[0]).toMatchObject({ title: 'Às 9h', time: '09:00' });
    expect(items.find((item) => item.kind === 'opportunity')).toMatchObject({ title: 'Ligar para fechar' });
    expect(items.find((item) => item.kind === 'quote')?.title).toMatch(/^Validade do orçamento #\d+$/);
  });

  it('valida o período: datas, ordem e até 92 dias', async () => {
    expect((await owner.get('/agenda?from=2026-01-10')).status).toBe(400);
    expect((await owner.get(range(shift(5), shift(1)))).status).toBe(400);
    expect((await owner.get(range(shift(0), shift(93)))).status).toBe(400);
  });

  it('cria, conclui, edita e exclui a tarefa, com histórico', async () => {
    const created = await owner.post('/agenda/events', {
      title: 'Contar o estoque',
      date: shift(3),
      time: '25:00',
    });
    expect(created.status).toBe(400);
    const task = (await owner.post('/agenda/events', { title: 'Contar o estoque', date: shift(3) })).body;
    const updated = await owner.put(`/agenda/events/${task.id}`, {
      title: 'Contar o estoque do depósito',
      date: shift(3),
      time: '18:30',
      notes: 'Incluir o freezer',
      done: true,
    });
    expect(updated.body).toMatchObject({ done: true, time: '18:30:00' });
    const latest = (await owner.get('/history?module=Agenda')).body.rows[0];
    expect(latest.summary).toMatch(/^Alterou/);
    expect((await owner.del(`/agenda/events/${task.id}`)).status).toBe(204);
    expect((await owner.del(`/agenda/events/${task.id}`)).status).toBe(404);
  });

  it('cada item exige a leitura do seu módulo; "só os próprios" vê só as próprias tarefas', async () => {
    const accountant = await addMember(app, owner, 'accountant');
    const kinds = new Set(((await accountant.get(range())).body as Item[]).map((item) => item.kind));
    // O contador vê financeiro e orçamentos, mas não o CRM; e não lança tarefas.
    expect(kinds.has('opportunity')).toBe(false);
    expect(kinds.has('payable')).toBe(true);
    expect((await accountant.post('/agenda/events', { title: 'X', date: shift(1) })).status).toBe(403);

    const group = (
      await owner.post('/access-groups', {
        name: 'Agenda própria',
        ownOnly: true,
        permissions: ['agenda.read', 'agenda.create', 'agenda.update'],
      })
    ).body;
    const ana = await addMember(app, owner, group.id);
    await ana.post('/agenda/events', { title: 'Tarefa da Ana', date: shift(1) });
    const titles = ((await ana.get(range())).body as Item[]).map((item) => item.title);
    expect(titles).toEqual(['Tarefa da Ana']);
    const ownerTask = ((await owner.get(range())).body as Item[]).find((item) => item.title === 'Às 9h');
    expect(
      (await ana.put(`/agenda/events/${ownerTask?.eventId}`, { title: 'Invasão', date: shift(1) })).status,
    ).toBe(404);
  });

  it('empresas separadas', async () => {
    const other = await signupCompany(app);
    expect((await other.get(range())).body).toEqual([]);
  });
});
