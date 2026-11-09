import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildManualText } from '../../../scripts/manual-ia-texto.mjs';
import { db } from '../db/client.ts';
import { aiUsage, companies } from '../db/schema.ts';
import { MANUAL_TEXT } from '../services/assistant/manualText.ts';
import { costUsd } from '../services/assistant/pricing.ts';
import { aiProvider, type FakeProvider } from '../services/assistant/provider.ts';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
const fake = () => aiProvider() as FakeProvider;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
});
afterAll(() => app.close());

describe('assistente de IA', () => {
  it('responde com o manual em cache e o contexto da empresa, e grava o consumo', async () => {
    const response = await owner.post('/assistant/messages', { message: 'Como crio um pedido?' });
    expect(response.status).toBe(200);
    expect(response.body.reply).toContain('Como crio um pedido?');

    const request = fake().requests.at(-1);
    expect(request?.stable).toContain('<artigo titulo="Criar um pedido de venda"');
    expect(request?.context).toContain('Áreas que este usuário acessa');
    expect(request?.messages.at(-1)).toEqual({ role: 'user', content: 'Como crio um pedido?' });

    const rows = await db.select().from(aiUsage).where(eq(aiUsage.companyId, owner.companyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: 'web',
      inputTokens: 1200,
      outputTokens: 150,
      cacheReadTokens: 11000,
    });
    expect(rows[0]?.costBrl).toBeGreaterThan(0);
    expect(response.body.usage).toMatchObject({ quotaBrl: 200, warning: false });
  });

  it('as instruções em cache são iguais para todas as empresas', async () => {
    const other = await signupCompany(app);
    await owner.post('/assistant/messages', { message: 'Oi' });
    await other.post('/assistant/messages', { message: 'Oi' });
    const [a, b] = fake().requests.slice(-2);
    expect(a?.stable).toBe(b?.stable);
    expect(a?.stable).not.toContain('Empresa:');
  });

  it('para de responder quando a cota do mês acaba e avisa a partir de 80%', async () => {
    const company = await signupCompany(app);
    await db.update(companies).set({ aiMonthlyQuota: 1 }).where(eq(companies.id, company.companyId));
    const spend = (costBrl: number) =>
      db.insert(aiUsage).values({
        companyId: company.companyId,
        channel: 'web',
        model: 'claude-haiku-5-5',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        costBrl,
      });
    await spend(0.85);
    const first = await company.post('/assistant/messages', { message: 'Primeira' });
    expect(first.status).toBe(200);
    expect(first.body.usage.warning).toBe(true);
    await spend(0.2);
    const blocked = await company.post('/assistant/messages', { message: 'Segunda' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Limite mensal do assistente/);
    expect((await company.get('/assistant/usage')).body).toMatchObject({ quotaBrl: 1, warning: true });
  });

  it('recusa do modelo vira resposta neutra; histórico longo ou pergunta vazia são recusados', async () => {
    expect((await owner.post('/assistant/messages', { message: 'teste [recusar]' })).body.reply).toMatch(
      /Não posso ajudar/,
    );
    expect((await owner.post('/assistant/messages', { message: '' })).status).toBe(400);
    const history = Array.from({ length: 11 }, () => ({ role: 'user', content: 'x' }));
    expect((await owner.post('/assistant/messages', { message: 'Oi', history })).status).toBe(400);
  });

  it('grupo sem a permissão não usa o assistente', async () => {
    const groups = (await owner.get('/access-groups')).body as { id: number; name: string }[];
    const created = await owner.post('/access-groups', { name: 'Sem IA', permissions: ['customers.read'] });
    expect(created.status).toBe(201);
    const member = await addMember(app, owner, created.body.id);
    expect(groups.length).toBeGreaterThan(0);
    expect((await member.post('/assistant/messages', { message: 'Oi' })).status).toBe(403);
  });

  it('custo por modelo: Haiku 5.5 com cache sai a menos de um décimo de centavo de dólar', () => {
    const cost = costUsd('claude-haiku-5-5', {
      inputTokens: 3000,
      outputTokens: 300,
      cacheWriteTokens: 0,
      cacheReadTokens: 11000,
    });
    expect(cost).toBeCloseTo(0.00056, 5);
    expect(
      costUsd('modelo-desconhecido', {
        inputTokens: 1000,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      }),
    ).toBe(0.01);
  });

  it('o texto do manual do assistente está atualizado com docs/manual (rode npm run manual:ia)', () => {
    expect(MANUAL_TEXT).toBe(buildManualText('../docs/manual'));
    expect(readFileSync('src/services/assistant/manualText.ts', 'utf8')).toContain('Gerado por');
  });
});
