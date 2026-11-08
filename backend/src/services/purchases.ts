import { type PurchaseInput, purchaseSchema } from '@arandue/shared/schemas';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, type Transaction } from '../db/client.ts';
import { expenses, people, products, purchaseItems, purchases } from '../db/schema.ts';
import { diffFields, diffItems, initialFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { round2 } from '../lib/money.ts';
import { parse } from '../lib/validate.ts';
import { audit, namedLines, personName } from './audit.ts';
import { formatCode, nextNumber } from './numbering.ts';
import { assertSupplier } from './ownership.ts';
import { recordStock, type StockChange } from './stock.ts';

// Compras simples: rascunho editável; ao receber, entra no estoque, atualiza o custo médio do
// produto e gera a conta a pagar do fornecedor. Cancelar a compra recebida devolve o estoque e
// apaga a conta a pagar, se ela ainda não tem pagamento. O custo médio não volta atrás.

const scoped = (ctx: Ctx, id: number) => and(eq(purchases.id, id), eq(purchases.companyId, ctx.companyId));
type PurchaseData = ReturnType<typeof purchaseSchema.parse>;

const columns = {
  id: purchases.id,
  number: purchases.number,
  supplierId: purchases.supplierId,
  supplierName: people.name,
  purchaseDate: purchases.purchaseDate,
  dueDate: purchases.dueDate,
  status: purchases.status,
  freight: purchases.freight,
  total: purchases.total,
  notes: purchases.notes,
  expenseId: purchases.expenseId,
  receivedAt: purchases.receivedAt,
};

export async function listPurchases(ctx: Ctx) {
  authorize(ctx, 'purchases.read');
  return db
    .select({
      ...columns,
      items: sql<number>`(select count(*) from purchase_items i where i.purchase_id = ${purchases.id})::int`,
    })
    .from(purchases)
    .leftJoin(people, eq(people.id, purchases.supplierId))
    .where(eq(purchases.companyId, ctx.companyId))
    .orderBy(desc(purchases.purchaseDate), desc(purchases.id))
    .limit(500);
}

export async function getPurchase(ctx: Ctx, id: number) {
  authorize(ctx, 'purchases.read');
  const [row] = await db
    .select(columns)
    .from(purchases)
    .leftJoin(people, eq(people.id, purchases.supplierId))
    .where(scoped(ctx, id));
  if (!row) throw notFound('Compra não encontrada.');
  const items = await db
    .select({
      id: purchaseItems.id,
      productId: purchaseItems.productId,
      productName: products.name,
      unit: products.unit,
      quantity: purchaseItems.quantity,
      unitCost: purchaseItems.unitCost,
      subtotal: purchaseItems.subtotal,
    })
    .from(purchaseItems)
    .innerJoin(products, eq(products.id, purchaseItems.productId))
    .where(eq(purchaseItems.purchaseId, id))
    .orderBy(asc(purchaseItems.id));
  return { ...row, items };
}

// Itens da compra: produtos da empresa, ativos e com controle de estoque.
async function buildItems(tx: Transaction, ctx: Ctx, data: PurchaseData) {
  const ids = [...new Set(data.items.map((item) => item.productId))];
  const found = await tx
    .select({ id: products.id, type: products.type, stock: products.stock })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.companyId, ctx.companyId), eq(products.active, true)));
  if (found.length !== ids.length) throw badRequest('Produto não encontrado ou arquivado.');
  if (found.some((row) => row.type !== 'product' || row.stock === null)) {
    throw badRequest('Só produtos com controle de estoque entram na compra.');
  }
  const lines = data.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitCost: item.unitCost,
    subtotal: round2(item.quantity * item.unitCost),
  }));
  const total = round2(lines.reduce((sum, line) => sum + line.subtotal, 0) + data.freight);
  return { lines, total };
}

const named = (tx: Transaction, lines: { productId: number; quantity: number; unitCost: number }[]) =>
  namedLines(
    tx,
    lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitCost })),
  );

export async function createPurchase(ctx: Ctx, input: PurchaseInput) {
  authorize(ctx, 'purchases.create');
  const data = parse(purchaseSchema, input);
  const id = await db.transaction(async (tx) => {
    await assertSupplier(tx, ctx, data.supplierId);
    const { lines, total } = await buildItems(tx, ctx, data);
    const number = await nextNumber(tx, ctx, 'purchase');
    const [row] = await tx
      .insert(purchases)
      .values({
        companyId: ctx.companyId,
        number,
        supplierId: data.supplierId,
        purchaseDate: data.purchaseDate,
        dueDate: data.dueDate,
        freight: data.freight,
        total,
        notes: data.notes,
        createdBy: ctx.userId,
      })
      .returning({ id: purchases.id });
    if (!row) throw new Error('Falha ao criar a compra.');
    await tx.insert(purchaseItems).values(lines.map((line) => ({ ...line, purchaseId: row.id })));
    await audit(tx, ctx, 'create', 'purchase', row.id, {
      number,
      changes: initialFields({
        supplier: await personName(tx, data.supplierId),
        purchaseDate: data.purchaseDate,
        dueDate: data.dueDate,
        freight: data.freight,
        total,
        notes: data.notes,
      }),
      items: diffItems([], await named(tx, lines)),
    });
    return row.id;
  });
  return getPurchase(ctx, id);
}

export async function updatePurchase(ctx: Ctx, id: number, input: PurchaseInput) {
  authorize(ctx, 'purchases.update');
  const data = parse(purchaseSchema, input);
  await db.transaction(async (tx) => {
    const [previous] = await tx.select().from(purchases).where(scoped(ctx, id)).for('update');
    if (!previous) throw notFound('Compra não encontrada.');
    if (previous.status !== 'draft') throw conflict('Só compras em rascunho podem ser editadas.');
    await assertSupplier(tx, ctx, data.supplierId);
    const { lines, total } = await buildItems(tx, ctx, data);
    const before = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    await tx.insert(purchaseItems).values(lines.map((line) => ({ ...line, purchaseId: id })));
    await tx
      .update(purchases)
      .set({
        supplierId: data.supplierId,
        purchaseDate: data.purchaseDate,
        dueDate: data.dueDate,
        freight: data.freight,
        total,
        notes: data.notes,
      })
      .where(scoped(ctx, id));
    const changes = diffFields(
      {
        supplier: await personName(tx, previous.supplierId),
        purchaseDate: previous.purchaseDate,
        dueDate: previous.dueDate,
        freight: previous.freight,
        total: previous.total,
        notes: previous.notes,
      },
      {
        supplier: await personName(tx, data.supplierId),
        purchaseDate: data.purchaseDate,
        dueDate: data.dueDate,
        freight: data.freight,
        total,
        notes: data.notes,
      },
    );
    const items = diffItems(await named(tx, before), await named(tx, lines));
    if (changes.length || items.length) {
      await audit(tx, ctx, 'update', 'purchase', id, { number: previous.number, changes, items });
    }
  });
  return getPurchase(ctx, id);
}

// Receber: estoque e custo médio de cada produto (travados em ordem de id) e a conta a pagar.
export async function receivePurchase(ctx: Ctx, id: number) {
  authorize(ctx, 'purchases.receive');
  await db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(scoped(ctx, id)).for('update');
    if (!purchase) throw notFound('Compra não encontrada.');
    if (purchase.status !== 'draft') throw conflict('Esta compra já foi recebida ou cancelada.');
    const lines = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    const code = formatCode(purchase.number);

    const totals = new Map<number, { quantity: number; cost: number }>();
    for (const line of lines) {
      const current = totals.get(line.productId) ?? { quantity: 0, cost: 0 };
      totals.set(line.productId, {
        quantity: current.quantity + line.quantity,
        cost: current.cost + line.subtotal,
      });
    }
    const locked = await tx
      .select()
      .from(products)
      .where(inArray(products.id, [...totals.keys()]))
      .orderBy(asc(products.id))
      .for('update');
    const changes: StockChange[] = [];
    for (const product of locked) {
      const entry = totals.get(product.id);
      if (!entry || product.stock === null) continue;
      const stock = round2(product.stock + entry.quantity);
      const unitCost = entry.cost / entry.quantity;
      // Custo médio ponderado: o saldo antigo no custo antigo, mais o que chegou no custo da compra.
      const cost =
        product.stock > 0 && product.cost !== null
          ? round2((product.stock * product.cost + entry.cost) / stock)
          : round2(unitCost);
      await tx.update(products).set({ stock, cost }).where(eq(products.id, product.id));
      changes.push({ productId: product.id, quantity: entry.quantity, balance: stock });
    }
    await recordStock(tx, ctx, changes, 'purchase', { reason: `Compra ${code}` });

    const supplier = await personName(tx, purchase.supplierId);
    const [expense] = await tx
      .insert(expenses)
      .values({
        companyId: ctx.companyId,
        description: `Compra ${code}${supplier ? ` — ${supplier}` : ''}`,
        category: 'Mercadorias',
        amount: purchase.total,
        expenseDate: purchase.dueDate,
        status: 'pending',
        supplierId: purchase.supplierId,
      })
      .returning({ id: expenses.id });
    await tx
      .update(purchases)
      .set({ status: 'received', receivedAt: new Date(), expenseId: expense?.id ?? null })
      .where(eq(purchases.id, id));
    await audit(tx, ctx, 'status', 'purchase', id, {
      number: purchase.number,
      from: 'draft',
      to: 'received',
      changes: diffFields({ status: 'draft' }, { status: 'received' }),
    });
  });
  return getPurchase(ctx, id);
}

// Cancelar: rascunho só muda o status; recebida devolve o estoque e apaga a conta a pagar sem pagamento.
export async function cancelPurchase(ctx: Ctx, id: number, input: unknown) {
  authorize(ctx, 'purchases.cancel');
  const reason = String((input as { reason?: unknown } | null)?.reason ?? '').trim();
  if (!reason) throw badRequest('Informe o motivo.');
  await db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(scoped(ctx, id)).for('update');
    if (!purchase) throw notFound('Compra não encontrada.');
    if (purchase.status === 'cancelled') throw conflict('Esta compra já foi cancelada.');
    const code = formatCode(purchase.number);

    if (purchase.status === 'received') {
      if (purchase.expenseId) {
        const [expense] = await tx
          .select()
          .from(expenses)
          .where(eq(expenses.id, purchase.expenseId))
          .for('update');
        if (expense && expense.paidAmount > 0) {
          throw conflict(
            'A conta a pagar desta compra já tem pagamento. Estorne os pagamentos antes de cancelar.',
          );
        }
      }
      const lines = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
      const totals = new Map<number, number>();
      for (const line of lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
      const locked = await tx
        .select()
        .from(products)
        .where(inArray(products.id, [...totals.keys()]))
        .orderBy(asc(products.id))
        .for('update');
      const changes: StockChange[] = [];
      for (const product of locked) {
        const quantity = totals.get(product.id) ?? 0;
        if (product.stock === null) continue;
        const stock = round2(product.stock - quantity);
        if (stock < 0) {
          throw conflict(
            `"${product.name}" já saiu do estoque. Disponível: ${product.stock}, da compra: ${quantity}.`,
          );
        }
        await tx.update(products).set({ stock }).where(eq(products.id, product.id));
        changes.push({ productId: product.id, quantity: -quantity, balance: stock });
      }
      await recordStock(tx, ctx, changes, 'purchase', { reason: `Compra ${code} cancelada` });
      if (purchase.expenseId) await tx.delete(expenses).where(eq(expenses.id, purchase.expenseId));
    }

    await tx.update(purchases).set({ status: 'cancelled', expenseId: null }).where(eq(purchases.id, id));
    await audit(
      tx,
      ctx,
      'status',
      'purchase',
      id,
      {
        number: purchase.number,
        from: purchase.status,
        to: 'cancelled',
        changes: diffFields({ status: purchase.status }, { status: 'cancelled' }),
      },
      reason,
    );
  });
  return getPurchase(ctx, id);
}
