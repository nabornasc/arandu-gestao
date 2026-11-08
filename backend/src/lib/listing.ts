import { type ListPage, type ListQuery, listQuerySchema } from '@arandue/shared/schemas';
import { type AnyColumn, and, or, type SQL, sql } from 'drizzle-orm';
import { badRequest } from './errors.ts';
import { parse } from './validate.ts';

// Listas paginadas no servidor. Sem "page" na consulta, a rota mantém a resposta antiga (lista
// simples), que os campos de seleção e as integrações ainda usam.
export const wantsPage = (query: unknown): boolean =>
  typeof query === 'object' && query !== null && 'page' in query;

export function parseListQuery(query: unknown, statuses: readonly string[]): ListQuery {
  const data = parse(listQuerySchema, query);
  if (data.status && !statuses.includes(data.status)) throw badRequest('Status inválido.');
  if (data.from && data.to && data.from > data.to) throw badRequest('O início deve vir antes do fim.');
  return data;
}

export const pageWindow = ({ page, pageSize }: ListQuery) => ({
  limit: pageSize,
  offset: (page - 1) * pageSize,
});

// Momento gravado com fuso vira o dia de Brasília, como na tela.
export const localDay = (column: AnyColumn | SQL) => sql`(${column} AT TIME ZONE 'America/Sao_Paulo')::date`;

export function periodFilter(column: AnyColumn | SQL, { from, to }: ListQuery): SQL | undefined {
  return and(from ? sql`${column} >= ${from}` : undefined, to ? sql`${column} <= ${to}` : undefined);
}

const ACCENTED = 'áàâãäéèêëíìîïóòôõöúùûüç';
const PLAIN = 'aaaaaeeeeiiiiooooouuuuc';
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

// Texto sem diferença de acento nem de maiúsculas. "#12" ou "12" também procura pelo número.
export function textFilter(columns: (AnyColumn | SQL)[], q: string | undefined, number?: AnyColumn) {
  if (!q) return undefined;
  const like = `%${escapeLike(fold(q))}%`;
  const digits = q.replace(/^#/, '');
  return or(
    ...columns.map((column) => sql`translate(lower(${column}), ${ACCENTED}, ${PLAIN}) LIKE ${like}`),
    number && /^\d{1,9}$/.test(digits) ? sql`${number} = ${Number(digits)}` : undefined,
  );
}

// Soma em reais com duas casas, para os totais da lista.
export const money = (value: SQL) => sql<number>`coalesce(round((${value})::numeric, 2), 0)`.mapWith(Number);

export const toPage = <T>(
  query: ListQuery,
  total: number,
  rows: T[],
  totals: Record<string, number>,
): ListPage<T> => ({ rows, total, page: query.page, pageSize: query.pageSize, totals });
