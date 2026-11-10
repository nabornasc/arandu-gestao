import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import { aiPendingActions, auditLogs, people } from '../db/schema.ts';
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

// O provedor falso chama a ferramenta pedida em "[ferramenta:nome {json}]".
const propose = (client: Client, tool: string, input: unknown) =>
  client.post('/assistant/messages', { message: `Faça isso [ferramenta:${tool} ${JSON.stringify(input)}]` });

describe('ações do assistente com confirmação', () => {
  it('propor cliente não grava; Confirmar grava uma vez, com o assistente na auditoria', async () => {
    const response = await propose(owner, 'propor_cadastro_cliente', {
      name: 'Maria do Documento',
      kind: 'individual',
      document: '52998224725',
      mobile: '(81) 99999-0000',
      city: 'Recife',
      state: 'PE',
    });
    expect(response.status).toBe(200);
    expect(response.body.reply).toContain('"acaoPendente":true');
    const [action] = response.body.actions;
    expect(action.summary).toContain('Novo cliente');
    expect(action.summary).toContain('CPF: 529.982.247-25');
    expect(action.summary).toContain('Cidade: Recife/PE');

    const byName = () =>
      db
        .select()
        .from(people)
        .where(and(eq(people.companyId, owner.companyId), eq(people.name, 'Maria do Documento')));
    expect(await byName()).toHaveLength(0);

    const confirmed = await owner.post(`/assistant/actions/${action.id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.message).toMatch(/Cliente Maria do Documento cadastrado/);
    const [person] = await byName();
    expect(person).toMatchObject({ isCustomer: true, document: '52998224725' });
    expect(confirmed.body.path).toBe(`/clientes/${person?.id}/ficha`);

    const [log] = await db
      .select({ actor: auditLogs.actor, action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'person'), eq(auditLogs.entityId, person?.id ?? 0)));
    expect(log).toMatchObject({ actor: 'assistant', action: 'create' });

    const again = await owner.post(`/assistant/actions/${action.id}/confirm`);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/já foi confirmada/);
  });

  it('dado inválido volta ao modelo como erro, sem criar ação', async () => {
    const response = await propose(owner, 'propor_cadastro_cliente', {
      name: 'Sem CPF',
      document: '11111111111',
    });
    expect(response.body.reply).toContain('Dados inválidos');
    expect(response.body.reply).toContain('CPF inválido');
    expect(response.body.actions).toEqual([]);
  });

  it('cancelar, vencer e confirmar de outro usuário não gravam nada', async () => {
    const first = (await propose(owner, 'propor_cadastro_fornecedor', { name: 'Fornecedor Cancelado' })).body
      .actions[0];
    expect((await owner.post(`/assistant/actions/${first.id}/cancel`)).body.message).toMatch(/cancelada/);
    expect((await owner.post(`/assistant/actions/${first.id}/confirm`)).body.message).toMatch(
      /foi cancelada/,
    );

    const second = (await propose(owner, 'propor_cadastro_fornecedor', { name: 'Fornecedor Vencido' })).body
      .actions[0];
    await db
      .update(aiPendingActions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(aiPendingActions.id, second.id));
    expect((await owner.post(`/assistant/actions/${second.id}/confirm`)).body.message).toMatch(/venceu/);

    const third = (await propose(owner, 'propor_cadastro_fornecedor', { name: 'Fornecedor Alheio' })).body
      .actions[0];
    const other = await signupCompany(app);
    expect((await other.post(`/assistant/actions/${third.id}/confirm`)).status).toBe(404);
    expect((await owner.post('/assistant/actions/nao-e-uuid/confirm')).status).toBe(400);

    const names = await db
      .select({ name: people.name })
      .from(people)
      .where(eq(people.companyId, owner.companyId));
    expect(names.map((row) => row.name)).not.toContain('Fornecedor Cancelado');
    expect(names.map((row) => row.name)).not.toContain('Fornecedor Vencido');
  });

  it('produto, oportunidade e orçamento em rascunho, com o resumo montado no servidor', async () => {
    const product = (
      await propose(owner, 'propor_cadastro_produto', { name: 'Bolo de pote', type: 'product', price: 12.5 })
    ).body.actions[0];
    expect(product.summary).toContain('Preço: R$');
    const created = await owner.post(`/assistant/actions/${product.id}/confirm`);
    expect(created.body).toMatchObject({ path: '/produtos' });

    const found = await owner.post('/assistant/messages', {
      message: 'Ache [ferramenta:buscar_produto {"busca":"bolo"}]',
    });
    const productId = JSON.parse(found.body.reply.split('\nresultado: ')[1]).produtos[0].id;
    const customerId = (await owner.post('/customers', { name: 'Cliente do Orçamento' })).body.id;

    const opportunity = (
      await propose(owner, 'propor_oportunidade_crm', {
        title: 'Festa de aniversário',
        customerId,
        source: 'Telegram',
        estimatedValue: 300,
      })
    ).body.actions[0];
    expect(opportunity.summary).toContain('Cliente: Cliente do Orçamento');
    const crm = await owner.post(`/assistant/actions/${opportunity.id}/confirm`);
    expect(crm.body.path).toMatch(/^\/crm\/\d+$/);

    const quote = (
      await propose(owner, 'propor_rascunho_orcamento', {
        customerId,
        items: [
          { productId, quantity: 20 },
          { description: 'Entrega', quantity: 1, unitPrice: 15 },
        ],
      })
    ).body.actions[0];
    expect(quote.summary).toContain('- 20 × Bolo de pote (preço do cadastro)');
    expect(quote.summary).toContain('- 1 × Entrega (R$');
    const draft = await owner.post(`/assistant/actions/${quote.id}/confirm`);
    expect(draft.body.path).toMatch(/^\/orcamentos\/\d+$/);
    const detail = await owner.get(draft.body.path.replace('/orcamentos', '/quotes'));
    expect(detail.body).toMatchObject({ status: 'draft', customerId });

    const missing = await propose(owner, 'propor_rascunho_orcamento', {
      items: [{ productId: 999999, quantity: 1 }],
    });
    expect(missing.body.reply).toContain('Produto 999999 não encontrado');
  });

  it('sem permissão de cadastro, as ferramentas de ação nem vão ao modelo', async () => {
    const group = await owner.post('/access-groups', {
      name: 'Só consulta',
      permissions: ['assistant.use', 'customers.read', 'products.read'],
    });
    const member = await addMember(app, owner, group.body.id);
    const response = await propose(member, 'propor_cadastro_cliente', { name: 'Não pode' });
    expect(response.body.reply).toContain('Ferramenta indisponível');
    expect(
      fake()
        .requests.at(-1)
        ?.tools?.map((tool) => tool.name),
    ).toEqual(['estoque_baixo', 'buscar_cliente', 'buscar_produto']);
  });

  it('anexo de imagem ou PDF vai ao provedor; tipo e tamanho são conferidos', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    const ok = await owner.post('/assistant/messages', {
      message: 'Leia este documento',
      attachment: { mediaType: 'image/png', name: 'cartao.png', data: png },
    });
    expect(ok.status).toBe(200);
    expect(fake().requests.at(-1)?.attachment).toEqual({
      mediaType: 'image/png',
      name: 'cartao.png',
      data: png,
    });
    expect(fake().requests.at(-1)?.maxTokens).toBe(2048);

    const wrongType = await owner.post('/assistant/messages', {
      message: 'Leia',
      attachment: { mediaType: 'text/plain', data: png },
    });
    expect(wrongType.status).toBe(400);
    const tooBig = await owner.post('/assistant/messages', {
      message: 'Leia',
      attachment: { mediaType: 'application/pdf', data: 'A'.repeat(4_300_000) },
    });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.message).toMatch(/3 MB/);
  });
});
