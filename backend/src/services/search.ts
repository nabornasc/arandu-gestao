import { can } from '@arandue/shared/permissions';
import { and, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.ts';
import { opportunities, orders, people, products, quotes } from '../db/schema.ts';
import { type Ctx, ownScope } from '../lib/context.ts';
import { parse } from '../lib/validate.ts';
import { formatCode } from './numbering.ts';

export interface SearchResult {
  type: 'customer' | 'supplier' | 'product' | 'quote' | 'order' | 'opportunity';
  id: number;
  title: string;
  detail: string | null;
  path: string;
}

const PER_TYPE = 5;
const querySchema = z.object({ q: z.string().trim().min(2, 'Digite ao menos 2 letras.').max(80) });

// Curingas do LIKE digitados pelo usuário viram texto comum.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

// Busca rápida: cadastros e documentos que o grupo pode ver, com o escopo "só os próprios".
export async function search(ctx: Ctx, input: unknown): Promise<SearchResult[]> {
  const { q } = parse(querySchema, input);
  const like = `%${escapeLike(q)}%`;
  // "#12" ou "12" também procura pelo número do documento.
  const digits = q.replace(/^#/, '');
  const number = /^\d{1,9}$/.test(digits) ? Number(digits) : null;
  const results: SearchResult[] = [];

  const customers = can(ctx.permissions, 'customers.read');
  const suppliers = can(ctx.permissions, 'suppliers.read');
  if (customers || suppliers) {
    const roles: SQL[] = [];
    if (customers) roles.push(eq(people.isCustomer, true));
    if (suppliers)
      roles.push(eq(people.isSupplier, true), eq(people.isCarrier, true), eq(people.isSalesRep, true));
    const rows = await db
      .select({ id: people.id, name: people.name, isCustomer: people.isCustomer, document: people.document })
      .from(people)
      .where(
        and(
          eq(people.companyId, ctx.companyId),
          eq(people.active, true),
          or(...roles),
          or(
            ilike(people.name, like),
            number !== null ? sql`${people.document} LIKE ${`%${digits}%`}` : undefined,
          ),
        ),
      )
      .orderBy(people.name)
      .limit(PER_TYPE);
    for (const row of rows) {
      const isCustomer = customers && row.isCustomer;
      results.push({
        type: isCustomer ? 'customer' : 'supplier',
        id: row.id,
        title: row.name,
        detail: isCustomer ? 'Cliente' : 'Fornecedor ou parceiro',
        path: isCustomer ? `/clientes/${row.id}/ficha` : `/pessoas/${row.id}`,
      });
    }
  }

  if (can(ctx.permissions, 'products.read')) {
    const rows = await db
      .select({ id: products.id, name: products.name, type: products.type, group: products.groupName })
      .from(products)
      .where(
        and(eq(products.companyId, ctx.companyId), eq(products.active, true), ilike(products.name, like)),
      )
      .orderBy(products.name)
      .limit(PER_TYPE);
    for (const row of rows) {
      results.push({
        type: 'product',
        id: row.id,
        title: row.name,
        detail: [row.type === 'service' ? 'Serviço' : 'Produto', row.group].filter(Boolean).join(' · '),
        path: '/produtos',
      });
    }
  }

  if (can(ctx.permissions, 'quotes.read')) {
    const rows = await db
      .select({ id: quotes.id, number: quotes.number, customer: people.name })
      .from(quotes)
      .leftJoin(people, eq(people.id, quotes.customerId))
      .where(
        and(
          eq(quotes.companyId, ctx.companyId),
          ownScope(ctx, quotes.createdBy),
          or(ilike(people.name, like), number !== null ? eq(quotes.number, number) : undefined),
        ),
      )
      .orderBy(desc(quotes.id))
      .limit(PER_TYPE);
    for (const row of rows) {
      results.push({
        type: 'quote',
        id: row.id,
        title: `Orçamento ${formatCode(row.number)}`,
        detail: row.customer,
        path: `/orcamentos/${row.id}`,
      });
    }
  }

  if (can(ctx.permissions, 'orders.read')) {
    const rows = await db
      .select({ id: orders.id, number: orders.number, customer: people.name })
      .from(orders)
      .leftJoin(people, eq(people.id, orders.customerId))
      .where(
        and(
          eq(orders.companyId, ctx.companyId),
          ownScope(ctx, orders.createdBy),
          or(ilike(people.name, like), number !== null ? eq(orders.number, number) : undefined),
        ),
      )
      .orderBy(desc(orders.id))
      .limit(PER_TYPE);
    for (const row of rows) {
      results.push({
        type: 'order',
        id: row.id,
        title: `Pedido ${formatCode(row.number)}`,
        detail: row.customer,
        path: `/pedidos/${row.id}`,
      });
    }
  }

  if (can(ctx.permissions, 'opportunities.read')) {
    const rows = await db
      .select({ id: opportunities.id, title: opportunities.title, contact: opportunities.contactName })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.companyId, ctx.companyId),
          ownScope(ctx, opportunities.ownerId),
          or(ilike(opportunities.title, like), ilike(opportunities.contactName, like)),
        ),
      )
      .orderBy(desc(opportunities.id))
      .limit(PER_TYPE);
    for (const row of rows) {
      results.push({
        type: 'opportunity',
        id: row.id,
        title: row.title,
        detail: row.contact,
        path: `/crm/${row.id}`,
      });
    }
  }

  return results;
}
