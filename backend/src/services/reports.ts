import { can, type Permission } from '@arandue/shared/permissions';
import { type ReportQuery, reportQuerySchema } from '@arandue/shared/schemas';
import { type SQL, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { notFound } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';

export type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';

interface Column {
  key: string;
  label: string;
  type: ColumnType;
}

interface Range {
  from?: string;
  to?: string;
}

interface ReportDefinition {
  id: string;
  group: 'Vendas' | 'Financeiro' | 'Estoque' | 'Gestão';
  title: string;
  description: string;
  // Todas são exigidas: a leitura do módulo e, quando há custo, costs.read.
  permissions: Permission[];
  // Coluna em que o período se aplica; sem ela, o relatório é uma posição atual.
  dateLabel: string | null;
  columns: Column[];
  query: (ctx: Ctx, range: Range) => SQL;
}

// Mais do que isso não cabe numa tela nem num CSV útil: o relatório avisa e pede um período menor.
export const ROW_LIMIT = 5000;

// Textos dos códigos guardados no banco, iguais aos da interface.
const LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  pending: 'Pendente',
  paid: 'Pago',
  completed: 'Concluído',
  open: 'Em aberto',
  settled: 'Quitado',
  income: 'Entrada',
  outcome: 'Saída',
  product: 'Produto',
  service: 'Serviço',
  initial: 'Saldo inicial',
  adjustment: 'Ajuste',
  count: 'Contagem',
  sale: 'Venda',
  return: 'Devolução',
  edit: 'Edição do cadastro',
};
const LABELED = new Set(['status', 'type', 'kind']);

// Data no fuso de Brasília, como o servidor usa no resto do sistema.
const localDate = (column: SQL) => sql`(${column} AT TIME ZONE 'America/Sao_Paulo')::date`;
const between = (column: SQL, range: Range) =>
  sql`${range.from ? sql`AND ${column} >= ${range.from}` : sql``} ${range.to ? sql`AND ${column} <= ${range.to}` : sql``}`;
// Grupos restritos aos próprios registros veem só o que criaram (orçamentos e pedidos).
const own = (ctx: Ctx, column: SQL) => (ctx.ownOnly ? sql`AND ${column} = ${ctx.userId}` : sql``);

const money = (key: string, label: string): Column => ({ key, label, type: 'money' });
const text = (key: string, label: string): Column => ({ key, label, type: 'text' });
const date = (key: string, label: string): Column => ({ key, label, type: 'date' });
const number = (key: string, label: string): Column => ({ key, label, type: 'number' });

const REPORTS: ReportDefinition[] = [
  {
    id: 'quotes',
    group: 'Vendas',
    title: 'Orçamentos',
    description: 'Orçamentos criados no período, com cliente, situação e total.',
    permissions: ['quotes.read'],
    dateLabel: 'Data de criação',
    columns: [
      number('number', 'Número'),
      date('date', 'Data'),
      text('customer', 'Cliente'),
      text('status', 'Situação'),
      date('validUntil', 'Validade'),
      money('total', 'Total'),
    ],
    query: (ctx, range) => sql`
      SELECT q.number, ${localDate(sql`q.created_at`)} AS date, p.name AS customer, q.status,
             q.valid_until AS "validUntil", q.total
      FROM quotes q LEFT JOIN people p ON p.id = q.customer_id
      WHERE q.company_id = ${ctx.companyId} ${own(ctx, sql`q.created_by`)}
        ${between(localDate(sql`q.created_at`), range)}
      ORDER BY q.created_at DESC, q.id DESC`,
  },
  {
    id: 'quote_items',
    group: 'Vendas',
    title: 'Itens dos orçamentos',
    description: 'Cada item orçado, com quantidade, preço e subtotal.',
    permissions: ['quotes.read'],
    dateLabel: 'Data do orçamento',
    columns: [
      number('number', 'Orçamento'),
      date('date', 'Data'),
      text('product', 'Produto ou serviço'),
      text('group', 'Grupo de itens'),
      number('quantity', 'Quantidade'),
      money('unitPrice', 'Preço'),
      money('subtotal', 'Subtotal'),
    ],
    query: (ctx, range) => sql`
      SELECT q.number, ${localDate(sql`q.created_at`)} AS date, coalesce(pr.name, i.description) AS product,
             i.group_name AS "group", i.quantity, i.unit_price AS "unitPrice", i.subtotal
      FROM quote_items i JOIN quotes q ON q.id = i.quote_id LEFT JOIN products pr ON pr.id = i.product_id
      WHERE q.company_id = ${ctx.companyId} ${own(ctx, sql`q.created_by`)}
        ${between(localDate(sql`q.created_at`), range)}
      ORDER BY q.created_at DESC, i.id`,
  },
  {
    id: 'quote_adjustments',
    group: 'Vendas',
    title: 'Ajustes de orçamentos',
    description: 'Orçamentos com desconto, frete ou outras despesas.',
    permissions: ['quotes.read'],
    dateLabel: 'Data de criação',
    columns: [
      number('number', 'Número'),
      date('date', 'Data'),
      text('customer', 'Cliente'),
      money('discount', 'Desconto'),
      money('freight', 'Frete'),
      money('otherCharges', 'Outras despesas'),
      money('total', 'Total'),
    ],
    query: (ctx, range) => sql`
      SELECT q.number, ${localDate(sql`q.created_at`)} AS date, p.name AS customer, q.discount, q.freight,
             q.other_charges AS "otherCharges", q.total
      FROM quotes q LEFT JOIN people p ON p.id = q.customer_id
      WHERE q.company_id = ${ctx.companyId} ${own(ctx, sql`q.created_by`)}
        AND (q.discount <> 0 OR q.freight <> 0 OR q.other_charges <> 0)
        ${between(localDate(sql`q.created_at`), range)}
      ORDER BY q.created_at DESC, q.id DESC`,
  },
  {
    id: 'quote_composition',
    group: 'Vendas',
    title: 'Composições dos orçamentos',
    description: 'Subtotal de cada grupo de itens (ambiente, etapa, kit) por orçamento.',
    permissions: ['quotes.read'],
    dateLabel: 'Data do orçamento',
    columns: [
      number('number', 'Orçamento'),
      date('date', 'Data'),
      text('group', 'Grupo de itens'),
      number('items', 'Itens'),
      money('subtotal', 'Subtotal'),
    ],
    query: (ctx, range) => sql`
      SELECT q.number, ${localDate(sql`q.created_at`)} AS date, coalesce(i.group_name, 'Sem grupo') AS "group",
             count(*)::int AS items, sum(i.subtotal) AS subtotal
      FROM quote_items i JOIN quotes q ON q.id = i.quote_id
      WHERE q.company_id = ${ctx.companyId} ${own(ctx, sql`q.created_by`)}
        ${between(localDate(sql`q.created_at`), range)}
      GROUP BY q.id, q.number, q.created_at, i.group_name
      ORDER BY q.created_at DESC, "group"`,
  },
  {
    id: 'orders',
    group: 'Vendas',
    title: 'Pedidos emitidos',
    description: 'Pedidos do período, com cliente, situação e total.',
    permissions: ['orders.read'],
    dateLabel: 'Data do pedido',
    columns: [
      number('number', 'Número'),
      date('date', 'Data'),
      text('customer', 'Cliente'),
      text('status', 'Situação'),
      money('total', 'Total'),
    ],
    query: (ctx, range) => sql`
      SELECT o.number, o.order_date AS date, p.name AS customer, o.status, o.total
      FROM orders o LEFT JOIN people p ON p.id = o.customer_id
      WHERE o.company_id = ${ctx.companyId} ${own(ctx, sql`o.created_by`)} ${between(sql`o.order_date`, range)}
      ORDER BY o.order_date DESC, o.id DESC`,
  },
  {
    id: 'order_items',
    group: 'Vendas',
    title: 'Itens dos pedidos emitidos',
    description: 'Cada item vendido, com quantidade, preço e subtotal.',
    permissions: ['orders.read'],
    dateLabel: 'Data do pedido',
    columns: [
      number('number', 'Pedido'),
      date('date', 'Data'),
      text('product', 'Produto ou serviço'),
      number('quantity', 'Quantidade'),
      money('unitPrice', 'Preço'),
      money('subtotal', 'Subtotal'),
    ],
    query: (ctx, range) => sql`
      SELECT o.number, o.order_date AS date, coalesce(pr.name, i.description) AS product, i.quantity,
             i.unit_price AS "unitPrice", i.subtotal
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products pr ON pr.id = i.product_id
      WHERE o.company_id = ${ctx.companyId} ${own(ctx, sql`o.created_by`)} ${between(sql`o.order_date`, range)}
      ORDER BY o.order_date DESC, i.id`,
  },
  {
    id: 'services_sold',
    group: 'Vendas',
    title: 'Serviços vendidos',
    description: 'Quantidade e valor de cada serviço em pedidos não cancelados.',
    permissions: ['orders.read'],
    dateLabel: 'Data do pedido',
    columns: [
      text('service', 'Serviço'),
      number('orders', 'Pedidos'),
      number('quantity', 'Quantidade'),
      money('total', 'Total'),
    ],
    query: (ctx, range) => sql`
      SELECT pr.name AS service, count(DISTINCT o.id)::int AS orders, sum(i.quantity) AS quantity, sum(i.subtotal) AS total
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products pr ON pr.id = i.product_id
      WHERE o.company_id = ${ctx.companyId} AND pr.type = 'service' AND o.status <> 'cancelled'
        ${own(ctx, sql`o.created_by`)} ${between(sql`o.order_date`, range)}
      GROUP BY pr.id, pr.name
      ORDER BY total DESC`,
  },
  {
    id: 'payables',
    group: 'Financeiro',
    title: 'Contas a pagar',
    description: 'Despesas pendentes, com fornecedor e categoria.',
    permissions: ['payables.read'],
    dateLabel: 'Data da despesa',
    columns: [
      date('date', 'Data'),
      text('description', 'Descrição'),
      text('category', 'Categoria'),
      text('supplier', 'Fornecedor'),
      money('amount', 'Valor'),
    ],
    query: (ctx, range) => sql`
      SELECT e.expense_date AS date, e.description, e.category, p.name AS supplier, e.amount
      FROM expenses e LEFT JOIN people p ON p.id = e.supplier_id
      WHERE e.company_id = ${ctx.companyId} AND e.status = 'pending' ${between(sql`e.expense_date`, range)}
      ORDER BY e.expense_date, e.id`,
  },
  {
    id: 'payable_payments',
    group: 'Financeiro',
    title: 'Baixas de contas a pagar',
    description: 'Despesas pagas, pela saída gerada no caixa.',
    permissions: ['payables.read'],
    dateLabel: 'Data do pagamento',
    columns: [
      date('date', 'Data'),
      text('description', 'Descrição'),
      text('category', 'Categoria'),
      text('account', 'Conta'),
      money('amount', 'Valor'),
    ],
    query: (ctx, range) => sql`
      SELECT t.transaction_date AS date, t.description, t.category, a.account_name AS account, t.amount
      FROM cash_transactions t JOIN bank_accounts a ON a.id = t.bank_account_id
      WHERE t.company_id = ${ctx.companyId} AND t.expense_id IS NOT NULL ${between(sql`t.transaction_date`, range)}
      ORDER BY t.transaction_date DESC, t.id DESC`,
  },
  {
    id: 'receivables',
    group: 'Financeiro',
    title: 'Contas a receber',
    description: 'Parcelas em aberto, com valor pago e saldo.',
    permissions: ['receivables.read'],
    dateLabel: 'Vencimento',
    columns: [
      date('dueDate', 'Vencimento'),
      number('order', 'Pedido'),
      text('customer', 'Cliente'),
      money('amount', 'Valor'),
      money('paid', 'Pago'),
      money('balance', 'Saldo'),
    ],
    query: (ctx, range) => sql`
      SELECT r.due_date AS "dueDate", o.number AS "order", p.name AS customer, r.amount, r.paid_amount AS paid,
             r.amount - r.paid_amount AS balance
      FROM receivables r JOIN orders o ON o.id = r.order_id LEFT JOIN people p ON p.id = o.customer_id
      WHERE r.company_id = ${ctx.companyId} AND r.status = 'open' ${between(sql`r.due_date`, range)}
      ORDER BY r.due_date, r.id`,
  },
  {
    id: 'receivable_payments',
    group: 'Financeiro',
    title: 'Baixas de contas a receber',
    description: 'Recebimentos do período, com juros e desconto. Baixas estornadas ficam de fora.',
    permissions: ['receivables.read'],
    dateLabel: 'Data do recebimento',
    columns: [
      date('date', 'Data'),
      number('order', 'Pedido'),
      text('customer', 'Cliente'),
      text('method', 'Forma'),
      text('account', 'Conta'),
      money('principal', 'Principal'),
      money('interest', 'Juros'),
      money('discount', 'Desconto'),
      money('received', 'Recebido'),
    ],
    query: (ctx, range) => sql`
      SELECT b.paid_on AS date, o.number AS "order", p.name AS customer, b.method, a.account_name AS account,
             b.principal, b.interest, b.discount, b.received
      FROM receivable_payments b JOIN orders o ON o.id = b.order_id
      LEFT JOIN people p ON p.id = o.customer_id LEFT JOIN bank_accounts a ON a.id = b.bank_account_id
      WHERE b.company_id = ${ctx.companyId} AND b.reversed_at IS NULL ${between(sql`b.paid_on`, range)}
      ORDER BY b.paid_on DESC, b.id DESC`,
  },
  {
    id: 'cash_transactions',
    group: 'Financeiro',
    title: 'Movimentações',
    description: 'Entradas e saídas de todas as contas.',
    permissions: ['cash.read'],
    dateLabel: 'Data',
    columns: [
      date('date', 'Data'),
      text('type', 'Tipo'),
      text('category', 'Categoria'),
      text('description', 'Descrição'),
      text('account', 'Conta'),
      money('amount', 'Valor'),
    ],
    query: (ctx, range) => sql`
      SELECT t.transaction_date AS date, t.type, t.category, t.description, a.account_name AS account, t.amount
      FROM cash_transactions t JOIN bank_accounts a ON a.id = t.bank_account_id
      WHERE t.company_id = ${ctx.companyId} ${between(sql`t.transaction_date`, range)}
      ORDER BY t.transaction_date DESC, t.id DESC`,
  },
  {
    id: 'cash_regime',
    group: 'Financeiro',
    title: 'Regime de caixa',
    description: 'Entradas, saídas e resultado por mês.',
    permissions: ['cash.read'],
    dateLabel: 'Data',
    columns: [
      text('month', 'Mês'),
      money('income', 'Entradas'),
      money('outcome', 'Saídas'),
      money('result', 'Resultado'),
    ],
    query: (ctx, range) => sql`
      SELECT to_char(date_trunc('month', t.transaction_date), 'MM/YYYY') AS month,
             sum(t.amount) FILTER (WHERE t.type = 'income') AS income,
             sum(t.amount) FILTER (WHERE t.type = 'outcome') AS outcome,
             sum(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END) AS result
      FROM cash_transactions t
      WHERE t.company_id = ${ctx.companyId} ${between(sql`t.transaction_date`, range)}
      GROUP BY date_trunc('month', t.transaction_date)
      ORDER BY date_trunc('month', t.transaction_date) DESC`,
  },
  {
    id: 'expenses_by_category',
    group: 'Financeiro',
    title: 'Despesas por categoria',
    description: 'Despesas pagas no período, somadas por categoria.',
    permissions: ['payables.read'],
    dateLabel: 'Data da despesa',
    columns: [text('category', 'Categoria'), number('count', 'Lançamentos'), money('total', 'Total')],
    query: (ctx, range) => sql`
      SELECT e.category, count(*)::int AS count, sum(e.amount) AS total
      FROM expenses e
      WHERE e.company_id = ${ctx.companyId} AND e.status = 'paid' ${between(sql`e.expense_date`, range)}
      GROUP BY e.category
      ORDER BY total DESC`,
  },
  {
    id: 'stock_movements',
    group: 'Estoque',
    title: 'Movimentação de estoque',
    description: 'Vendas, devoluções e ajustes, com saldo e motivo.',
    permissions: ['products.read'],
    dateLabel: 'Data',
    columns: [
      date('date', 'Data'),
      text('product', 'Produto'),
      text('kind', 'Tipo'),
      number('quantity', 'Quantidade'),
      number('balance', 'Saldo'),
      text('reason', 'Motivo'),
      text('user', 'Usuário'),
    ],
    query: (ctx, range) => sql`
      SELECT ${localDate(sql`m.created_at`)} AS date, pr.name AS product, m.kind, m.quantity, m.balance, m.reason,
             u.name AS "user"
      FROM stock_movements m JOIN products pr ON pr.id = m.product_id LEFT JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ${ctx.companyId} ${between(localDate(sql`m.created_at`), range)}
      ORDER BY m.created_at DESC, m.id DESC`,
  },
  {
    id: 'stock_position',
    group: 'Estoque',
    title: 'Posição do estoque',
    description: 'Saldo atual de cada produto, com estoque mínimo.',
    permissions: ['products.read'],
    dateLabel: null,
    columns: [
      text('product', 'Produto'),
      text('group', 'Grupo'),
      text('unit', 'Unidade'),
      number('stock', 'Estoque'),
      number('minStock', 'Mínimo'),
      text('low', 'Abaixo do mínimo'),
    ],
    query: (ctx) => sql`
      SELECT pr.name AS product, pr.group_name AS "group", pr.unit, pr.stock, pr.min_stock AS "minStock",
             CASE WHEN pr.min_stock IS NOT NULL AND pr.stock <= pr.min_stock THEN 'Sim' ELSE 'Não' END AS low
      FROM products pr
      WHERE pr.company_id = ${ctx.companyId} AND pr.active AND pr.type = 'product' AND pr.stock IS NOT NULL
      ORDER BY pr.name`,
  },
  {
    id: 'price_formation',
    group: 'Gestão',
    title: 'Formação de preço',
    description: 'Preço, custo e margem de cada produto e serviço.',
    permissions: ['products.read', 'costs.read'],
    dateLabel: null,
    columns: [
      text('product', 'Produto ou serviço'),
      text('type', 'Tipo'),
      text('group', 'Grupo'),
      money('cost', 'Custo'),
      money('price', 'Preço'),
      money('profit', 'Lucro'),
      { key: 'margin', label: 'Margem', type: 'percent' },
    ],
    query: (ctx) => sql`
      SELECT pr.name AS product, pr.type, pr.group_name AS "group", pr.cost, pr.price,
             pr.price - pr.cost AS profit,
             CASE WHEN pr.cost IS NOT NULL AND pr.price > 0 THEN round((pr.price - pr.cost) / pr.price * 100, 2) END
               AS margin
      FROM products pr
      WHERE pr.company_id = ${ctx.companyId} AND pr.active
      ORDER BY pr.name`,
  },
];

const allowed = (ctx: Ctx, report: ReportDefinition) =>
  report.permissions.every((permission) => can(ctx.permissions, permission));

function findReport(ctx: Ctx, id: string) {
  authorize(ctx, 'reports.read');
  const report = REPORTS.find((item) => item.id === id);
  // Relatório de módulo que o grupo não vê é tratado como inexistente.
  if (!report || !allowed(ctx, report)) throw notFound('Relatório não encontrado.');
  return report;
}

// Relatórios que o grupo pode ver, sem consultar dados.
export function listReports(ctx: Ctx) {
  authorize(ctx, 'reports.read');
  return REPORTS.filter((report) => allowed(ctx, report)).map(
    ({ id, group, title, description, dateLabel }) => ({ id, group, title, description, dateLabel }),
  );
}

const NUMERIC: ReadonlySet<ColumnType> = new Set(['money', 'number', 'percent']);

async function runReport(ctx: Ctx, id: string, input: ReportQuery) {
  const report = findReport(ctx, id);
  const range = report.dateLabel ? parse(reportQuerySchema, input) : {};
  const result = await db.execute<Record<string, unknown>>(
    sql`${report.query(ctx, range)} LIMIT ${ROW_LIMIT + 1}`,
  );
  const rows = [...result].map((row) =>
    Object.fromEntries(
      report.columns.map(({ key, type }) => {
        const value = row[key];
        if (value === null || value === undefined) return [key, null];
        if (NUMERIC.has(type)) return [key, Number(value)];
        if (LABELED.has(key)) return [key, LABELS[String(value)] ?? String(value)];
        return [key, String(value)];
      }),
    ),
  );
  return { report, rows: rows.slice(0, ROW_LIMIT), truncated: rows.length > ROW_LIMIT, range };
}

export async function getReport(ctx: Ctx, id: string, input: ReportQuery) {
  const { report, rows, truncated } = await runReport(ctx, id, input);
  const { query: _query, permissions: _permissions, ...info } = report;
  return { ...info, rows, truncated, limit: ROW_LIMIT };
}

// Planilhas tratam texto que começa com estes sinais como fórmula: o apóstrofo mantém o texto como texto.
const FORMULA = /^[=+\-@\t\r]/;
const decimal = new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: 2 });

function csvCell(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return '';
  if (NUMERIC.has(type)) return decimal.format(Number(value));
  let textValue = String(value);
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
    const [year, month, day] = textValue.split('-');
    textValue = `${day}/${month}/${year}`;
  }
  if (FORMULA.test(textValue)) textValue = `'${textValue}`;
  return /[";\n\r]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

// CSV para o Excel em português: ponto e vírgula, vírgula decimal e BOM para os acentos.
export async function exportReport(ctx: Ctx, id: string, input: ReportQuery) {
  authorize(ctx, 'reports.export');
  const { report, rows, truncated, range } = await runReport(ctx, id, input);
  const lines = [
    report.columns.map((column) => csvCell(column.label, 'text')).join(';'),
    ...rows.map((row) => report.columns.map((column) => csvCell(row[column.key], column.type)).join(';')),
  ];
  await audit(db, ctx, 'export', 'report', null, {
    label: report.title,
    from: range.from ?? null,
    to: range.to ?? null,
    rows: rows.length,
    truncated,
  });
  return {
    filename: `${report.id}-${new Date().toISOString().slice(0, 10)}.csv`,
    content: `﻿${lines.join('\r\n')}\r\n`,
  };
}
