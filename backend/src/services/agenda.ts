import { can } from '@arandue/shared/permissions';
import {
  type AgendaEventInput,
  type AgendaKind,
  agendaEventSchema,
  agendaQuerySchema,
} from '@arandue/shared/schemas';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { agendaEvents, expenses, opportunities, orders, people, quotes, receivables } from '../db/schema.ts';
import { diffFields, initialFields, pick, removedFields } from '../lib/changes.ts';
import { authorize, type Ctx, ownScope } from '../lib/context.ts';
import { notFound } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';
import { formatCode } from './numbering.ts';

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  date: string;
  time: string | null;
  title: string;
  detail: string | null;
  amount: number | null;
  path: string | null;
  // Só tarefas: as demais saem da agenda quando o documento muda de situação.
  eventId: number | null;
  done: boolean;
  notes: string | null;
}

const TRACKED = ['title', 'date', 'time', 'notes', 'done'] as const;
const shortTime = (value: string | null) => (value ? value.slice(0, 5) : null);
const scoped = (ctx: Ctx, id: number) =>
  and(
    eq(agendaEvents.id, id),
    eq(agendaEvents.companyId, ctx.companyId),
    ownScope(ctx, agendaEvents.createdBy),
  );

// Junta tarefas e prazos dos módulos que o grupo pode ver, respeitando o escopo "só os próprios".
export async function getAgenda(ctx: Ctx, input: unknown) {
  authorize(ctx, 'agenda.read');
  const { from, to } = parse(agendaQuerySchema, input);
  const items: AgendaItem[] = [];

  const events = await db
    .select()
    .from(agendaEvents)
    .where(
      and(
        eq(agendaEvents.companyId, ctx.companyId),
        ownScope(ctx, agendaEvents.createdBy),
        gte(agendaEvents.date, from),
        lte(agendaEvents.date, to),
      ),
    );
  for (const event of events) {
    items.push({
      id: `task-${event.id}`,
      kind: 'task',
      date: event.date,
      time: shortTime(event.time),
      title: event.title,
      detail: null,
      amount: null,
      path: null,
      eventId: event.id,
      done: event.done,
      notes: event.notes,
    });
  }

  if (can(ctx.permissions, 'opportunities.read')) {
    const rows = await db
      .select({
        id: opportunities.id,
        date: opportunities.nextActionAt,
        title: opportunities.title,
        action: opportunities.nextAction,
        value: opportunities.estimatedValue,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.companyId, ctx.companyId),
          eq(opportunities.status, 'open'),
          ownScope(ctx, opportunities.ownerId),
          gte(opportunities.nextActionAt, from),
          lte(opportunities.nextActionAt, to),
        ),
      );
    for (const row of rows) {
      items.push(
        item(
          'opportunity',
          row.id,
          row.date ?? from,
          row.action ?? 'Próxima ação',
          row.title,
          row.value,
          `/crm/${row.id}`,
        ),
      );
    }
  }

  if (can(ctx.permissions, 'quotes.read')) {
    const rows = await db
      .select({
        id: quotes.id,
        date: quotes.validUntil,
        number: quotes.number,
        customer: people.name,
        total: quotes.total,
      })
      .from(quotes)
      .leftJoin(people, eq(people.id, quotes.customerId))
      .where(
        and(
          eq(quotes.companyId, ctx.companyId),
          inArray(quotes.status, ['sent', 'approved']),
          ownScope(ctx, quotes.createdBy),
          gte(quotes.validUntil, from),
          lte(quotes.validUntil, to),
          // Aprovado que já virou pedido não tem mais validade a acompanhar.
          sql`NOT EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.quoteId} = ${quotes.id})`,
        ),
      );
    for (const row of rows) {
      items.push(
        item(
          'quote',
          row.id,
          row.date ?? from,
          `Validade do orçamento ${formatCode(row.number)}`,
          row.customer,
          row.total,
          `/orcamentos/${row.id}`,
        ),
      );
    }
  }

  if (can(ctx.permissions, 'receivables.read')) {
    const rows = await db
      .select({
        id: receivables.id,
        date: receivables.dueDate,
        orderId: orders.id,
        number: orders.number,
        customer: people.name,
        balance: sql<number>`${receivables.amount} - ${receivables.paidAmount}`.mapWith(Number),
      })
      .from(receivables)
      .innerJoin(orders, eq(orders.id, receivables.orderId))
      .leftJoin(people, eq(people.id, orders.customerId))
      .where(
        and(
          eq(receivables.companyId, ctx.companyId),
          eq(receivables.status, 'open'),
          gte(receivables.dueDate, from),
          lte(receivables.dueDate, to),
        ),
      );
    for (const row of rows) {
      items.push(
        item(
          'receivable',
          row.id,
          row.date,
          `A receber: pedido ${formatCode(row.number)}`,
          row.customer,
          row.balance,
          `/pedidos/${row.orderId}`,
        ),
      );
    }
  }

  if (can(ctx.permissions, 'payables.read')) {
    const rows = await db
      .select({
        id: expenses.id,
        date: expenses.expenseDate,
        title: expenses.description,
        amount: expenses.amount,
        supplier: people.name,
      })
      .from(expenses)
      .leftJoin(people, eq(people.id, expenses.supplierId))
      .where(
        and(
          eq(expenses.companyId, ctx.companyId),
          eq(expenses.status, 'pending'),
          gte(expenses.expenseDate, from),
          lte(expenses.expenseDate, to),
        ),
      );
    for (const row of rows) {
      items.push(
        item('payable', row.id, row.date, `A pagar: ${row.title}`, row.supplier, row.amount, '/despesas'),
      );
    }
  }

  // Por data e hora; sem hora, depois dos horários marcados do mesmo dia.
  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? '99').localeCompare(b.time ?? '99') ||
      a.title.localeCompare(b.title),
  );
  return items;
}

const item = (
  kind: AgendaKind,
  id: number,
  date: string,
  title: string,
  detail: string | null,
  amount: number | null,
  path: string,
): AgendaItem => ({
  id: `${kind}-${id}`,
  kind,
  date,
  time: null,
  title,
  detail,
  amount,
  path,
  eventId: null,
  done: false,
  notes: null,
});

export async function createAgendaEvent(ctx: Ctx, input: AgendaEventInput) {
  authorize(ctx, 'agenda.create');
  const data = parse(agendaEventSchema, input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(agendaEvents)
      .values({ ...data, time: data.time ?? null, companyId: ctx.companyId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error('Falha ao criar a tarefa.');
    await audit(tx, ctx, 'create', 'agenda_event', row.id, {
      label: row.title,
      changes: initialFields(pick(row, TRACKED)),
    });
    return row;
  });
}

export async function updateAgendaEvent(ctx: Ctx, id: number, input: AgendaEventInput) {
  authorize(ctx, 'agenda.update');
  const data = parse(agendaEventSchema, input);
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(agendaEvents).where(scoped(ctx, id)).for('update');
    if (!previous) throw notFound('Tarefa não encontrada.');
    const [row] = await tx
      .update(agendaEvents)
      .set({ ...data, time: data.time ?? null })
      .where(scoped(ctx, id))
      .returning();
    if (!row) throw notFound('Tarefa não encontrada.');
    const changes = diffFields(pick(previous, TRACKED), pick(row, TRACKED));
    if (changes.length) await audit(tx, ctx, 'update', 'agenda_event', id, { label: row.title, changes });
    return row;
  });
}

export async function deleteAgendaEvent(ctx: Ctx, id: number) {
  authorize(ctx, 'agenda.delete');
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(agendaEvents).where(scoped(ctx, id)).returning();
    if (!row) throw notFound('Tarefa não encontrada.');
    await audit(tx, ctx, 'delete', 'agenda_event', id, {
      label: row.title,
      changes: removedFields(pick(row, TRACKED)),
    });
  });
}
