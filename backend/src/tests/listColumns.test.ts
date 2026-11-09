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

describe('colunas das listas', () => {
  it('começa vazio e guarda as colunas escondidas de cada lista, sem apagar as outras', async () => {
    expect((await owner.get('/preferences/columns')).body).toEqual({});
    expect((await owner.put('/preferences/columns/orders', { hidden: ['items', 'status'] })).status).toBe(
      200,
    );
    await owner.put('/preferences/columns/products', { hidden: ['minStock'] });
    expect((await owner.get('/preferences/columns')).body).toEqual({
      orders: ['items', 'status'],
      products: ['minStock'],
    });
    await owner.put('/preferences/columns/orders', { hidden: [] });
    expect((await owner.get('/preferences/columns')).body.orders).toEqual([]);
  });

  it('cada usuário tem as próprias colunas, e o layout da visão geral continua', async () => {
    await owner.put('/preferences/dashboard', { layout: { blocks: [{ id: 'revenue', size: 'M' }] } });
    await owner.put('/preferences/columns/quotes', { hidden: ['validUntil'] });
    expect((await owner.get('/preferences/dashboard')).body).toEqual({
      blocks: [{ id: 'revenue', size: 'M' }],
    });
    const seller = await addMember(app, owner, 'seller');
    expect((await seller.get('/preferences/columns')).body).toEqual({});
  });

  it('recusa lista desconhecida e nome de coluna inválido', async () => {
    expect((await owner.put('/preferences/columns/inventada', { hidden: [] })).status).toBe(400);
    expect((await owner.put('/preferences/columns/orders', { hidden: ['a b'] })).status).toBe(400);
  });
});
