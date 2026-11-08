import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let orderNumber: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  const productId = (
    await owner.post('/products', { name: 'Gelo em cubos', type: 'product', price: 10, stock: 50 })
  ).body.id;
  const customerId = (await owner.post('/customers', { name: 'Bar do Zé' })).body.id;
  await owner.post('/suppliers', { name: 'Distribuidora do Zé' });
  orderNumber = (
    await owner.post('/orders', { customerId, orderDate: today(), items: [{ productId, quantity: 1 }] })
  ).body.number;
  await owner.post('/opportunities', { title: 'Casamento do Zé', contactName: 'Zé', source: 'Site' });
});
afterAll(() => app.close());

type Result = { type: string; title: string; path: string };
const find = async (q: string, client = owner) =>
  (await client.get(`/search?q=${encodeURIComponent(q)}`)).body as Result[];

describe('busca rápida', () => {
  it('encontra cadastros e documentos pelo nome, com o caminho de cada tela', async () => {
    const results = await find('zé');
    expect(results.map((result) => result.type).sort()).toEqual([
      'customer',
      'opportunity',
      'order',
      'supplier',
    ]);
    expect(results.find((result) => result.type === 'customer')?.path).toMatch(/^\/clientes\/\d+\/ficha$/);
    expect(await find('cubos')).toEqual([
      expect.objectContaining({ type: 'product', title: 'Gelo em cubos' }),
    ]);
  });

  it('número do documento, com ou sem #; curingas digitados viram texto', async () => {
    const byNumber = await find(`#${orderNumber}`);
    expect(
      byNumber.some((result) => result.type === 'order' && result.title.endsWith(`${orderNumber}`)),
    ).toBe(true);
    expect(await find('%%')).toEqual([]);
    expect((await owner.get('/search?q=a')).status).toBe(400);
  });

  it('respeita permissões e empresas', async () => {
    const seller = await addMember(app, owner, 'seller');
    const types = new Set((await find('zé', seller)).map((result) => result.type));
    expect(types.has('customer')).toBe(true);

    // O contador não vê o CRM, então a oportunidade não aparece para ele.
    const accountant = await addMember(app, owner, 'accountant');
    expect((await find('zé', accountant)).some((result) => result.type === 'opportunity')).toBe(false);

    const other = await signupCompany(app);
    expect(await find('zé', other)).toEqual([]);
  });
});
