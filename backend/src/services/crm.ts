import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { can } from '@arandue/shared/permissions';
import { type AttachmentCreateInput, attachmentCreateSchema } from '@arandue/shared/schemas';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { config } from '../config.ts';
import { db } from '../db/client.ts';
import { attachments, orders, receivablePayments, receivables, users } from '../db/schema.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { AppError, notFound } from '../lib/errors.ts';
import { reportError } from '../lib/monitoring.ts';
import { fileStorage } from '../lib/storage.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';
import { documentsHistory } from './history.ts';
import { formatCode } from './numbering.ts';
import { getOpportunity } from './opportunities.ts';

// O CRM como ponto de partida: a oportunidade reúne atendimentos, o histórico dos orçamentos, o rastreio
// dos pedidos (entrega e pagamentos) e os anexos. Cada parte respeita a permissão da tela de origem.

const MB = 1024 * 1024;
// Por quanto tempo vale o link para ver ou baixar um anexo.
const DOWNLOAD_TTL_SECONDS = 15 * 60;

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';
const kindOf = (mimeType: string): AttachmentKind => {
  const [type] = mimeType.split('/');
  return type === 'image' || type === 'video' || type === 'audio' ? type : 'file';
};

function unavailable(): never {
  throw new AppError(503, 'Os anexos ainda não estão disponíveis neste ambiente.');
}

// ---------- Limpeza ----------

// Envio que não terminou em um dia e arquivo sem registro (a restauração da demonstração volta a tabela,
// mas não apaga os arquivos). Roda no máximo a cada 6 horas por instância, junto de um envio novo.
let lastCleanup = 0;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

export async function cleanupAttachments(force = false) {
  if (!force && Date.now() - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = Date.now();
  const storage = fileStorage();
  if (!storage.available) return;
  const stale = await db
    .delete(attachments)
    .where(and(eq(attachments.status, 'pending'), lt(attachments.createdAt, sql`now() - interval '1 day'`)))
    .returning({ key: attachments.storageKey });
  const known = new Set(
    (await db.select({ key: attachments.storageKey }).from(attachments)).map((row) => row.key),
  );
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const orphans = (await storage.list())
    .filter((file) => !known.has(file.key) && file.createdAt.getTime() < hourAgo)
    .map((file) => file.key);
  await storage.remove([...stale.map((row) => row.key), ...orphans]);
}

// ---------- Anexos ----------

export async function createAttachmentUpload(ctx: Ctx, opportunityId: number, input: AttachmentCreateInput) {
  authorize(ctx, 'opportunities.update');
  const data = parse(attachmentCreateSchema, input);
  const storage = fileStorage();
  if (!storage.available) unavailable();
  await getOpportunity(ctx, opportunityId);
  if (data.size > config.ATTACHMENT_MAX_MB * MB) {
    throw new AppError(400, `O arquivo passa de ${config.ATTACHMENT_MAX_MB} MB.`);
  }
  const [used] = await db
    .select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)`.mapWith(Number) })
    .from(attachments)
    .where(eq(attachments.companyId, ctx.companyId));
  if ((used?.total ?? 0) + data.size > config.ATTACHMENTS_COMPANY_MAX_MB * MB) {
    throw new AppError(
      400,
      `A empresa chegou ao limite de ${config.ATTACHMENTS_COMPANY_MAX_MB} MB em anexos. Exclua anexos antigos.`,
    );
  }
  try {
    await cleanupAttachments();
  } catch (error) {
    // Limpeza é manutenção: falha aqui não impede o envio.
    await reportError(error);
  }

  // Chave sem o nome do arquivo (o nome pode ter qualquer caractere); a extensão ajuda quem baixa.
  const extension = path
    .extname(data.name)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 10);
  const storageKey = `${ctx.companyId}-${randomUUID()}${extension}`;
  const [row] = await db
    .insert(attachments)
    .values({
      companyId: ctx.companyId,
      opportunityId,
      userId: ctx.userId,
      kind: kindOf(data.mimeType),
      name: data.name,
      mimeType: data.mimeType,
      sizeBytes: data.size,
      storageKey,
    })
    .returning({ id: attachments.id });
  if (!row) throw new Error('Falha ao registrar o anexo.');
  return { id: row.id, upload: await storage.createUpload(storageKey, data.mimeType) };
}

async function ownAttachment(ctx: Ctx, id: number) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.companyId, ctx.companyId)));
  if (!row) throw notFound('Anexo não encontrado.');
  // Confere o acesso à oportunidade (escopo "só os próprios" incluído).
  const opportunity = await getOpportunity(ctx, row.opportunityId);
  return { row, opportunity };
}

// O navegador terminou o envio: confere o arquivo no armazenamento e libera o anexo.
export async function completeAttachment(ctx: Ctx, id: number) {
  authorize(ctx, 'opportunities.update');
  const { row, opportunity } = await ownAttachment(ctx, id);
  if (row.status === 'ready') return { id: row.id };
  const size = await fileStorage().size(row.storageKey);
  if (size === null) throw new AppError(409, 'O envio do arquivo não terminou. Tente de novo.');
  if (size > config.ATTACHMENT_MAX_MB * MB) {
    await fileStorage().remove([row.storageKey]);
    await db.delete(attachments).where(eq(attachments.id, id));
    throw new AppError(400, `O arquivo passa de ${config.ATTACHMENT_MAX_MB} MB.`);
  }
  await db.transaction(async (tx) => {
    await tx.update(attachments).set({ status: 'ready', sizeBytes: size }).where(eq(attachments.id, id));
    await audit(tx, ctx, 'update', 'opportunity', row.opportunityId, {
      label: opportunity.title,
      changes: [{ field: 'anexo', from: null, to: row.name }],
    });
  });
  return { id: row.id };
}

export async function listAttachments(ctx: Ctx, opportunityId: number) {
  authorize(ctx, 'opportunities.read');
  await getOpportunity(ctx, opportunityId);
  const rows = await db
    .select({
      id: attachments.id,
      kind: attachments.kind,
      name: attachments.name,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      storageKey: attachments.storageKey,
      createdAt: attachments.createdAt,
      userName: users.name,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.userId))
    .where(and(eq(attachments.opportunityId, opportunityId), eq(attachments.status, 'ready')))
    .orderBy(desc(attachments.createdAt), desc(attachments.id));
  const storage = fileStorage();
  const urls = storage.available
    ? await storage.downloadUrls(
        rows.map((row) => ({ key: row.storageKey, name: row.name })),
        DOWNLOAD_TTL_SECONDS,
      )
    : rows.map(() => '');
  return {
    available: storage.available,
    maxMb: config.ATTACHMENT_MAX_MB,
    items: rows.map(({ storageKey: _key, ...row }, index) => ({ ...row, url: urls[index] ?? '' })),
  };
}

export async function deleteAttachment(ctx: Ctx, id: number) {
  authorize(ctx, 'opportunities.update');
  const { row, opportunity } = await ownAttachment(ctx, id);
  await fileStorage().remove([row.storageKey]);
  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, id));
    if (row.status === 'ready') {
      await audit(tx, ctx, 'update', 'opportunity', row.opportunityId, {
        label: opportunity.title,
        changes: [{ field: 'anexo', from: row.name, to: null }],
      });
    }
  });
}

// ---------- Linha do tempo e rastreio ----------

export type TimelineSource = 'crm' | 'quote' | 'order' | 'finance' | 'attachment';

export interface TimelineEntry {
  id: string;
  at: string;
  source: TimelineSource;
  title: string;
  detail: string | null;
  userName: string | null;
  path: string | null;
  // Só nos atendimentos do CRM: a tela traduz o tipo e o canal.
  kind?: string;
  channel?: string;
}

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function getOpportunityTimeline(ctx: Ctx, id: number) {
  const opportunity = await getOpportunity(ctx, id);
  const entries: TimelineEntry[] = opportunity.interactions.map((item) => ({
    id: `crm-${item.id}`,
    at: iso(item.occurredAt),
    source: 'crm',
    title: item.kind,
    detail: item.description,
    userName: item.userName,
    path: null,
    kind: item.kind,
    channel: item.channel,
  }));

  const quoteIds = opportunity.quotes.map((quote) => quote.id);
  const orderIds = opportunity.orders.map((order) => order.id);
  const quoteNumber = new Map(opportunity.quotes.map((quote) => [quote.id, quote.number]));
  const orderNumber = new Map(opportunity.orders.map((order) => [order.id, order.number]));

  // Histórico de cada documento. "Criou" já aparece como evento do CRM.
  const [quoteHistory, orderHistory] = await Promise.all([
    documentsHistory(ctx, 'quote', quoteIds),
    documentsHistory(ctx, 'order', orderIds),
  ]);
  for (const [type, rows, numbers, base] of [
    ['quote', quoteHistory, quoteNumber, '/orcamentos'],
    ['order', orderHistory, orderNumber, '/pedidos'],
  ] as const) {
    for (const row of rows) {
      if (row.action === 'create') continue;
      entries.push({
        id: `${type}-${row.id}`,
        at: iso(row.createdAt),
        source: type,
        title: `${type === 'quote' ? 'Orçamento' : 'Pedido'} ${formatCode(numbers.get(row.entityId) ?? row.entityId)}`,
        detail: row.reason ? `${row.summary} Motivo: ${row.reason}` : row.summary,
        userName: row.actorName,
        path: `${base}/${row.entityId}`,
      });
    }
  }

  // Rastreio dos pedidos: entrega e o que já foi recebido.
  const canFinance = can(ctx.permissions, 'receivables.read');
  const payments =
    canFinance && orderIds.length
      ? await db
          .select({
            id: receivablePayments.id,
            orderId: receivablePayments.orderId,
            paidOn: receivablePayments.paidOn,
            received: receivablePayments.received,
            method: receivablePayments.method,
            createdAt: receivablePayments.createdAt,
            userName: users.name,
          })
          .from(receivablePayments)
          .leftJoin(users, eq(users.id, receivablePayments.createdBy))
          .where(
            and(
              eq(receivablePayments.companyId, ctx.companyId),
              inArray(receivablePayments.orderId, orderIds),
              isNull(receivablePayments.reversedAt),
            ),
          )
      : [];
  for (const payment of payments) {
    entries.push({
      id: `finance-${payment.id}`,
      at: iso(payment.createdAt),
      source: 'finance',
      title: `Recebimento do pedido ${formatCode(orderNumber.get(payment.orderId) ?? payment.orderId)}`,
      detail: `${money(payment.received)} em ${payment.paidOn.split('-').reverse().join('/')}${payment.method ? ` (${payment.method})` : ''}`,
      userName: payment.userName,
      path: '/contas-a-receber',
    });
  }

  const balances =
    canFinance && orderIds.length
      ? await db
          .select({
            orderId: receivables.orderId,
            total: sql<number>`sum(${receivables.amount})`.mapWith(Number),
            paid: sql<number>`sum(${receivables.paidAmount})`.mapWith(Number),
          })
          .from(receivables)
          .where(and(eq(receivables.companyId, ctx.companyId), inArray(receivables.orderId, orderIds)))
          .groupBy(receivables.orderId)
      : [];
  const balance = new Map(balances.map((row) => [row.orderId, row]));
  const ordersFull = orderIds.length
    ? await db
        .select({ id: orders.id, deliveryDate: orders.deliveryDate, deliveredOn: orders.deliveredOn })
        .from(orders)
        .where(and(eq(orders.companyId, ctx.companyId), inArray(orders.id, orderIds)))
    : [];
  const delivery = new Map(ordersFull.map((row) => [row.id, row]));

  const attachmentRows = await db
    .select({
      id: attachments.id,
      kind: attachments.kind,
      name: attachments.name,
      createdAt: attachments.createdAt,
      userName: users.name,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.userId))
    .where(and(eq(attachments.opportunityId, id), eq(attachments.status, 'ready')));
  for (const row of attachmentRows) {
    entries.push({
      id: `attachment-${row.id}`,
      at: iso(row.createdAt),
      source: 'attachment',
      title: 'Anexo adicionado',
      detail: row.name,
      userName: row.userName,
      path: null,
    });
  }

  entries.sort((a, b) => b.at.localeCompare(a.at));
  return {
    tracking: {
      quotes: opportunity.quotes.map((quote) => ({
        id: quote.id,
        number: quote.number,
        status: quote.status,
        total: quote.total,
      })),
      orders: opportunity.orders.map((order) => {
        const paid = balance.get(order.id);
        const dates = delivery.get(order.id);
        return {
          id: order.id,
          number: order.number,
          status: order.status,
          total: order.total,
          quoteId: order.quoteId ?? order.originQuoteId ?? null,
          deliveryDate: dates?.deliveryDate ?? null,
          deliveredOn: dates?.deliveredOn ?? null,
          received: canFinance ? (paid?.paid ?? 0) : null,
          open: canFinance && paid ? Math.max(0, paid.total - paid.paid) : null,
        };
      }),
    },
    entries,
  };
}
