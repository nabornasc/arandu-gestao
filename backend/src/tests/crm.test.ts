import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany, today } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;
let customerId: number;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  await owner.post('/bank-accounts', {
    bankName: 'B',
    accountName: 'C',
    accountType: 'cash',
    initialBalance: 0,
  });
  productId = (await owner.post('/products', { name: 'Vaso', type: 'product', price: 40, stock: 500 })).body
    .id;
  customerId = (await owner.post('/customers', { name: 'Cliente do CRM' })).body.id;
});
afterAll(() => app.close());

const newOpportunity = async () =>
  (await owner.post('/opportunities', { title: 'Central', customerId, source: 'Site' })).body as {
    id: number;
  };

const newQuote = async (opportunityId: number, quantity: number) =>
  (await owner.post('/quotes', { customerId, opportunityId, items: [{ productId, quantity }] })).body as {
    id: number;
  };

interface Entry {
  at: string;
  source: string;
  title: string;
  detail: string;
  path: string | null;
  kind?: string;
}

describe('CRM como central: linha do tempo de todos os setores', () => {
  it('reúne atendimento, histórico do orçamento, pedido e recebimento, com o rastreio', async () => {
    const opp = await newOpportunity();
    await owner.post(`/opportunities/${opp.id}/interactions`, {
      kind: 'call',
      channel: 'phone',
      description: 'Cliente pediu orçamento',
    });
    const quote = await newQuote(opp.id, 2);
    await owner.post(`/quotes/${quote.id}/send`);
    await owner.post(`/quotes/${quote.id}/approve`);
    const order = (await owner.post(`/quotes/${quote.id}/convert`, { orderDate: today() })).body;
    expect((await owner.post(`/orders/${order.id}/settle`, {})).status).toBe(200);

    const response = await owner.get(`/opportunities/${opp.id}/timeline`);
    expect(response.status).toBe(200);
    const entries = response.body.entries as Entry[];
    const sources = new Set(entries.map((entry) => entry.source));
    expect([...sources]).toEqual(expect.arrayContaining(['crm', 'quote', 'order', 'finance']));
    expect(entries.find((entry) => entry.kind === 'call')?.detail).toBe('Cliente pediu orçamento');
    const quoteEntries = entries.filter((entry) => entry.source === 'quote');
    expect(quoteEntries.length).toBeGreaterThanOrEqual(2);
    expect(quoteEntries[0]?.path).toBe(`/orcamentos/${quote.id}`);
    expect(entries.find((entry) => entry.source === 'finance')?.detail).toMatch(/R\$\s?80,00/);
    // Mais recente primeiro.
    const dates = entries.map((entry) => entry.at);
    expect([...dates].sort().reverse()).toEqual(dates);

    expect(response.body.tracking.quotes).toHaveLength(1);
    expect(response.body.tracking.orders[0]).toMatchObject({
      id: order.id,
      received: 80,
      open: 0,
      quoteId: quote.id,
    });
  });

  it('quem não vê o financeiro não recebe pagamentos nem valores recebidos', async () => {
    const opp = await newOpportunity();
    const quote = await newQuote(opp.id, 1);
    await owner.post(`/quotes/${quote.id}/send`);
    await owner.post(`/quotes/${quote.id}/approve`);
    const converted = await owner.post(`/quotes/${quote.id}/convert`, { orderDate: today() });
    expect(converted.status).toBe(201);
    expect((await owner.post(`/orders/${converted.body.id}/settle`, {})).status).toBe(200);
    const group = await owner.post('/access-groups', {
      name: 'Só CRM e vendas',
      permissions: ['opportunities.read', 'quotes.read', 'orders.read'],
    });
    const seller = await addMember(app, owner, group.body.id);
    const { entries, tracking } = (await seller.get(`/opportunities/${opp.id}/timeline`)).body;
    expect((entries as Entry[]).some((entry) => entry.source === 'finance')).toBe(false);
    expect(tracking.orders[0]).toMatchObject({ received: null, open: null });
  });
});

describe('anexos do CRM', () => {
  async function upload(
    client: Client,
    opportunityId: number,
    name: string,
    mimeType: string,
    content: Buffer,
  ) {
    const created = await client.post(`/opportunities/${opportunityId}/attachments`, {
      name,
      mimeType,
      size: content.length,
    });
    if (created.status !== 201) return { created };
    const put = await app.inject({
      method: 'PUT',
      url: created.body.upload.url,
      headers: created.body.upload.headers,
      payload: content,
    });
    return { created, put };
  }

  it('envia, conclui, lista com link, baixa o conteúdo e exclui o arquivo', async () => {
    const opp = await newOpportunity();
    const content = Buffer.from('ID3 áudio de teste');
    const { created, put } = await upload(owner, opp.id, 'recado do cliente.mp3', 'audio/mpeg', content);
    expect(created.status).toBe(201);
    expect(put?.statusCode).toBe(200);
    expect((await owner.post(`/attachments/${created.body.id}/complete`)).status).toBe(200);

    const list = (await owner.get(`/opportunities/${opp.id}/attachments`)).body;
    expect(list).toMatchObject({ available: true, maxMb: 50 });
    expect(list.items[0]).toMatchObject({
      name: 'recado do cliente.mp3',
      kind: 'audio',
      sizeBytes: content.length,
    });
    const file = await app.inject({ method: 'GET', url: list.items[0].url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('audio/mpeg');
    expect(file.rawPayload.equals(content)).toBe(true);

    const timeline = (await owner.get(`/opportunities/${opp.id}/timeline`)).body;
    expect(timeline.entries[0]).toMatchObject({ source: 'attachment', detail: 'recado do cliente.mp3' });

    // A URL assinada não vale alterada, e o mesmo envio não grava duas vezes.
    expect((await app.inject({ method: 'GET', url: `${list.items[0].url}0` })).statusCode).toBe(404);
    const again = await app.inject({
      method: 'PUT',
      url: created.body.upload.url,
      headers: created.body.upload.headers,
      payload: content,
    });
    expect(again.statusCode).toBe(400);

    const key = new URL(list.items[0].url, 'http://x').searchParams.get('key') ?? '';
    const stored = path.resolve('.uploads-test', key);
    expect(existsSync(stored)).toBe(true);
    expect((await owner.del(`/attachments/${created.body.id}`)).status).toBe(204);
    expect(existsSync(stored)).toBe(false);
    expect((await owner.get(`/opportunities/${opp.id}/attachments`)).body.items).toEqual([]);
  });

  it('confere tipo, tamanho, envio incompleto, outra empresa e permissão', async () => {
    const opp = await newOpportunity();
    const bad = await owner.post(`/opportunities/${opp.id}/attachments`, {
      name: 'x.exe',
      mimeType: 'application/x-msdownload',
      size: 10,
    });
    expect(bad.status).toBe(400);
    const big = await owner.post(`/opportunities/${opp.id}/attachments`, {
      name: 'filme.mp4',
      mimeType: 'video/mp4',
      size: 60 * 1024 * 1024,
    });
    expect(big.body.message).toMatch(/passa de 50 MB/);

    const pending = await owner.post(`/opportunities/${opp.id}/attachments`, {
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      size: 10,
    });
    expect((await owner.post(`/attachments/${pending.body.id}/complete`)).body.message).toMatch(
      /não terminou/,
    );

    const other = await signupCompany(app);
    expect((await other.get(`/opportunities/${opp.id}/attachments`)).status).toBe(404);
    expect((await other.del(`/attachments/${pending.body.id}`)).status).toBe(404);

    const reader = await addMember(
      app,
      owner,
      (await owner.post('/access-groups', { name: 'Leitor CRM', permissions: ['opportunities.read'] })).body
        .id,
    );
    expect((await reader.get(`/opportunities/${opp.id}/attachments`)).status).toBe(200);
    const denied = await upload(reader, opp.id, 'nota.pdf', 'application/pdf', Buffer.from('%PDF'));
    expect(denied.created.status).toBe(403);
  });
});
