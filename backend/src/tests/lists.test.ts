import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
});
afterAll(() => app.close());

type Item = { id: number; name: string; active: boolean };
const listOf = async (kind: string, client = owner, all = false) =>
  ((await client.get(all ? '/lists?all=1' : '/lists')).body[kind] as Item[]).map((item) => item);
const names = (items: Item[]) => items.map((item) => item.name);

describe('listas da empresa', () => {
  it('empresa nova começa com os valores padrão, em ordem alfabética', async () => {
    expect(names(await listOf('payment_method'))).toEqual([
      'Boleto',
      'Cartão de crédito',
      'Cartão de débito',
      'Dinheiro',
      'PIX',
      'Transferência',
    ]);
    expect(await listOf('product_group')).toEqual([]);
  });

  it('adiciona, renomeia e desativa sem duplicar nome (maiúsculas não contam)', async () => {
    const created = await owner.post('/lists', { kind: 'product_group', name: 'Cervejas' });
    expect(created.status).toBe(201);
    expect((await owner.post('/lists', { kind: 'product_group', name: 'cervejas' })).status).toBe(409);
    // O mesmo nome em outra lista é permitido.
    expect((await owner.post('/lists', { kind: 'customer_category', name: 'Cervejas' })).status).toBe(201);

    const id = created.body.id;
    expect((await owner.put(`/lists/${id}`, { name: 'Cervejas e chopes', active: true })).status).toBe(200);
    expect((await owner.put(`/lists/${id}`, { name: 'Cervejas e chopes', active: false })).status).toBe(200);
    // Desativado sai das sugestões, mas continua na tela de listas.
    expect(names(await listOf('product_group'))).not.toContain('Cervejas e chopes');
    expect(await listOf('product_group', owner, true)).toEqual([
      expect.objectContaining({ name: 'Cervejas e chopes', active: false }),
    ]);

    const history = (await owner.get('/history?module=Configura%C3%A7%C3%B5es')).body.rows;
    expect(history[0]).toMatchObject({ summary: 'Alterou ativo' });
  });

  it('valor salvo no registro não muda quando a lista muda', async () => {
    const created = (await owner.post('/lists', { kind: 'financial_category', name: 'Embalagens' })).body;
    const expense = (
      await owner.post('/expenses', {
        description: 'Sacolas',
        category: 'Embalagens',
        amount: 30,
        expenseDate: '2026-11-01',
        status: 'pending',
      })
    ).body;
    await owner.put(`/lists/${created.id}`, { name: 'Embalagens e sacolas', active: false });
    expect(
      (await owner.get('/expenses')).body.find((row: { id: number }) => row.id === expense.id).category,
    ).toBe('Embalagens');
  });

  it('qualquer usuário lê as sugestões; editar exige settings.update; empresas separadas', async () => {
    const seller = await addMember(app, owner, 'seller');
    expect(names(await listOf('lost_reason', seller))).toContain('Preço');
    expect((await seller.get('/lists?all=1')).status).toBe(403);
    expect((await seller.post('/lists', { kind: 'lost_reason', name: 'Clima' })).status).toBe(403);

    const id = (await listOf('lost_reason'))[0]?.id;
    const other = await signupCompany(app);
    expect((await other.put(`/lists/${id}`, { name: 'Invasão', active: true })).status).toBe(404);
    expect(names(await listOf('lost_reason', other))).not.toContain('Invasão');
  });

  it('grupo do produto entra no cadastro e no resumo do espelho interno', async () => {
    const product = (
      await owner.post('/products', {
        name: 'Gelo 5 kg',
        type: 'product',
        price: 14,
        cost: 6,
        groupName: 'Gelo',
      })
    ).body;
    expect(product.groupName).toBe('Gelo');
    const service = (await owner.post('/products', { name: 'Entrega', type: 'service', price: 8, cost: 3 }))
      .body;
    const quote = (
      await owner.post('/quotes', {
        items: [
          { productId: product.id, quantity: 2 },
          { productId: service.id, quantity: 1 },
        ],
      })
    ).body;
    const mirror = (await owner.get(`/quotes/${quote.id}/internal-mirror`)).body;
    expect(mirror.summary).toEqual([
      { label: 'Gelo', revenue: 28, cost: 12, result: 16, percent: 57.14 },
      { label: 'Serviços', revenue: 8, cost: 3, result: 5, percent: 62.5 },
    ]);
  });
});
