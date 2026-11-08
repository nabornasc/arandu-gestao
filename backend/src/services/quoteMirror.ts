import { formatAddress, formatDocument } from '@arandue/shared/br';
import { asc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.ts';
import { companies, people, products, quoteItems, users } from '../db/schema.ts';
import { notFound } from '../lib/errors.ts';
import { round2 } from '../lib/money.ts';

// Monta os dados do espelho do cliente que vêm de outros cadastros. A API decide o que cada um vê.
export async function buildMirrorSnapshot(
  db: DbOrTx,
  companyId: number,
  quote: { id: number; customerId: number | null; createdBy: number | null },
) {
  const [company] = await db
    .select({
      name: companies.name,
      legalName: companies.legalName,
      cnpj: companies.cnpj,
      address: companies.address,
      phone: companies.phone,
      email: companies.email,
      logo: companies.logo,
      terms: companies.quoteTerms,
    })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (!company) throw notFound();

  const [person] = quote.customerId
    ? await db.select().from(people).where(eq(people.id, quote.customerId))
    : [];
  const [seller] = quote.createdBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, quote.createdBy))
    : [];
  const items = await db
    .select({
      name: sql<string>`coalesce(${products.name}, ${quoteItems.description})`,
      unit: products.unit,
      quantity: quoteItems.quantity,
      unitPrice: quoteItems.unitPrice,
      subtotal: quoteItems.subtotal,
      groupName: quoteItems.groupName,
      width: quoteItems.width,
      length: quoteItems.length,
      measureUnit: quoteItems.measureUnit,
      hiddenInMirror: quoteItems.hiddenInMirror,
    })
    .from(quoteItems)
    .leftJoin(products, eq(products.id, quoteItems.productId))
    .where(eq(quoteItems.quoteId, quote.id))
    .orderBy(asc(quoteItems.id));

  return {
    issuer: { ...company, cnpj: company.cnpj ? formatDocument(company.cnpj) : null },
    sellerName: seller?.name ?? null,
    customer: person
      ? {
          name: person.name,
          legalName: person.legalName,
          document: person.document ? formatDocument(person.document) : null,
          email: person.email,
          phones: [person.phone, person.mobile].filter(Boolean).join(' / ') || null,
          address: formatAddress(person) || null,
        }
      : null,
    items,
  };
}

export type MirrorSnapshot = Awaited<ReturnType<typeof buildMirrorSnapshot>>;

export const hideCustomerDetails = (customer: MirrorSnapshot['customer']) =>
  customer && {
    name: customer.name,
    legalName: null,
    document: null,
    email: null,
    phones: null,
    address: null,
  };

interface CostedLine {
  type: 'product' | 'service';
  group: string | null;
  subtotal: number;
  unitCost: number | null;
  quantity: number;
}

const percentOf = (result: number, revenue: number) =>
  revenue > 0 ? round2((result / revenue) * 100) : null;

// Soma com custo desconhecido não é um número real: sem o custo de todos os itens, a resposta é "não sei".
function sumCosts(lines: CostedLine[]) {
  if (lines.some((line) => line.unitCost === null)) return null;
  return round2(lines.reduce((sum, line) => sum + (line.unitCost ?? 0) * line.quantity, 0));
}

// Margem do orçamento. A base é o valor dos itens menos o desconto: frete e outras despesas são
// repasses sem custo cadastrado, e contá-los como venda inflaria o resultado.
export function computeMargin(lines: CostedLine[], discount: number) {
  const revenue = round2(lines.reduce((sum, line) => sum + line.subtotal, 0) - discount);
  const cost = sumCosts(lines);
  const result = cost === null ? null : round2(revenue - cost);
  return {
    revenue,
    cost,
    result,
    percent: result === null ? null : percentOf(result, revenue),
    missingCost: lines.filter((line) => line.unitCost === null).length,
  };
}

const TYPE_LABEL = { product: 'Produtos', service: 'Serviços' } as const;

// Resumo por grupo do produto, antes do desconto do documento. Item sem grupo fica em Produtos ou Serviços.
export function summarizeByGroup(lines: CostedLine[]) {
  const labels = [...new Set(lines.map((line) => line.group ?? TYPE_LABEL[line.type]))];
  return labels.map((label) => {
    const ofGroup = lines.filter((line) => (line.group ?? TYPE_LABEL[line.type]) === label);
    const revenue = round2(ofGroup.reduce((sum, line) => sum + line.subtotal, 0));
    const cost = sumCosts(ofGroup);
    const result = cost === null ? null : round2(revenue - cost);
    return { label, revenue, cost, result, percent: result === null ? null : percentOf(result, revenue) };
  });
}
