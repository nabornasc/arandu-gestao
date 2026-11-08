import { type AdvanceInput, advanceSchema, passwordConfirmationSchema } from '@arandue/shared/schemas';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { bankAccounts, cashTransactions, customerAdvances, people, users } from '../db/schema.ts';
import { diffFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { conflict, notFound } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';
import { confirmPassword } from './auth.ts';
import { advanceBalance } from './orders.ts';
import { assertActiveAccount } from './ownership.ts';

async function customerOf(ctx: Ctx, customerId: number) {
  const [row] = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(and(eq(people.id, customerId), eq(people.companyId, ctx.companyId), eq(people.isCustomer, true)));
  if (!row) throw notFound('Cliente não encontrado.');
  return row;
}

// Saldo e movimentos de adiantamento do cliente, do mais recente para o mais antigo.
export async function listAdvances(ctx: Ctx, customerId: number) {
  authorize(ctx, 'receivables.read');
  await customerOf(ctx, customerId);
  const rows = await db
    .select({
      id: customerAdvances.id,
      kind: customerAdvances.kind,
      amount: customerAdvances.amount,
      date: customerAdvances.date,
      notes: customerAdvances.notes,
      bankAccount: bankAccounts.accountName,
      userName: users.name,
      reversedAt: customerAdvances.reversedAt,
      reversalReason: customerAdvances.reversalReason,
    })
    .from(customerAdvances)
    .leftJoin(bankAccounts, eq(bankAccounts.id, customerAdvances.bankAccountId))
    .leftJoin(users, eq(users.id, customerAdvances.createdBy))
    .where(and(eq(customerAdvances.companyId, ctx.companyId), eq(customerAdvances.customerId, customerId)))
    .orderBy(desc(customerAdvances.date), desc(customerAdvances.id));
  return { balance: await advanceBalance(db, ctx.companyId, customerId), rows };
}

// Registrar adiantamento: o valor entra no caixa e vira crédito do cliente.
export async function createAdvance(ctx: Ctx, customerId: number, input: AdvanceInput) {
  authorize(ctx, 'receivables.settle');
  const data = parse(advanceSchema, input);
  const customer = await customerOf(ctx, customerId);
  await db.transaction(async (tx) => {
    await assertActiveAccount(tx, ctx, data.bankAccountId);
    const [row] = await tx
      .insert(customerAdvances)
      .values({
        companyId: ctx.companyId,
        customerId,
        kind: 'advance',
        amount: data.amount,
        date: data.date,
        bankAccountId: data.bankAccountId,
        notes: data.notes,
        createdBy: ctx.userId,
      })
      .returning({ id: customerAdvances.id });
    if (!row) throw new Error('Falha ao registrar o adiantamento.');
    await tx.insert(cashTransactions).values({
      companyId: ctx.companyId,
      type: 'income',
      category: 'Adiantamentos',
      description: `Adiantamento de ${customer.name}`,
      amount: data.amount,
      transactionDate: data.date,
      bankAccountId: data.bankAccountId,
      advanceId: row.id,
    });
    await audit(tx, ctx, 'update', 'person', customerId, {
      label: customer.name,
      changes: diffFields({ advance: null }, { advance: `${data.amount.toFixed(2)} em ${data.date}` }),
    });
  });
  return listAdvances(ctx, customerId);
}

// Estornar o adiantamento: só o que ainda não foi usado; a entrada sai do caixa.
export async function reverseAdvance(ctx: Ctx, id: number, input: unknown) {
  authorize(ctx, 'receivables.reverse');
  const { password, reason } = parse(passwordConfirmationSchema, input);
  await confirmPassword(ctx, password);
  const customerId = await db.transaction(async (tx) => {
    const [advance] = await tx
      .select()
      .from(customerAdvances)
      .where(and(eq(customerAdvances.id, id), eq(customerAdvances.companyId, ctx.companyId)))
      .for('update');
    if (advance?.kind !== 'advance') throw notFound('Adiantamento não encontrado.');
    if (advance.reversedAt) throw conflict('Este adiantamento já foi estornado.');
    const balance = await advanceBalance(tx, ctx.companyId, advance.customerId);
    if (balance < advance.amount) {
      throw conflict(
        `Parte deste adiantamento já foi usada. Saldo disponível: ${balance.toFixed(2)}. Estorne as baixas antes.`,
      );
    }
    await tx.delete(cashTransactions).where(eq(cashTransactions.advanceId, id));
    await tx
      .update(customerAdvances)
      .set({ reversedAt: new Date(), reversedBy: ctx.userId, reversalReason: reason })
      .where(eq(customerAdvances.id, id));
    await audit(
      tx,
      ctx,
      'update',
      'person',
      advance.customerId,
      {
        changes: diffFields(
          { reversal: null },
          { reversal: `Adiantamento de ${advance.amount.toFixed(2)} em ${advance.date}` },
        ),
      },
      reason,
    );
    return advance.customerId;
  });
  return listAdvances(ctx, customerId);
}
