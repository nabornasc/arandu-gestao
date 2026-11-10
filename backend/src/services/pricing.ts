import { sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { todayInBrazil } from './orders.ts';

// Base do assistente de precificação: médias mensais dos últimos três meses fechados. O mês corrente
// fica de fora porque ainda está pela metade.
const MONTHS = 3;

export async function getPricingBase(ctx: Ctx) {
  authorize(ctx, 'costs.read');
  const window = sql`date_trunc('month', ${todayInBrazil()}::date) - interval '${sql.raw(String(MONTHS))} months'`;
  const end = sql`date_trunc('month', ${todayInBrazil()}::date)`;

  const [revenue] = await db.execute<{ total: string; from: string; to: string }>(sql`
    SELECT COALESCE(SUM(total), 0) AS total,
           to_char(${window}, 'YYYY-MM-DD') AS "from",
           to_char(${end} - interval '1 day', 'YYYY-MM-DD') AS "to"
    FROM orders
    WHERE company_id = ${ctx.companyId} AND status <> 'cancelled'
      AND order_date >= ${window} AND order_date < ${end}`);

  // Despesas pagas por categoria: a tela deixa marcar quais são fixas.
  const categories = await db.execute<{ category: string | null; total: string }>(sql`
    SELECT category, SUM(amount) AS total
    FROM expenses
    WHERE company_id = ${ctx.companyId} AND status = 'paid'
      AND expense_date >= ${window} AND expense_date < ${end}
    GROUP BY category
    ORDER BY SUM(amount) DESC`);

  const monthly = (value: string | number) => Math.round((Number(value) / MONTHS) * 100) / 100;
  return {
    months: MONTHS,
    from: revenue?.from ?? null,
    to: revenue?.to ?? null,
    monthlyRevenue: monthly(revenue?.total ?? 0),
    expenses: categories.map((row) => ({
      category: row.category ?? 'Sem categoria',
      monthly: monthly(row.total),
    })),
  };
}
