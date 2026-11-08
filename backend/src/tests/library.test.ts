import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  productId = (await owner.post('/products', { name: 'Chopeira', type: 'service', price: 80 })).body.id;
});
afterAll(() => app.close());

describe('biblioteca de textos', () => {
  it('cria, edita e desativa; só quem configura a empresa altera; todos leem os ativos', async () => {
    const created = await owner.post('/text-snippets', { title: 'Garantia', body: 'Garantia de 90 dias.' });
    expect(created.status).toBe(201);
    expect((await owner.post('/text-snippets', { title: 'garantia', body: 'Outro' })).status).toBe(409);
    expect((await owner.post('/text-snippets', { title: 'Vazio', body: '' })).status).toBe(400);

    const seller = await addMember(app, owner, 'seller');
    expect((await seller.get('/text-snippets')).body.map((row: { title: string }) => row.title)).toEqual([
      'Garantia',
    ]);
    expect((await seller.post('/text-snippets', { title: 'X', body: 'Y' })).status).toBe(403);

    await owner.put(`/text-snippets/${created.body.id}`, { ...created.body, active: false });
    expect((await seller.get('/text-snippets')).body).toEqual([]);
    expect((await owner.get('/text-snippets?all=1')).body).toHaveLength(1);
  });
});

describe('cláusulas do orçamento', () => {
  it('saem no espelho no lugar do texto padrão da empresa e seguem na duplicação', async () => {
    const quote = (
      await owner.post('/quotes', {
        items: [{ productId, quantity: 1 }],
        clauses: 'Garantia de 90 dias.\nMontagem inclusa.',
      })
    ).body;
    expect(quote.clauses).toBe('Garantia de 90 dias.\nMontagem inclusa.');
    expect((await owner.get(`/quotes/${quote.id}/mirror`)).body.clauses).toBe(quote.clauses);

    const copy = (await owner.post(`/quotes/${quote.id}/duplicate`, {})).body;
    expect((await owner.get(`/quotes/${copy.id}`)).body.clauses).toBe(quote.clauses);

    const plain = (await owner.post('/quotes', { items: [{ productId, quantity: 1 }] })).body;
    expect(plain.clauses).toBeNull();
  });
});

describe('modelos de grupo', () => {
  it('quem cria orçamento salva o modelo; produto de outra empresa ou inativo não entra', async () => {
    const seller = await addMember(app, owner, 'seller');
    const saved = await seller.post('/item-templates', {
      name: 'Kit festa',
      items: [{ productId, quantity: 2, unitPrice: 75 }],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.items).toEqual([{ productId, quantity: 2, unitPrice: 75 }]);
    expect((await seller.get('/item-templates')).body.map((row: { name: string }) => row.name)).toEqual([
      'Kit festa',
    ]);
    // Renomear e desativar fica com quem configura a empresa.
    expect((await seller.put(`/item-templates/${saved.body.id}`, saved.body)).status).toBe(403);

    const other = await signupCompany(app);
    expect(
      (await other.post('/item-templates', { name: 'Invasão', items: [{ productId, quantity: 1 }] })).status,
    ).toBe(400);
    expect((await owner.post('/item-templates', { name: 'Vazio', items: [] })).status).toBe(400);
  });

  it('contador não lê modelos (não monta orçamento)', async () => {
    const accountant = await addMember(app, owner, 'accountant');
    expect((await accountant.get('/item-templates')).status).toBe(403);
  });
});
