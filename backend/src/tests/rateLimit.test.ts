import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consume, hit } from '../services/rateLimit.ts';
import { createApp, login, PASSWORD } from './helpers.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createApp();
});
afterAll(() => app.close());

const register = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { companyName: 'Loja', name: 'Maria', email, password: PASSWORD },
  });

describe('limite de tentativas no banco', () => {
  it('conta tentativas simultâneas sem perder nenhuma', async () => {
    const key = `teste:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => hit(key, 60_000)));
    const counts = results.map((result) => result.count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it('recusa com 429 quem passa do limite, mesmo em paralelo', async () => {
    const key = `teste:${randomUUID()}`;
    const limit = { max: 3, windowMs: 60_000 };
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consume(key, limit)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 429 });
    }
  });

  it('a janela vencida recomeça a contagem', async () => {
    const key = `teste:${randomUUID()}`;
    await hit(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await hit(key, 60_000)).count).toBe(1);
  });
});

describe('bloqueio de login por e-mail', () => {
  it('depois de 10 tentativas, recusa até a senha certa', async () => {
    const email = `bloqueio-${randomUUID()}@auth.test`;
    await register(email);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(app, email, 'senha-errada-000')).statusCode).toBe(401);
    }
    const blocked = await login(app, email);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().message).toMatch(/Muitas tentativas/);
  });

  it('e-mail inexistente recebe o mesmo bloqueio (não revela quem tem conta)', async () => {
    const email = `ninguem-${randomUUID()}@auth.test`;
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(app, email, 'senha-errada-000')).statusCode).toBe(401);
    }
    expect((await login(app, email, 'senha-errada-000')).statusCode).toBe(429);
  });

  it('login certo zera as tentativas erradas', async () => {
    const email = `zera-${randomUUID()}@auth.test`;
    await register(email);
    for (let attempt = 0; attempt < 9; attempt++) await login(app, email, 'senha-errada-000');
    expect((await login(app, email)).statusCode).toBe(200);
    for (let attempt = 0; attempt < 9; attempt++) {
      expect((await login(app, email, 'senha-errada-000')).statusCode).toBe(401);
    }
    expect((await login(app, email)).statusCode).toBe(200);
  });

  it('tentativas em paralelo não furam o limite', async () => {
    const email = `paralelo-${randomUUID()}@auth.test`;
    await register(email);
    const results = await Promise.all(
      Array.from({ length: 15 }, () => login(app, email, 'senha-errada-000')),
    );
    const codes = results.map((result) => result.statusCode);
    expect(codes.filter((code) => code === 401)).toHaveLength(10);
    expect(codes.filter((code) => code === 429)).toHaveLength(5);
  });
});
