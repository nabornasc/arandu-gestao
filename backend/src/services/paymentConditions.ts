import { type PaymentConditionInput, paymentConditionSchema } from '@arandue/shared/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type Transaction } from '../db/client.ts';
import { paymentConditions } from '../db/schema.ts';
import { diffFields, initialFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { conflict, notFound } from '../lib/errors.ts';
import { isUniqueViolation } from '../lib/pgError.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';

// Condições com que cada empresa começa. A migração 0021 cria as mesmas para as empresas antigas.
export const DEFAULT_CONDITIONS: PaymentConditionInput[] = [
  { name: 'À vista', downPaymentPercent: 100, downPaymentMethod: 'PIX' },
  { name: '30 dias', days: [30], method: 'Boleto' },
  { name: '30/60 dias', days: [30, 60], method: 'Boleto' },
  { name: '30/60/90 dias', days: [30, 60, 90], method: 'Boleto' },
  {
    name: 'Entrada 50% + 30 dias',
    downPaymentPercent: 50,
    downPaymentMethod: 'PIX',
    days: [30],
    method: 'Boleto',
  },
];

export async function createDefaultConditions(tx: Transaction, companyId: number): Promise<void> {
  await tx
    .insert(paymentConditions)
    .values(DEFAULT_CONDITIONS.map((input) => ({ ...paymentConditionSchema.parse(input), companyId })));
}

const scoped = (ctx: Ctx, id: number) =>
  and(eq(paymentConditions.id, id), eq(paymentConditions.companyId, ctx.companyId));

const COLUMNS = {
  id: paymentConditions.id,
  name: paymentConditions.name,
  downPaymentPercent: paymentConditions.downPaymentPercent,
  downPaymentMethod: paymentConditions.downPaymentMethod,
  days: paymentConditions.days,
  method: paymentConditions.method,
  active: paymentConditions.active,
};

// Os documentos usam só as ativas; a tela de configurações vê todas.
export async function listPaymentConditions(ctx: Ctx, { all = false }: { all?: boolean } = {}) {
  if (all) authorize(ctx, 'settings.read');
  return db
    .select(COLUMNS)
    .from(paymentConditions)
    .where(
      and(
        eq(paymentConditions.companyId, ctx.companyId),
        all ? undefined : eq(paymentConditions.active, true),
      ),
    )
    .orderBy(asc(sql`lower(${paymentConditions.name})`));
}

const DUPLICATE_MESSAGE = 'Já existe uma condição de pagamento com esse nome.';

// Texto curto para o histórico: "Entrada 50% (PIX); 30, 60 dias (Boleto)".
const describe = (row: {
  downPaymentPercent: number;
  downPaymentMethod: string | null;
  days: number[];
  method: string | null;
}) =>
  [
    row.downPaymentPercent > 0
      ? `Entrada ${row.downPaymentPercent}%${row.downPaymentMethod ? ` (${row.downPaymentMethod})` : ''}`
      : null,
    row.days.length ? `${row.days.join(', ')} dias${row.method ? ` (${row.method})` : ''}` : null,
  ]
    .filter(Boolean)
    .join('; ');

export async function createPaymentCondition(ctx: Ctx, input: PaymentConditionInput) {
  authorize(ctx, 'settings.update');
  const data = parse(paymentConditionSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(paymentConditions)
        .values({ ...data, companyId: ctx.companyId })
        .returning(COLUMNS);
      if (!row) throw new Error('Falha ao criar a condição de pagamento.');
      await audit(tx, ctx, 'create', 'payment_condition', row.id, {
        label: row.name,
        changes: initialFields({ name: row.name, terms: describe(row) }),
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_MESSAGE);
    throw error;
  }
}

// Mudar a condição não mexe nas parcelas de documentos que já a usaram: elas foram copiadas.
export async function updatePaymentCondition(ctx: Ctx, id: number, input: PaymentConditionInput) {
  authorize(ctx, 'settings.update');
  const data = parse(paymentConditionSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [previous] = await tx.select().from(paymentConditions).where(scoped(ctx, id)).for('update');
      if (!previous) throw notFound('Condição de pagamento não encontrada.');
      const [row] = await tx.update(paymentConditions).set(data).where(scoped(ctx, id)).returning(COLUMNS);
      if (!row) throw notFound('Condição de pagamento não encontrada.');
      const changes = diffFields(
        { name: previous.name, terms: describe(previous), active: previous.active },
        { name: row.name, terms: describe(row), active: row.active },
      );
      if (changes.length)
        await audit(tx, ctx, 'update', 'payment_condition', id, { label: row.name, changes });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_MESSAGE);
    throw error;
  }
}
