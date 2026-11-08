import { can } from '@arandue/shared/permissions';
import { and, asc, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { orders, people, products } from '../db/schema.ts';
import { authorize, type Ctx } from '../lib/context.ts';

interface Summary extends Record<string, unknown> {
  revenue_month: string;
  expenses_month: string;
  balance: string;
  pending_orders: number;
  revenue_year: string;
  mei_annual_limit: string | null;
}

// Juros e descontos dados na baixa mudam o valor faturado dos pedidos quitados.
const settlementAdjustment = (companyId: number, period: 'month' | 'year') => sql`
  COALESCE((SELECT SUM(p.interest - p.discount)
            FROM receivable_payments p JOIN orders o ON o.id = p.order_id
            WHERE p.company_id = ${companyId} AND p.reversed_at IS NULL
              AND o.status IN ('paid', 'completed')
              AND o.order_date >= date_trunc(${period}, CURRENT_DATE)), 0)`;

// Resumo do mês corrente. Os KPIs completos (ticket médio, conversão, funil) chegam na semana 3.
export async function getDashboard(ctx: Ctx) {
  authorize(ctx, 'analytics.read');
  const companyId = ctx.companyId;

  const [summary] = await db.execute<Summary>(sql`
    SELECT
      COALESCE((SELECT SUM(total) FROM orders
                WHERE company_id = ${companyId} AND status IN ('paid', 'completed')
                  AND order_date >= date_trunc('month', CURRENT_DATE)), 0)
      + ${settlementAdjustment(companyId, 'month')} AS revenue_month,
      COALESCE((SELECT SUM(amount) FROM expenses
                WHERE company_id = ${companyId} AND status = 'paid'
                  AND expense_date >= date_trunc('month', CURRENT_DATE)), 0) AS expenses_month,
      -- Saldo = saldo inicial + movimentações, considerando só contas ativas (nos dois termos).
      COALESCE((SELECT SUM(initial_balance) FROM bank_accounts
                WHERE company_id = ${companyId} AND active), 0)
      + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
                  FROM cash_transactions t JOIN bank_accounts a ON a.id = t.bank_account_id
                  WHERE t.company_id = ${companyId} AND a.active), 0) AS balance,
      (SELECT COUNT(*)::int FROM orders WHERE company_id = ${companyId} AND status = 'pending') AS pending_orders,
      COALESCE((SELECT SUM(total) FROM orders
                WHERE company_id = ${companyId} AND status IN ('paid', 'completed')
                  AND order_date >= date_trunc('year', CURRENT_DATE)), 0)
      + ${settlementAdjustment(companyId, 'year')} AS revenue_year,
      (SELECT mei_annual_limit FROM companies WHERE id = ${companyId}) AS mei_annual_limit
  `);

  const recentOrders = await db
    .select({
      id: orders.id,
      number: orders.number,
      orderDate: orders.orderDate,
      total: orders.total,
      status: orders.status,
      customerName: people.name,
    })
    .from(orders)
    .leftJoin(people, and(eq(people.id, orders.customerId)))
    .where(eq(orders.companyId, companyId))
    .orderBy(desc(orders.orderDate), desc(orders.id))
    .limit(5);

  // Produtos no estoque mínimo ou abaixo dele, para quem pode ver produtos.
  const lowStock = can(ctx.permissions, 'products.read')
    ? await db
        .select({
          id: products.id,
          name: products.name,
          stock: products.stock,
          minStock: products.minStock,
          unit: products.unit,
        })
        .from(products)
        .where(
          and(
            eq(products.companyId, companyId),
            eq(products.active, true),
            isNotNull(products.minStock),
            lte(products.stock, products.minStock),
          ),
        )
        .orderBy(asc(products.name))
    : [];

  const extras = await dashboardExtras(ctx);

  return {
    ...extras,
    revenueMonth: Number(summary?.revenue_month ?? 0),
    expensesMonth: Number(summary?.expenses_month ?? 0),
    balance: Number(summary?.balance ?? 0),
    pendingOrders: summary?.pending_orders ?? 0,
    // Faturamento do ano comparado ao limite informado pela empresa (null enquanto não configurado).
    revenueYear: Number(summary?.revenue_year ?? 0),
    meiAnnualLimit: summary?.mei_annual_limit == null ? null : Number(summary.mei_annual_limit),
    recentOrders,
    lowStock,
  };
}

// Blocos do dashboard modular. Cada dado só vem para quem pode ver o módulo de origem; o bloco sem
// dado não aparece na tela.
async function dashboardExtras(ctx: Ctx) {
  const companyId = ctx.companyId;
  const allowed = (permission: Parameters<typeof can>[1]) => can(ctx.permissions, permission);
  const number = (value: unknown) => Number(value ?? 0);

  let receivables: { open: number; overdue: number } | null = null;
  if (allowed('receivables.read')) {
    const [row] = await db.execute<{ open: string; overdue: string }>(sql`
      SELECT COALESCE(SUM(amount - paid_amount), 0) AS open,
             COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS overdue
      FROM receivables WHERE company_id = ${companyId} AND status = 'open'`);
    receivables = { open: number(row?.open), overdue: number(row?.overdue) };
  }

  let quotesAwaiting: { count: number; total: number } | null = null;
  if (allowed('quotes.read')) {
    const own = ctx.ownOnly ? sql`AND created_by = ${ctx.userId}` : sql``;
    const [row] = await db.execute<{ count: number; total: string }>(sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total
      FROM quotes WHERE company_id = ${companyId} AND status = 'sent' ${own}`);
    quotesAwaiting = { count: row?.count ?? 0, total: number(row?.total) };
  }

  let salesByMonth: { month: string; total: number }[] | null = null;
  let topProducts: { name: string; quantity: number; total: number }[] | null = null;
  if (allowed('orders.read')) {
    // Os últimos 12 meses, com zero nos meses sem venda. Pedido cancelado não é venda.
    const rows = await db.execute<{ month: string; total: string }>(sql`
      SELECT to_char(m, 'YYYY-MM') AS month, COALESCE(SUM(o.total), 0) AS total
      FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '11 months',
                           date_trunc('month', CURRENT_DATE), interval '1 month') AS m
      LEFT JOIN orders o ON o.company_id = ${companyId} AND o.status <> 'cancelled'
        AND o.order_date >= m AND o.order_date < m + interval '1 month'
      GROUP BY m ORDER BY m`);
    salesByMonth = rows.map((row) => ({ month: row.month, total: number(row.total) }));

    // Mais vendidos em valor nos últimos 90 dias. Item avulso não tem produto e fica de fora.
    const top = await db.execute<{ name: string; quantity: string; total: string }>(sql`
      SELECT pr.name, SUM(i.quantity) AS quantity, SUM(i.subtotal) AS total
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      JOIN products pr ON pr.id = i.product_id
      WHERE o.company_id = ${companyId} AND o.status <> 'cancelled'
        AND o.order_date >= CURRENT_DATE - 90
      GROUP BY pr.id, pr.name
      ORDER BY SUM(i.subtotal) DESC
      LIMIT 5`);
    topProducts = top.map((row) => ({
      name: row.name,
      quantity: number(row.quantity),
      total: number(row.total),
    }));
  }

  let crm: { open: number; openValue: number; wonMonth: number; wonMonthValue: number } | null = null;
  if (allowed('opportunities.read')) {
    const own = ctx.ownOnly ? sql`AND owner_id = ${ctx.userId}` : sql``;
    const [row] = await db.execute<{ open: number; open_value: string; won: number; won_value: string }>(sql`
      SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open,
             COALESCE(SUM(estimated_value) FILTER (WHERE status = 'open'), 0) AS open_value,
             COUNT(*) FILTER (WHERE status = 'won' AND closed_at >= date_trunc('month', now()))::int AS won,
             COALESCE(SUM(estimated_value) FILTER (WHERE status = 'won' AND closed_at >= date_trunc('month', now())), 0) AS won_value
      FROM opportunities WHERE company_id = ${companyId} ${own}`);
    crm = {
      open: row?.open ?? 0,
      openValue: number(row?.open_value),
      wonMonth: row?.won ?? 0,
      wonMonthValue: number(row?.won_value),
    };
  }

  return { receivables, quotesAwaiting, salesByMonth, topProducts, crm };
}
