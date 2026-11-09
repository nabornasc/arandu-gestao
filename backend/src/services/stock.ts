import {
  type InventoryInput,
  inventorySchema,
  type StockAdjustmentInput,
  stockAdjustmentSchema,
} from '@arandue/shared/schemas';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, type Transaction } from '../db/client.ts';
import { orders, products, stockMovements, users } from '../db/schema.ts';
import { diffFields } from '../lib/changes.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';

export type StockMovementKind = (typeof stockMovements.$inferInsert)['kind'];

export interface StockChange {
  productId: number;
  quantity: number;
  balance: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Grava no extrato as mudanças de saldo já aplicadas, na mesma transação.
export async function recordStock(
  tx: Transaction,
  ctx: Ctx,
  changes: StockChange[],
  kind: StockMovementKind,
  { orderId = null, reason = null }: { orderId?: number | null; reason?: string | null } = {},
): Promise<void> {
  const rows = changes.filter((change) => change.quantity !== 0);
  if (!rows.length) return;
  await tx.insert(stockMovements).values(
    rows.map((change) => ({
      companyId: ctx.companyId,
      productId: change.productId,
      kind,
      quantity: change.quantity,
      balance: change.balance,
      orderId,
      reason,
      userId: ctx.userId,
    })),
  );
}

const ADJUSTMENT_LABEL = { in: 'Entrada', out: 'Saída', count: 'Contagem' } as const;

// Ajuste manual: entrada, saída ou contagem, sempre com motivo. O saldo nunca fica negativo.
export async function adjustStock(ctx: Ctx, productId: number, input: StockAdjustmentInput) {
  authorize(ctx, 'products.adjust');
  const data = parse(stockAdjustmentSchema, input);
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.companyId, ctx.companyId), eq(products.active, true)),
      )
      .for('update');
    if (!product) throw notFound('Produto não encontrado.');
    if (product.type !== 'product' || product.stock === null) {
      throw badRequest('Este item não controla estoque.');
    }
    const balance = round2(
      data.kind === 'count'
        ? data.quantity
        : product.stock + (data.kind === 'in' ? data.quantity : -data.quantity),
    );
    if (balance < 0) {
      throw badRequest(`O saldo ficaria negativo. Disponível: ${product.stock}.`);
    }
    const quantity = round2(balance - product.stock);
    if (quantity === 0 && data.kind !== 'count') throw badRequest('Informe uma quantidade maior que zero.');

    await tx.update(products).set({ stock: balance }).where(eq(products.id, productId));
    await recordStock(
      tx,
      ctx,
      [{ productId, quantity, balance }],
      data.kind === 'count' ? 'count' : 'adjustment',
      {
        reason: data.reason,
      },
    );
    await audit(
      tx,
      ctx,
      'update',
      'product',
      productId,
      {
        label: product.name,
        stockAdjustment: ADJUSTMENT_LABEL[data.kind],
        changes: diffFields({ stock: product.stock }, { stock: balance }),
      },
      data.reason,
    );
    return { ...product, stock: balance };
  });
}

// Inventário: grava a contagem de vários produtos numa transação só. Se um item não vale
// (serviço, de outra empresa ou inativo), nada é gravado.
export async function countInventory(ctx: Ctx, input: InventoryInput) {
  authorize(ctx, 'products.adjust');
  const data = parse(inventorySchema, input);
  return db.transaction(async (tx) => {
    const ids = data.items.map((item) => item.productId);
    const rows = await tx
      .select()
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.companyId, ctx.companyId), eq(products.active, true)))
      .for('update');
    const byId = new Map(rows.map((row) => [row.id, row]));
    const invalid = data.items.filter((item) => {
      const row = byId.get(item.productId);
      return row?.type !== 'product' || row.stock === null;
    });
    if (invalid.length) {
      throw badRequest(
        'Algum item do inventário não existe ou não controla estoque. Atualize a lista e tente de novo.',
      );
    }

    let adjusted = 0;
    for (const item of data.items) {
      const product = byId.get(item.productId);
      if (!product || product.stock === null) continue;
      const balance = round2(item.counted);
      const quantity = round2(balance - product.stock);
      if (quantity === 0) continue;
      adjusted++;
      await tx.update(products).set({ stock: balance }).where(eq(products.id, product.id));
      await recordStock(tx, ctx, [{ productId: product.id, quantity, balance }], 'count', {
        reason: data.reason,
      });
      await audit(
        tx,
        ctx,
        'update',
        'product',
        product.id,
        {
          label: product.name,
          stockAdjustment: 'Inventário',
          changes: diffFields({ stock: product.stock }, { stock: balance }),
        },
        data.reason,
      );
    }
    return { adjusted, unchanged: data.items.length - adjusted };
  });
}

// Extrato do produto, do mais recente para o mais antigo.
export async function listStockMovements(ctx: Ctx, productId: number) {
  authorize(ctx, 'products.read');
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.companyId, ctx.companyId)));
  if (!product) throw notFound('Produto não encontrado.');
  return db
    .select({
      id: stockMovements.id,
      kind: stockMovements.kind,
      quantity: stockMovements.quantity,
      balance: stockMovements.balance,
      reason: stockMovements.reason,
      createdAt: stockMovements.createdAt,
      userName: users.name,
      orderId: stockMovements.orderId,
      orderNumber: orders.number,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .leftJoin(orders, eq(orders.id, stockMovements.orderId))
    .where(and(eq(stockMovements.productId, productId), eq(stockMovements.companyId, ctx.companyId)))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(200);
}
