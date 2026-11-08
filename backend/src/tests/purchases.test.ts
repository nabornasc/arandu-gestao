import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let supplierId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  supplierId = (await owner.post('/suppliers', { name: 'Distribuidora Teste' })).body.id;
});
afterAll(() => app.close());

const newProduct = async (stock: number, cost: number | null) =>
  (
    await owner.post('/products', {
      name: `Cerveja ${Math.random()}`,
      type: 'product',
      price: 8,
      stock,
      cost,
    })
  ).body.id as number;
const purchase = (
  productId: number,
  quantity: number,
  unitCost: number,
  extra: Record<string, unknown> = {},
) =>
  owner.post('/purchases', {
    supplierId,
    purchaseDate: today(),
    dueDate: today(),
    freight: 10,
    items: [{ productId, quantity, unitCost }],
    ...extra,
  });

describe('compras', () => {
  it('rascunho → receber: estoque, custo médio, extrato e conta a pagar do fornecedor', async () => {
    const productId = await newProduct(10, 4);
    const draft = (await purchase(productId, 30, 5)).body;
    expect(draft).toMatchObject({ status: 'draft', total: 160, number: 1 });
    // Rascunho ainda não mexe no estoque.
    expect((await owner.get(`/products/${productId}`)).body.stock).toBe(10);

    const received = (await owner.post(`/purchases/${draft.id}/receive`)).body;
    expect(received.status).toBe('received');
    const product = (await owner.get(`/products/${productId}`)).body;
    // (10 × 4 + 30 × 5) / 40 = 4,75
    expect(product).toMatchObject({ stock: 40, cost: 4.75 });
    const [movement] = (await owner.get(`/products/${productId}/stock-movements`)).body;
    expect(movement).toMatchObject({ kind: 'purchase', quantity: 30, balance: 40, reason: 'Compra #001' });

    const expense = (await owner.get(`/expenses/${received.expenseId}`)).body;
    expect(expense).toMatchObject({ amount: 160, status: 'pending', supplierId, category: 'Mercadorias' });
    expect((await owner.post(`/purchases/${draft.id}/receive`)).status).toBe(409);
    expect(
      (
        await owner.put(`/purchases/${draft.id}`, {
          supplierId,
          purchaseDate: today(),
          dueDate: today(),
          items: [{ productId, quantity: 1, unitCost: 1 }],
        })
      ).status,
    ).toBe(409);
  });

  it('cancelar a recebida devolve o estoque e apaga a conta a pagar; com pagamento, recusa', async () => {
    const productId = await newProduct(0, null);
    const first = (await purchase(productId, 12, 3)).body;
    await owner.post(`/purchases/${first.id}/receive`);
    expect((await owner.post(`/purchases/${first.id}/cancel`, {})).status).toBe(400);
    const cancelled = (await owner.post(`/purchases/${first.id}/cancel`, { reason: 'Veio errado' })).body;
    expect(cancelled).toMatchObject({ status: 'cancelled', expenseId: null });
    expect((await owner.get(`/products/${productId}`)).body.stock).toBe(0);

    const second = (await purchase(productId, 5, 3)).body;
    const received = (await owner.post(`/purchases/${second.id}/receive`)).body;
    await owner.post('/expenses/pay', { items: [{ expenseId: received.expenseId, paid: 10 }] });
    expect((await owner.post(`/purchases/${second.id}/cancel`, { reason: 'Teste' })).status).toBe(409);
  });

  it('só produtos com estoque, fornecedor da empresa e permissões próprias', async () => {
    const service = (await owner.post('/products', { name: 'Frete', type: 'service', price: 5 })).body.id;
    expect((await purchase(service, 1, 1)).status).toBe(400);
    const customer = (await owner.post('/customers', { name: 'Só cliente' })).body.id;
    const productId = await newProduct(1, 1);
    expect((await purchase(productId, 1, 1, { supplierId: customer })).status).toBe(400);

    const seller = await addMember(app, owner, 'seller');
    expect((await seller.get('/purchases')).status).toBe(403);
    const other = await signupCompany(app);
    const mine = (await purchase(productId, 1, 1)).body;
    expect((await other.get(`/purchases/${mine.id}`)).status).toBe(404);
  });
});
