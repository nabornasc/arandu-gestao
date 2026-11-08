import { type GoalsInput, goalsQuerySchema, goalsSchema } from '@arandue/shared/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { salesGoals, users } from '../db/schema.ts';
import { diffFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { badRequest } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';

const firstDay = (month: string) => `${month}-01`;
const round2 = (value: number) => Math.round(value * 100) / 100;

// Metas do mês e o que já foi vendido: pedidos não cancelados com data no mês, na empresa e por
// quem criou o pedido. Usuários inativos só aparecem se tinham meta ou venda no mês.
export async function getGoals(ctx: Ctx, input: unknown) {
  authorize(ctx, 'analytics.read');
  const { month } = parse(goalsQuerySchema, input);
  const start = firstDay(month);

  const goals = await db
    .select({ userId: salesGoals.userId, amount: salesGoals.amount })
    .from(salesGoals)
    .where(and(eq(salesGoals.companyId, ctx.companyId), eq(salesGoals.month, start)));
  const sales = await db.execute<{ user_id: number | null; total: string | null; is_total: number }>(sql`
    SELECT created_by AS user_id, SUM(total) AS total, GROUPING(created_by) AS is_total
    FROM orders
    WHERE company_id = ${ctx.companyId} AND status <> 'cancelled'
      AND order_date >= ${start}::date AND order_date < ${start}::date + interval '1 month'
    GROUP BY ROLLUP (created_by)`);
  const people = await db
    .select({ id: users.id, name: users.name, active: users.active })
    .from(users)
    .where(eq(users.companyId, ctx.companyId))
    .orderBy(asc(users.name));

  // ROLLUP traz uma linha por vendedor e a soma geral, marcada por GROUPING().
  const rows = [...sales];
  const companyTotal = Number(rows.find((row) => row.is_total === 1)?.total ?? 0);
  const soldBy = new Map(
    rows
      .filter((row) => row.is_total === 0 && row.user_id !== null)
      .map((row) => [row.user_id, Number(row.total)]),
  );
  const goalOf = new Map(goals.map((goal) => [goal.userId, goal.amount]));

  return {
    month,
    company: { target: goalOf.get(null) ?? null, achieved: round2(companyTotal) },
    sellers: people
      .filter((person) => person.active || goalOf.has(person.id) || soldBy.has(person.id))
      .map((person) => ({
        userId: person.id,
        name: person.name,
        target: goalOf.get(person.id) ?? null,
        achieved: round2(soldBy.get(person.id) ?? 0),
      })),
  };
}

// Grava as metas do mês de uma vez: valor vazio apaga a meta daquele vendedor (ou da empresa).
export async function saveGoals(ctx: Ctx, input: GoalsInput) {
  authorize(ctx, 'settings.update');
  const data = parse(goalsSchema, input);
  const start = firstDay(data.month);

  const ids = data.sellers.map((row) => row.userId);
  const known = ids.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.companyId, ctx.companyId), inArray(users.id, ids)))
    : [];
  if (known.length !== ids.length) throw badRequest('Vendedor não encontrado.');
  const names = new Map(known.map((row) => [row.id, row.name]));
  // Campo do histórico: meta da empresa ou "Meta de Fulano".
  const field = (userId: number | null) =>
    userId === null ? 'goal' : `Meta de ${names.get(userId) ?? userId}`;

  await db.transaction(async (tx) => {
    const previous = await tx
      .select({ userId: salesGoals.userId, amount: salesGoals.amount })
      .from(salesGoals)
      .where(and(eq(salesGoals.companyId, ctx.companyId), eq(salesGoals.month, start)))
      .for('update');
    const before = new Map(previous.map((row) => [row.userId, row.amount]));
    const wanted: { userId: number | null; amount: number | null }[] = [
      { userId: null, amount: data.company },
      ...data.sellers,
    ];
    const changes = [];
    for (const { userId, amount } of wanted) {
      const old = before.get(userId) ?? null;
      if (old === amount) continue;
      const scope = and(
        eq(salesGoals.companyId, ctx.companyId),
        eq(salesGoals.month, start),
        userId === null ? sql`${salesGoals.userId} IS NULL` : eq(salesGoals.userId, userId),
      );
      await tx.delete(salesGoals).where(scope);
      if (amount !== null) {
        await tx.insert(salesGoals).values({ companyId: ctx.companyId, month: start, userId, amount });
      }
      changes.push(...diffFields({ [field(userId)]: old }, { [field(userId)]: amount }));
    }
    if (changes.length) {
      await audit(tx, ctx, 'update', 'sales_goal', null, { label: `Metas de ${data.month}`, changes });
    }
  });
  return getGoals(ctx, { month: data.month });
}
