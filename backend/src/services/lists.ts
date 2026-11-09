import {
  LIST_KINDS,
  type ListItemInput,
  type ListItemUpdateInput,
  type ListKind,
  listItemSchema,
  listItemUpdateSchema,
} from '@arandue/shared/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type Transaction } from '../db/client.ts';
import { companyListItems } from '../db/schema.ts';
import { diffFields, initialFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { conflict, notFound } from '../lib/errors.ts';
import { isUniqueViolation } from '../lib/pgError.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';

// Valores com que cada empresa começa: os que antes ficavam fixos no código.
export const DEFAULT_LISTS: Record<ListKind, string[]> = {
  payment_method: ['PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Transferência'],
  payment_terms: ['À vista', '30 dias', '30/60 dias', 'Entrada + 30 dias', 'Entrada 50% + contra-entrega'],
  opportunity_source: ['Indicação', 'Instagram', 'WhatsApp', 'Site', 'Feira', 'Loja física', 'Outro'],
  lost_reason: ['Preço', 'Prazo de entrega', 'Escolheu concorrente', 'Sem retorno', 'Desistiu da compra'],
  customer_category: ['Varejo', 'Atacado'],
  contact_role: ['Proprietário', 'Comprador', 'Financeiro'],
  financial_category: ['Mercadorias', 'Aluguel', 'Operacional', 'Impostos', 'Vendas'],
  product_group: [],
};

export async function createDefaultLists(tx: Transaction, companyId: number): Promise<void> {
  const rows = LIST_KINDS.flatMap((kind) => DEFAULT_LISTS[kind].map((name) => ({ companyId, kind, name })));
  if (rows.length) await tx.insert(companyListItems).values(rows);
}

const scoped = (ctx: Ctx, id: number) =>
  and(eq(companyListItems.id, id), eq(companyListItems.companyId, ctx.companyId));

// Valores das listas da empresa, por tipo. Os formulários usam só os ativos; a tela de listas vê todos.
export async function listLists(ctx: Ctx, { all = false }: { all?: boolean } = {}) {
  if (all) authorize(ctx, 'settings.read');
  const rows = await db
    .select({
      id: companyListItems.id,
      kind: companyListItems.kind,
      name: companyListItems.name,
      active: companyListItems.active,
    })
    .from(companyListItems)
    .where(
      and(eq(companyListItems.companyId, ctx.companyId), all ? undefined : eq(companyListItems.active, true)),
    )
    .orderBy(asc(sql`lower(${companyListItems.name})`));
  const grouped = Object.fromEntries(LIST_KINDS.map((kind) => [kind, [] as typeof rows])) as Record<
    ListKind,
    typeof rows
  >;
  for (const row of rows) grouped[row.kind].push(row);
  return grouped;
}

const DUPLICATE_MESSAGE = 'Já existe um valor com esse nome nesta lista.';

export async function createListItem(ctx: Ctx, input: ListItemInput) {
  authorize(ctx, 'settings.update');
  const data = parse(listItemSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(companyListItems)
        .values({ ...data, companyId: ctx.companyId })
        .returning();
      if (!row) throw new Error('Falha ao criar o valor da lista.');
      await audit(tx, ctx, 'create', 'list_item', row.id, {
        label: row.name,
        changes: initialFields({ name: row.name }),
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_MESSAGE);
    throw error;
  }
}

// Renomear ou desativar não mexe nos registros que já usam o valor: eles guardam o texto.
export async function updateListItem(ctx: Ctx, id: number, input: ListItemUpdateInput) {
  authorize(ctx, 'settings.update');
  const data = parse(listItemUpdateSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [previous] = await tx.select().from(companyListItems).where(scoped(ctx, id)).for('update');
      if (!previous) throw notFound('Valor da lista não encontrado.');
      const [row] = await tx.update(companyListItems).set(data).where(scoped(ctx, id)).returning();
      if (!row) throw notFound('Valor da lista não encontrado.');
      const changes = diffFields(
        { name: previous.name, active: previous.active },
        { name: row.name, active: row.active },
      );
      if (changes.length) await audit(tx, ctx, 'update', 'list_item', id, { label: row.name, changes });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_MESSAGE);
    throw error;
  }
}
