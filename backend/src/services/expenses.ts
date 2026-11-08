import {
  EXPENSE_STATUSES,
  type ExpenseInput,
  type ExpensesPayInput,
  expenseSchema,
  expensesPaySchema,
  passwordConfirmationSchema,
} from '@arandue/shared/schemas';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Transaction } from '../db/client.ts';
import { bankAccounts, cashTransactions, expensePayments, expenses, people, users } from '../db/schema.ts';
import { diffFields, initialFields, pick, removedFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import {
  money,
  pageWindow,
  parseListQuery,
  periodFilter,
  textFilter,
  toPage,
  wantsPage,
} from '../lib/listing.ts';
import { round2 } from '../lib/money.ts';
import { parse } from '../lib/validate.ts';
import { accountName, audit, personName } from './audit.ts';
import { confirmPassword } from './auth.ts';
import { todayInBrazil } from './orders.ts';
import { assertActiveAccount, assertSupplier } from './ownership.ts';

const scoped = (ctx: Ctx, id: number) => and(eq(expenses.id, id), eq(expenses.companyId, ctx.companyId));

const TRACKED = ['description', 'category', 'amount', 'expenseDate', 'status'] as const;
const tracked = async (tx: Transaction, row: typeof expenses.$inferSelect) => ({
  ...pick(row, TRACKED),
  bankAccount: await accountName(tx, row.bankAccountId),
  supplier: await personName(tx, row.supplierId),
});

type Expense = typeof expenses.$inferSelect;

// ---------- Baixas ----------

interface PaymentValues {
  principal: number;
  interest: number;
  discount: number;
  paid: number;
  paidOn: string;
  accountId: number | null;
  method?: string | null;
  notes?: string | null;
}

const statusOf = (amount: number, paidAmount: number): 'paid' | 'pending' =>
  paidAmount >= amount ? 'paid' : 'pending';

// Registra a baixa, atualiza o valor pago e, com conta, gera a saída no caixa.
async function recordPayment(tx: Transaction, ctx: Ctx, expense: Expense, values: PaymentValues) {
  const paidAmount = round2(expense.paidAmount + values.principal);
  await tx
    .update(expenses)
    .set({ paidAmount, status: statusOf(expense.amount, paidAmount) })
    .where(eq(expenses.id, expense.id));
  const [payment] = await tx
    .insert(expensePayments)
    .values({
      companyId: ctx.companyId,
      expenseId: expense.id,
      bankAccountId: values.accountId,
      paidOn: values.paidOn,
      principal: values.principal,
      interest: values.interest,
      discount: values.discount,
      paid: values.paid,
      method: values.method ?? null,
      notes: values.notes ?? null,
      createdBy: ctx.userId,
    })
    .returning({ id: expensePayments.id });
  if (payment && values.paid > 0 && values.accountId) {
    await tx.insert(cashTransactions).values({
      companyId: ctx.companyId,
      type: 'outcome',
      category: expense.category,
      description: expense.description,
      amount: values.paid,
      transactionDate: values.paidOn,
      bankAccountId: values.accountId,
      expenseId: expense.id,
      expensePaymentId: payment.id,
    });
  }
  return { ...expense, paidAmount, status: statusOf(expense.amount, paidAmount) };
}

const activePayments = (tx: Transaction, expenseId: number) =>
  tx
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.reversedAt)))
    .orderBy(asc(expensePayments.id));

// Estorna as baixas indicadas: some a saída do caixa e o valor volta a ficar em aberto.
async function reversePayments(
  tx: Transaction,
  ctx: Ctx,
  expense: Expense,
  payments: (typeof expensePayments.$inferSelect)[],
  reason: string,
) {
  if (!payments.length) return expense;
  const ids = payments.map((payment) => payment.id);
  await tx.delete(cashTransactions).where(inArray(cashTransactions.expensePaymentId, ids));
  await tx
    .update(expensePayments)
    .set({ reversedAt: new Date(), reversedBy: ctx.userId, reversalReason: reason })
    .where(inArray(expensePayments.id, ids));
  const paidAmount = round2(
    expense.paidAmount - payments.reduce((sum, payment) => sum + payment.principal, 0),
  );
  await tx
    .update(expenses)
    .set({ paidAmount, status: statusOf(expense.amount, paidAmount) })
    .where(eq(expenses.id, expense.id));
  return { ...expense, paidAmount, status: statusOf(expense.amount, paidAmount) };
}

// O cadastro continua funcionando como lançamento único: marcar "pago" quita o saldo na data da
// despesa; voltar para "pendente" estorna as baixas; com uma única baixa simples, editar valor, data
// ou conta acompanha a baixa e a saída do caixa, como antes.
async function applyFormStatus(tx: Transaction, ctx: Ctx, previous: Expense, row: Expense) {
  const payments = await activePayments(tx, row.id);
  if (row.status === 'pending') {
    if (previous.status === 'paid') {
      return reversePayments(tx, ctx, row, payments, 'Voltou para pendente pelo cadastro');
    }
    if (row.amount < row.paidAmount) {
      throw badRequest(`O valor não pode ficar abaixo do que já foi pago (${row.paidAmount.toFixed(2)}).`);
    }
    return { ...row, status: statusOf(row.amount, row.paidAmount) };
  }
  const [only] = payments;
  if (previous.status === 'paid' && payments.length === 1 && only && !only.interest && !only.discount) {
    await tx
      .update(expensePayments)
      .set({
        principal: row.amount,
        paid: row.amount,
        paidOn: row.expenseDate,
        bankAccountId: row.bankAccountId,
      })
      .where(eq(expensePayments.id, only.id));
    await tx.delete(cashTransactions).where(eq(cashTransactions.expensePaymentId, only.id));
    if (row.bankAccountId) {
      await tx.insert(cashTransactions).values({
        companyId: ctx.companyId,
        type: 'outcome',
        category: row.category,
        description: row.description,
        amount: row.amount,
        transactionDate: row.expenseDate,
        bankAccountId: row.bankAccountId,
        expenseId: row.id,
        expensePaymentId: only.id,
      });
    }
    await tx.update(expenses).set({ paidAmount: row.amount, status: 'paid' }).where(eq(expenses.id, row.id));
    return { ...row, paidAmount: row.amount, status: 'paid' as const };
  }
  const balance = round2(row.amount - row.paidAmount);
  if (balance < 0) {
    throw badRequest('Esta despesa tem mais de uma baixa: estorne as baixas para diminuir o valor.');
  }
  if (balance === 0) return { ...row, status: 'paid' as const };
  return recordPayment(tx, ctx, row, {
    principal: balance,
    interest: 0,
    discount: 0,
    paid: balance,
    paidOn: row.expenseDate,
    accountId: row.bankAccountId,
  });
}

const selectExpenses = () =>
  db
    .select({ ...getTableColumns(expenses), supplierName: people.name })
    .from(expenses)
    .leftJoin(people, eq(people.id, expenses.supplierId))
    .$dynamic();

export async function listExpenses(ctx: Ctx, query?: unknown) {
  authorize(ctx, 'payables.read');
  const base = eq(expenses.companyId, ctx.companyId);
  const order = [desc(expenses.expenseDate), desc(expenses.id)];
  if (!wantsPage(query))
    return selectExpenses()
      .where(base)
      .orderBy(...order)
      .limit(500);

  const filters = parseListQuery(query, EXPENSE_STATUSES);
  const where = and(
    base,
    periodFilter(expenses.expenseDate, filters),
    filters.status ? eq(expenses.status, filters.status as (typeof EXPENSE_STATUSES)[number]) : undefined,
    textFilter([expenses.description, expenses.category, people.name], filters.q),
  );
  const [summary] = await db
    .select({
      count: sql<number>`count(*)::int`,
      amount: money(sql`sum(${expenses.amount})`),
      paid: money(sql`sum(${expenses.paidAmount})`),
      pending: money(
        sql`sum(${expenses.amount} - ${expenses.paidAmount}) filter (where ${expenses.status} = 'pending')`,
      ),
    })
    .from(expenses)
    .leftJoin(people, eq(people.id, expenses.supplierId))
    .where(where);
  const { limit, offset } = pageWindow(filters);
  const rows = await selectExpenses()
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  return toPage(filters, summary?.count ?? 0, rows, {
    amount: summary?.amount ?? 0,
    paid: summary?.paid ?? 0,
    pending: summary?.pending ?? 0,
  });
}

export async function getExpense(ctx: Ctx, id: number) {
  authorize(ctx, 'payables.read');
  const [row] = await db.select().from(expenses).where(scoped(ctx, id));
  if (!row) throw notFound();
  return row;
}

export async function createExpense(ctx: Ctx, input: ExpenseInput) {
  authorize(ctx, 'payables.create');
  const data = parse(expenseSchema, input);
  if (data.status === 'paid') authorize(ctx, 'payables.pay');
  return db.transaction(async (tx) => {
    if (data.bankAccountId) await assertActiveAccount(tx, ctx, data.bankAccountId);
    if (data.supplierId) await assertSupplier(tx, ctx, data.supplierId);
    // Nasce pendente; marcada como paga, a baixa do valor total é registrada em seguida.
    const [created] = await tx
      .insert(expenses)
      .values({ ...data, status: 'pending', companyId: ctx.companyId })
      .returning();
    if (!created) throw new Error('Falha ao criar despesa.');
    const row =
      data.status === 'paid'
        ? await recordPayment(tx, ctx, created, {
            principal: created.amount,
            interest: 0,
            discount: 0,
            paid: created.amount,
            paidOn: created.expenseDate,
            accountId: created.bankAccountId,
          })
        : created;
    await audit(tx, ctx, 'create', 'expense', row.id, {
      label: row.description,
      changes: initialFields(await tracked(tx, row)),
    });
    return row;
  });
}

export async function updateExpense(ctx: Ctx, id: number, input: ExpenseInput) {
  authorize(ctx, 'payables.update');
  const data = parse(expenseSchema, input);
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(expenses).where(scoped(ctx, id)).for('update');
    if (!previous) throw notFound();
    // Pagar (ou desfazer o pagamento) mexe no caixa e tem permissão própria.
    if (previous.status !== data.status) authorize(ctx, 'payables.pay');
    if (data.bankAccountId) await assertActiveAccount(tx, ctx, data.bankAccountId);
    if (data.supplierId) await assertSupplier(tx, ctx, data.supplierId);
    const [updated] = await tx.update(expenses).set(data).where(scoped(ctx, id)).returning();
    if (!updated) throw notFound();
    const row = await applyFormStatus(tx, ctx, previous, updated);
    const changes = diffFields(await tracked(tx, previous), await tracked(tx, row));
    if (changes.length) await audit(tx, ctx, 'update', 'expense', id, { label: row.description, changes });
    return row;
  });
}

// Baixas e saídas de caixa vinculadas são removidas em cascata.
export async function deleteExpense(ctx: Ctx, id: number) {
  authorize(ctx, 'payables.delete');
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(expenses).where(scoped(ctx, id)).returning();
    if (!row) throw notFound();
    await audit(tx, ctx, 'delete', 'expense', id, {
      label: row.description,
      changes: removedFields(await tracked(tx, row)),
    });
  });
}

// ---------- Baixa em lote, histórico e estorno ----------

// Baixa em uma ou mais despesas, com valor parcial, juros e desconto. Trava as despesas em ordem de id.
export async function payExpenses(ctx: Ctx, input: ExpensesPayInput) {
  authorize(ctx, 'payables.pay');
  const data = parse(expensesPaySchema, input);
  const paidOn = data.paidOn ?? todayInBrazil();
  const ids = data.items.map((item) => item.expenseId);
  await db.transaction(async (tx) => {
    if (data.bankAccountId) await assertActiveAccount(tx, ctx, data.bankAccountId);
    const rows = await tx
      .select()
      .from(expenses)
      .where(and(inArray(expenses.id, ids), eq(expenses.companyId, ctx.companyId)))
      .orderBy(asc(expenses.id))
      .for('update');
    if (rows.length !== ids.length) throw notFound('Conta a pagar não encontrada.');
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const item of data.items) {
      const expense = byId.get(item.expenseId);
      if (!expense) throw notFound('Conta a pagar não encontrada.');
      const balance = round2(expense.amount - expense.paidAmount);
      if (balance <= 0) throw conflict(`"${expense.description}" já está paga.`);
      const paid = item.paid ?? round2(balance + item.interest - item.discount);
      const principal = round2(paid - item.interest + item.discount);
      if (paid < 0) throw badRequest(`"${expense.description}": o desconto é maior que o saldo.`);
      if (principal <= 0) throw badRequest(`"${expense.description}": o valor informado não abate o saldo.`);
      if (principal > balance) {
        throw badRequest(
          `"${expense.description}": o valor abatido (${principal.toFixed(2)}) passa do saldo (${balance.toFixed(2)}).`,
        );
      }
      const accountId = data.bankAccountId ?? expense.bankAccountId;
      const after = await recordPayment(tx, ctx, expense, {
        principal,
        interest: item.interest,
        discount: item.discount,
        paid,
        paidOn,
        accountId,
        method: data.method,
        notes: data.notes,
      });
      const extras = [
        item.interest ? `juros ${item.interest.toFixed(2)}` : '',
        item.discount ? `desconto ${item.discount.toFixed(2)}` : '',
        after.status === 'pending' ? `saldo ${round2(expense.amount - after.paidAmount).toFixed(2)}` : '',
      ].filter(Boolean);
      await audit(tx, ctx, after.status === 'paid' ? 'status' : 'update', 'expense', expense.id, {
        label: expense.description,
        changes: diffFields(
          { status: expense.status, payment: null, bankAccount: null },
          {
            status: after.status,
            payment: `${paid.toFixed(2)} em ${paidOn}${extras.length ? ` (${extras.join(', ')})` : ''}`,
            bankAccount: await accountName(tx, accountId),
          },
        ),
      });
    }
  });
  return Promise.all(ids.map((id) => getExpense(ctx, id)));
}

// Baixas da despesa, inclusive as estornadas, da mais recente para a mais antiga.
export async function listExpensePayments(ctx: Ctx, id: number) {
  authorize(ctx, 'payables.read');
  await getExpense(ctx, id);
  return db
    .select({
      id: expensePayments.id,
      paidOn: expensePayments.paidOn,
      principal: expensePayments.principal,
      interest: expensePayments.interest,
      discount: expensePayments.discount,
      paid: expensePayments.paid,
      method: expensePayments.method,
      notes: expensePayments.notes,
      bankAccount: sql<string | null>`${bankAccounts.bankName} || ' — ' || ${bankAccounts.accountName}`,
      userName: users.name,
      reversedAt: expensePayments.reversedAt,
      reversalReason: expensePayments.reversalReason,
    })
    .from(expensePayments)
    .leftJoin(bankAccounts, eq(bankAccounts.id, expensePayments.bankAccountId))
    .leftJoin(users, eq(users.id, expensePayments.createdBy))
    .where(and(eq(expensePayments.expenseId, id), eq(expensePayments.companyId, ctx.companyId)))
    .orderBy(desc(expensePayments.paidOn), desc(expensePayments.id));
}

// Estorno de uma baixa: permissão própria, senha de login e motivo no histórico.
export async function reverseExpensePayment(ctx: Ctx, id: number, input: unknown) {
  authorize(ctx, 'payables.reverse');
  const { password, reason } = parse(passwordConfirmationSchema, input);
  await confirmPassword(ctx, password);
  const expenseId = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ expenseId: expensePayments.expenseId })
      .from(expensePayments)
      .where(and(eq(expensePayments.id, id), eq(expensePayments.companyId, ctx.companyId)));
    if (!found) throw notFound('Baixa não encontrada.');
    const [expense] = await tx.select().from(expenses).where(eq(expenses.id, found.expenseId)).for('update');
    const [payment] = await tx.select().from(expensePayments).where(eq(expensePayments.id, id)).for('update');
    if (!expense || !payment) throw notFound('Baixa não encontrada.');
    if (payment.reversedAt) throw conflict('Esta baixa já foi estornada.');
    const after = await reversePayments(tx, ctx, expense, [payment], reason);
    await audit(
      tx,
      ctx,
      after.status !== expense.status ? 'status' : 'update',
      'expense',
      expense.id,
      {
        label: expense.description,
        changes: diffFields(
          { status: expense.status, reversal: null },
          { status: after.status, reversal: `${payment.paid.toFixed(2)} de ${payment.paidOn}` },
        ),
      },
      reason,
    );
    return expense.id;
  });
  return getExpense(ctx, expenseId);
}
