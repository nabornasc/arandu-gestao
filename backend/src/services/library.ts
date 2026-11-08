import {
  type ItemTemplateInput,
  itemTemplateSchema,
  type TextSnippetInput,
  textSnippetSchema,
} from '@arandue/shared/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { itemTemplates, products, textSnippets } from '../db/schema.ts';
import { diffFields, initialFields } from '../lib/changes.ts';
import { authorize, authorizeAny, type Ctx } from '../lib/context.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';
import { audit } from './audit.ts';

// Biblioteca do orçamento: textos (cláusulas) e modelos de grupo de itens. Os documentos copiam o
// conteúdo ao inserir: mudar a biblioteca depois não muda orçamentos antigos.

const duplicate = (error: unknown) => {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return (code ?? cause?.code) === '23505';
};

async function unique<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (duplicate(error)) throw conflict(message);
    throw error;
  }
}

// ---------- Textos ----------

const snippetColumns = {
  id: textSnippets.id,
  title: textSnippets.title,
  body: textSnippets.body,
  active: textSnippets.active,
};

export async function listSnippets(ctx: Ctx, { all = false }: { all?: boolean } = {}) {
  if (all) authorize(ctx, 'settings.read');
  return db
    .select(snippetColumns)
    .from(textSnippets)
    .where(and(eq(textSnippets.companyId, ctx.companyId), all ? undefined : eq(textSnippets.active, true)))
    .orderBy(asc(sql`lower(${textSnippets.title})`));
}

export function createSnippet(ctx: Ctx, input: TextSnippetInput) {
  authorize(ctx, 'settings.update');
  const data = parse(textSnippetSchema, input);
  return unique('Já existe um texto com esse título.', () =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(textSnippets)
        .values({ ...data, companyId: ctx.companyId })
        .returning(snippetColumns);
      if (!row) throw new Error('Falha ao criar o texto.');
      await audit(tx, ctx, 'create', 'text_snippet', row.id, {
        label: row.title,
        changes: initialFields({ title: row.title, body: row.body }),
      });
      return row;
    }),
  );
}

export function updateSnippet(ctx: Ctx, id: number, input: TextSnippetInput) {
  authorize(ctx, 'settings.update');
  const data = parse(textSnippetSchema, input);
  const scoped = and(eq(textSnippets.id, id), eq(textSnippets.companyId, ctx.companyId));
  return unique('Já existe um texto com esse título.', () =>
    db.transaction(async (tx) => {
      const [previous] = await tx.select().from(textSnippets).where(scoped).for('update');
      if (!previous) throw notFound('Texto não encontrado.');
      const [row] = await tx.update(textSnippets).set(data).where(scoped).returning(snippetColumns);
      if (!row) throw notFound('Texto não encontrado.');
      const changes = diffFields(
        { title: previous.title, body: previous.body, active: previous.active },
        { title: row.title, body: row.body, active: row.active },
      );
      if (changes.length) await audit(tx, ctx, 'update', 'text_snippet', id, { label: row.title, changes });
      return row;
    }),
  );
}

// ---------- Modelos de grupo ----------

const templateColumns = {
  id: itemTemplates.id,
  name: itemTemplates.name,
  items: itemTemplates.items,
  active: itemTemplates.active,
};

// Quem monta orçamento usa os modelos; a tela de configurações vê também os desativados.
export async function listTemplates(ctx: Ctx, { all = false }: { all?: boolean } = {}) {
  if (all) authorize(ctx, 'settings.read');
  else authorizeAny(ctx, ['quotes.create', 'quotes.update']);
  return db
    .select(templateColumns)
    .from(itemTemplates)
    .where(and(eq(itemTemplates.companyId, ctx.companyId), all ? undefined : eq(itemTemplates.active, true)))
    .orderBy(asc(sql`lower(${itemTemplates.name})`));
}

// Os produtos do modelo precisam ser da empresa e estar ativos.
async function assertProducts(ctx: Ctx, ids: number[]) {
  const unique = [...new Set(ids)];
  const found = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.companyId, ctx.companyId), eq(products.active, true), inArray(products.id, unique)),
    );
  if (found.length !== unique.length) throw badRequest('O modelo tem produto inexistente ou inativo.');
}

// "2x Cerveja; 1x Gelo", para o histórico.
async function itemsText(ctx: Ctx, items: { productId: number; quantity: number }[]) {
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(
        eq(products.companyId, ctx.companyId),
        inArray(
          products.id,
          items.map((item) => item.productId),
        ),
      ),
    );
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return items
    .map((item) => `${item.quantity}x ${names.get(item.productId) ?? 'produto removido'}`)
    .join('; ');
}

// Salvar um grupo do orçamento como modelo: quem cria orçamentos pode.
export function createTemplate(ctx: Ctx, input: ItemTemplateInput) {
  authorize(ctx, 'quotes.create');
  const data = parse(itemTemplateSchema, input);
  return unique('Já existe um modelo com esse nome.', async () => {
    await assertProducts(
      ctx,
      data.items.map((item) => item.productId),
    );
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(itemTemplates)
        .values({
          ...data,
          items: data.items.map((item) => ({ ...item, unitPrice: item.unitPrice ?? null })),
          companyId: ctx.companyId,
          createdBy: ctx.userId,
        })
        .returning(templateColumns);
      if (!row) throw new Error('Falha ao criar o modelo.');
      await audit(tx, ctx, 'create', 'item_template', row.id, {
        label: row.name,
        changes: initialFields({ name: row.name, templateItems: await itemsText(ctx, row.items) }),
      });
      return row;
    });
  });
}

// Renomear, trocar os itens ou desativar: só quem configura a empresa.
export function updateTemplate(ctx: Ctx, id: number, input: ItemTemplateInput) {
  authorize(ctx, 'settings.update');
  const data = parse(itemTemplateSchema, input);
  const scoped = and(eq(itemTemplates.id, id), eq(itemTemplates.companyId, ctx.companyId));
  return unique('Já existe um modelo com esse nome.', async () => {
    await assertProducts(
      ctx,
      data.items.map((item) => item.productId),
    );
    return db.transaction(async (tx) => {
      const [previous] = await tx.select().from(itemTemplates).where(scoped).for('update');
      if (!previous) throw notFound('Modelo não encontrado.');
      const [row] = await tx
        .update(itemTemplates)
        .set({ ...data, items: data.items.map((item) => ({ ...item, unitPrice: item.unitPrice ?? null })) })
        .where(scoped)
        .returning(templateColumns);
      if (!row) throw notFound('Modelo não encontrado.');
      const changes = diffFields(
        { name: previous.name, templateItems: await itemsText(ctx, previous.items), active: previous.active },
        { name: row.name, templateItems: await itemsText(ctx, row.items), active: row.active },
      );
      if (changes.length) await audit(tx, ctx, 'update', 'item_template', id, { label: row.name, changes });
      return row;
    });
  });
}
