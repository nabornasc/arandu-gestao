import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildManualText } from '../../../scripts/manual-ia-texto.mjs';
import { db } from '../db/client.ts';
import { aiUsage, companies } from '../db/schema.ts';
import { MANUAL_TEXT } from '../services/assistant/manualText.ts';
import { costUsd } from '../services/assistant/pricing.ts';
import { aiProvider, type FakeProvider } from '../services/assistant/provider.ts';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

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

  it('falha do provedor vira 503 com mensagem clara e não grava consumo', async () => {
    const company = await signupCompany(app);
    const response = await company.post('/assistant/messages', { message: 'teste [falhar]' });
    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/não conseguiu responder agora/);
    expect(await db.select().from(aiUsage).where(eq(aiUsage.companyId, company.companyId))).toHaveLength(0);
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

describe('ferramentas de consulta do assistente', () => {
  const dayOffset = (days: number) =>
    new Date(Date.parse(`${today()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  let company: Client;

  beforeAll(async () => {
    company = await signupCompany(app);
    const customerId = (
      await company.post('/customers', { name: 'Maria Consulta', city: 'Recife', state: 'PE' })
    ).body.id;
    const productId = (
      await company.post('/products', { name: 'Caneca', type: 'product', price: 50, stock: 1, minStock: 5 })
    ).body.id;
    const order = await company.post('/orders', {
      customerId,
      orderDate: dayOffset(-10),
      items: [{ productId, quantity: 1 }],
      installments: [{ dueDate: dayOffset(-5), amount: 50, method: 'Pix' }],
    });
    expect(order.status).toBe(201);
    const expense = { category: 'Operacional', amount: 80, status: 'pending' };
    await company.post('/expenses', { ...expense, description: 'Luz', expenseDate: dayOffset(3) });
    await company.post('/expenses', { ...expense, description: 'Aluguel', expenseDate: dayOffset(20) });
  });

  it('envia as ferramentas permitidas e responde com os dados da empresa', async () => {
    const ask = async (tool: string) => {
      const response = await company.post('/assistant/messages', {
        message: `Consulta [ferramenta:${tool}]`,
      });
      expect(response.status).toBe(200);
      return JSON.parse(response.body.reply.split('\nresultado: ')[1]);
    };

    expect(await ask('contas_a_receber_vencidas')).toMatchObject({
      total: 50,
      quantidade: 1,
      maisAntigas: [{ cliente: 'Maria Consulta', emAberto: 50, diasDeAtraso: 5 }],
    });
    const payables = await ask('contas_a_pagar_da_semana');
    expect(payables).toMatchObject({
      total: 80,
      quantidade: 1,
      contas: [{ descricao: 'Luz', vencida: false }],
    });
    expect(await ask('estoque_baixo')).toMatchObject({
      quantidade: 1,
      produtos: [{ nome: 'Caneca', estoque: 0, minimo: 5 }],
    });
    expect(await ask('buscar_cliente {"nome":"maria"}')).toEqual({
      clientes: [
        {
          id: expect.any(Number),
          nome: 'Maria Consulta',
          cidade: 'Recife/PE',
          ficha: expect.stringMatching(/^\/clientes\/\d+\/ficha$/),
          emAberto: 50,
          vencido: 50,
        },
      ],
    });
    expect(await ask(`faturamento_do_periodo {"de":"${dayOffset(-30)}","ate":"${today()}"}`)).toMatchObject({
      vendas: 50,
      pedidos: 1,
      faturado: 0,
    });
    expect(await ask('buscar_cliente {"nome":"a"}')).toEqual({ erro: 'Parâmetros inválidos.' });

    const request = fake().requests.at(-1);
    expect(request?.tools?.map((tool) => tool.name)).toEqual([
      'faturamento_do_periodo',
      'contas_a_receber_vencidas',
      'contas_a_pagar_da_semana',
      'estoque_baixo',
      'buscar_cliente',
      'buscar_produto',
      'propor_cadastro_cliente',
      'propor_cadastro_fornecedor',
      'propor_cadastro_produto',
      'propor_oportunidade_crm',
      'propor_rascunho_orcamento',
    ]);
    expect(request?.context).toContain(`Hoje: ${today()}`);
  });

  it('o usuário só usa as ferramentas do seu grupo e não vê dados de outra empresa', async () => {
    const group = await company.post('/access-groups', {
      name: 'Só clientes',
      permissions: ['assistant.use', 'customers.read'],
    });
    const member = await addMember(app, company, group.body.id);
    const reply = async (client: Client, tool: string) =>
      (await client.post('/assistant/messages', { message: `Consulta [ferramenta:${tool}]` })).body
        .reply as string;

    expect(await reply(member, 'contas_a_pagar_da_semana')).toContain('Ferramenta indisponível');
    expect(
      fake()
        .requests.at(-1)
        ?.tools?.map((tool) => tool.name),
    ).toEqual(['buscar_cliente']);
    // Sem contas a receber, a busca de cliente não traz valores em aberto.
    expect(await reply(member, 'buscar_cliente {"nome":"Maria"}')).not.toContain('emAberto');

    const other = await signupCompany(app);
    expect(await reply(other, 'buscar_cliente {"nome":"Maria"}')).toContain('{"clientes":[]}');
  });
});

describe('consumo e cota do assistente em Configurações', () => {
  it('relatório do mês por dia e por usuário, só da própria empresa', async () => {
    const company = await signupCompany(app);
    await company.post('/assistant/messages', { message: 'Uma' });
    await company.post('/assistant/messages', { message: 'Duas' });
    await (await signupCompany(app)).post('/assistant/messages', { message: 'Outra empresa' });

    const report = (await company.get('/assistant/report')).body;
    const month = today().slice(0, 7);
    expect(report).toMatchObject({ month, quotaBrl: 200, maxQuotaBrl: 200, questions: 2, warning: false });
    expect(report.byUser[0].brl).toBe(report.spentBrl);
    expect(report.byDay[0].day).toBe(`${month}-01`);
    expect(report.byDay.find((row: { day: string }) => row.day === today())).toMatchObject({ questions: 2 });
    expect(report.byUser).toHaveLength(1);
    expect(report.byUser[0]).toMatchObject({ questions: 2 });

    const past = (await company.get('/assistant/report?month=2025-02')).body;
    expect(past).toMatchObject({ month: '2025-02', questions: 0, spentBrl: 0, byUser: [] });
    expect(past.byDay).toHaveLength(28);
    expect((await company.get('/assistant/report?month=2025-13')).status).toBe(400);
  });

  it('a empresa baixa a cota até zero, não passa do teto, e a mudança vai para a auditoria', async () => {
    const company = await signupCompany(app);
    expect((await company.put('/assistant/quota', { quotaBrl: 250 })).body.message).toMatch(/cota máxima/);
    expect((await company.put('/assistant/quota', { quotaBrl: -1 })).status).toBe(400);
    expect((await company.put('/assistant/quota', { quotaBrl: 50 })).body).toEqual({ quotaBrl: 50 });
    expect((await company.get('/assistant/usage')).body.quotaBrl).toBe(50);

    const logs = await db.execute<{ data: { changes: unknown[] } }>(
      sql`SELECT data FROM audit_logs WHERE company_id = ${company.companyId} AND entity = 'company' AND action = 'update'`,
    );
    expect(logs[0]?.data.changes).toEqual([{ field: 'aiMonthlyQuota', from: 200, to: 50 }]);

    await company.put('/assistant/quota', { quotaBrl: 0 });
    expect((await company.post('/assistant/messages', { message: 'Oi' })).status).toBe(429);
  });

  it('só quem altera Configurações muda a cota; quem não vê Configurações não vê o relatório', async () => {
    const reader = await addMember(
      app,
      owner,
      (await owner.post('/access-groups', { name: 'Leitor', permissions: ['settings.read'] })).body.id,
    );
    expect((await reader.get('/assistant/report')).status).toBe(200);
    expect((await reader.put('/assistant/quota', { quotaBrl: 10 })).status).toBe(403);
    const none = await addMember(
      app,
      owner,
      (await owner.post('/access-groups', { name: 'Nada', permissions: ['customers.read'] })).body.id,
    );
    expect((await none.get('/assistant/report')).status).toBe(403);
  });
});
