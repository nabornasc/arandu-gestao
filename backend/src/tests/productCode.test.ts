import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let other: Client;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  other = await signupCompany(app);
});
afterAll(() => app.close());

const create = (client: Client, name: string, code?: string | null) =>
  client.post('/products', { name, type: 'product', price: 10, stock: 5, code });

describe('código próprio do produto', () => {
  it('guarda o código sem espaços nas pontas e vazio vira nulo', async () => {
    const withCode = await create(owner, 'Água tônica', '  AT-350 ');
    expect(withCode.status).toBe(201);
    expect(withCode.body.code).toBe('AT-350');
    const without = await create(owner, 'Gelo', '');
    expect(without.body.code).toBeNull();
  });

  it('código repetido na mesma empresa responde 409, sem diferenciar maiúsculas', async () => {
    await create(owner, 'Suco de uva', 'SU-1');
    const again = await create(owner, 'Suco de laranja', 'su-1');
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Já existe um produto com esse código.');
  });

  it('outra empresa pode usar o mesmo código', async () => {
    expect((await create(other, 'Suco de uva', 'SU-1')).status).toBe(201);
  });

  it('produtos sem código não conflitam entre si', async () => {
    expect((await create(owner, 'Sem código 1', null)).status).toBe(201);
    expect((await create(owner, 'Sem código 2', null)).status).toBe(201);
  });

  it('produto excluído libera o código', async () => {
    const first = await create(owner, 'Vinho', 'VN-750');
    expect((await owner.del(`/products/${first.body.id}`)).status).toBe(204);
    expect((await create(owner, 'Vinho novo', 'VN-750')).status).toBe(201);
  });

  it('editar para um código em uso responde 409', async () => {
    const product = await create(owner, 'Refrigerante', 'RF-2L');
    await create(owner, 'Refrigerante zero', 'RZ-2L');
    const response = await owner.put(`/products/${product.body.id}`, {
      name: 'Refrigerante',
      type: 'product',
      price: 10,
      code: 'RZ-2L',
    });
    expect(response.status).toBe(409);
  });

  it('a busca rápida acha o produto pelo código', async () => {
    await create(owner, 'Energético', 'EN-250');
    const results = (await owner.get('/search?q=en-25')).body as {
      type: string;
      title: string;
      detail: string;
    }[];
    const product = results.find((row) => row.type === 'product');
    expect(product?.title).toBe('Energético');
    expect(product?.detail).toContain('EN-250');
  });
});
