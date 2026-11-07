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

const newProduct = async (extra: Record<string, unknown> = {}) =>
  (
    await owner.post('/products', {
      name: `Cerveja ${Math.random()}`,
      type: 'product',
      price: 5,
      stock: 10,
      ...extra,
    })
  ).body;
const movementsOf = async (id: number, client = owner) =>
  (await client.get(`/products/${id}/stock-movements`)).body as {
    kind: string;
    quantity: number;
    balance: number;
    reason: string | null;
    orderNumber: number | null;
    userName: string | null;
  }[];
const adjust = (id: number, body: Record<string, unknown>, client = owner) =>
  client.post(`/products/${id}/stock-adjustments`, body);

describe('estoque', () => {
  it('produto guarda unidade e estoque mínimo, e o extrato começa com o saldo inicial', async () => {
    const product = await newProduct({ unit: 'CX', minStock: 3 });
    expect(product).toMatchObject({ unit: 'CX', minStock: 3, stock: 10, lowStock: false });
    expect(await movementsOf(product.id)).toEqual([
      expect.objectContaining({
        kind: 'initial',
        quantity: 10,
        balance: 10,
        reason: 'Saldo inicial no cadastro',
      }),
    ]);

    // Serviço não controla estoque nem tem mínimo.
    const service = (
      await owner.post('/products', { name: 'Entrega', type: 'service', price: 8, stock: 5, minStock: 2 })
    ).body;
    expect(service).toMatchObject({ stock: null, minStock: null, unit: 'UN' });
    expect((await adjust(service.id, { kind: 'in', quantity: 1, reason: 'Teste' })).status).toBe(400);
  });

  it('ajuste de entrada, saída e contagem exige motivo e nunca deixa o saldo negativo', async () => {
    const { id } = await newProduct();
    expect((await adjust(id, { kind: 'in', quantity: 5 })).status).toBe(400);
    expect((await adjust(id, { kind: 'out', quantity: 0, reason: 'Nada' })).status).toBe(400);
    expect((await adjust(id, { kind: 'out', quantity: 11, reason: 'Quebra' })).status).toBe(400);

    expect((await adjust(id, { kind: 'in', quantity: 5, reason: 'Compra do fornecedor' })).body.stock).toBe(
      15,
    );
    expect((await adjust(id, { kind: 'out', quantity: 2, reason: 'Garrafa quebrada' })).body.stock).toBe(13);
    expect((await adjust(id, { kind: 'count', quantity: 12, reason: 'Contagem do mês' })).body.stock).toBe(
      12,
    );

    const movements = await movementsOf(id);
    expect(movements.slice(0, 3)).toEqual([
      expect.objectContaining({ kind: 'count', quantity: -1, balance: 12, reason: 'Contagem do mês' }),
      expect.objectContaining({ kind: 'adjustment', quantity: -2, balance: 13, reason: 'Garrafa quebrada' }),
      expect.objectContaining({
        kind: 'adjustment',
        quantity: 5,
        balance: 15,
        reason: 'Compra do fornecedor',
      }),
    ]);
    expect(movements[0]?.userName).toBe('Dono');

    // O ajuste fica no histórico geral, com o motivo.
    const latest = (await owner.get('/history')).body.rows[0];
    expect(latest).toMatchObject({ summary: 'Ajustou o estoque (contagem)', reason: 'Contagem do mês' });
  });

  it('venda, cancelamento, reativação e exclusão do pedido entram no extrato', async () => {
    const { id } = await newProduct();
    const order = (
      await owner.post('/orders', { orderDate: today(), items: [{ productId: id, quantity: 4 }] })
    ).body;
    expect((await movementsOf(id))[0]).toMatchObject({ kind: 'sale', orderNumber: order.number });
    await owner.put(`/orders/${order.id}`, { status: 'cancelled', reason: 'Desistiu' });
    await owner.put(`/orders/${order.id}`, { status: 'pending' });
    expect((await owner.del(`/orders/${order.id}`)).status).toBe(204);

    const movements = await movementsOf(id);
    expect(movements.map((movement) => [movement.kind, movement.quantity, movement.balance])).toEqual([
      ['return', 4, 10],
      ['sale', -4, 6],
      ['return', 4, 10],
      ['sale', -4, 6],
      ['initial', 10, 10],
    ]);
    expect(movements[0]?.reason).toMatch(/^Pedido #\d+ excluído$/);
    expect(movements[1]?.reason).toMatch(/reativado$/);
    // Sem o pedido, o extrato guarda o número só no motivo.
    expect(movements[3]).toMatchObject({ orderNumber: null });
  });

  it('mudar o estoque pelo cadastro fica no extrato; sem o campo, o saldo não muda', async () => {
    const product = await newProduct();
    const body = { name: product.name, type: 'product', price: 6 };
    expect((await owner.put(`/products/${product.id}`, body)).body.stock).toBe(10);
    expect((await owner.put(`/products/${product.id}`, { ...body, stock: 7 })).body.stock).toBe(7);
    expect((await movementsOf(product.id))[0]).toMatchObject({ kind: 'edit', quantity: -3, balance: 7 });
  });

  it('aviso de estoque baixo na lista e na visão geral', async () => {
    const low = await newProduct({ name: 'Gelo baixo', minStock: 10 });
    await newProduct({ name: 'Gelo normal', minStock: 2 });
    const list = (await owner.get('/products')).body as { id: number; lowStock: boolean }[];
    expect(list.find((row) => row.id === low.id)?.lowStock).toBe(true);
    const names = (await owner.get('/dashboard')).body.lowStock.map((row: { name: string }) => row.name);
    expect(names).toContain('Gelo baixo');
    expect(names).not.toContain('Gelo normal');
  });

  it('ajustar exige permissão própria; ver o extrato só exige ver produtos; empresas separadas', async () => {
    const { id } = await newProduct();
    const seller = await addMember(app, owner, 'seller');
    expect((await adjust(id, { kind: 'in', quantity: 1, reason: 'Teste' }, seller)).status).toBe(403);
    expect((await seller.get(`/products/${id}/stock-movements`)).status).toBe(200);

    const other = await signupCompany(app);
    expect((await adjust(id, { kind: 'in', quantity: 1, reason: 'Invasão' }, other)).status).toBe(404);
    expect((await other.get(`/products/${id}/stock-movements`)).status).toBe(404);
  });
});
