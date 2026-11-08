import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

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

const THREE = [
  { dueDate: '2031-01-10', amount: 100, method: 'Pix' },
  { dueDate: '2031-02-10', amount: 100, method: 'Pix' },
  { dueDate: '2031-03-10', amount: 100, method: 'Pix' },
];
const newOrder = async () =>
  (
    await owner.post('/orders', {
      orderDate: today(),
      items: [{ productId, quantity: 3 }],
      installments: THREE,
    })
  ).body as { id: number; receivables: { id: number; position: number; amount: number; status: string }[] };

describe('renegociação de parcelas', () => {
  it('o saldo em aberto vira novas parcelas; a parcial fica quitada no valor pago; renumera', async () => {
    const order = await newOrder();
    const [first, second] = order.receivables;
    // Paga a 1ª inteira e 40 da 2ª: saldo em aberto 60 + 100 = 160.
    await owner.post('/receivables/settle', {
      bankAccountId: accountId,
      items: [{ receivableId: first?.id }, { receivableId: second?.id, received: 40 }],
    });

    const wrong = await owner.post(`/orders/${order.id}/renegotiate`, {
      reason: 'Cliente pediu',
      installments: [{ dueDate: '2031-06-10', amount: 100, method: 'Boleto' }],
    });
    expect(wrong.status).toBe(400);
    expect((await owner.post(`/orders/${order.id}/renegotiate`, { installments: [] })).status).toBe(400);

    const renegotiated = (
      await owner.post(`/orders/${order.id}/renegotiate`, {
        reason: 'Cliente pediu mais prazo',
        installments: [
          { dueDate: '2031-06-10', amount: 80, method: 'Boleto' },
          { dueDate: '2031-07-10', amount: 80, method: 'Boleto' },
        ],
      })
    ).body;
    expect(
      renegotiated.receivables.map((title: { position: number; amount: number; status: string }) => [
        title.position,
        title.amount,
        title.status,
      ]),
    ).toEqual([
      [1, 100, 'settled'],
      [2, 40, 'settled'],
      [3, 80, 'open'],
      [4, 80, 'open'],
    ]);

    // As renegociadas saem da lista; a parcela continua contada certa.
    const list = (await owner.get('/receivables?page=1&status=open')).body.rows.filter(
      (row: { orderId: number }) => row.orderId === order.id,
    );
    expect(
      list.map((row: { position: number; titleCount: number }) => `${row.position}/${row.titleCount}`),
    ).toEqual(['3/4', '4/4']);

    // Quitar as novas deixa o pedido pago.
    const open = renegotiated.receivables.filter((title: { status: string }) => title.status === 'open');
    await owner.post('/receivables/settle', {
      bankAccountId: accountId,
      items: open.map((title: { id: number }) => ({ receivableId: title.id })),
    });
    expect((await owner.get(`/orders/${order.id}`)).body.status).toBe('paid');

    const entry = (await owner.get('/history')).body.rows.find((row: { reason: string | null }) =>
      row.reason?.includes('mais prazo'),
    );
    expect(entry).toBeTruthy();
  });

  it('pedido sem saldo ou cancelado não renegocia; exige permissão própria', async () => {
    const order = await newOrder();
    const seller = await addMember(app, owner, 'seller');
    const body = { reason: 'Teste', installments: [{ dueDate: '2031-06-10', amount: 300, method: null }] };
    expect((await seller.post(`/orders/${order.id}/renegotiate`, body)).status).toBe(403);
    await owner.put(`/orders/${order.id}`, { status: 'cancelled', reason: 'Desistiu' });
    expect((await owner.post(`/orders/${order.id}/renegotiate`, body)).status).toBe(409);
  });
});
