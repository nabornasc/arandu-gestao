import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.ts';
import { currentTenantScope, type TenantScope } from '../lib/tenant.ts';
import * as schema from './schema.ts';

// prepare: false mantém compatibilidade com o pooler do Supabase em modo transação.
const raw = postgres(config.DATABASE_URL, {
  max: config.NODE_ENV === 'production' ? 5 : 10,
  prepare: false,
  onnotice: () => {},
});

// ---------- Empresa de cada consulta (RLS) ----------
// O banco filtra as linhas pela empresa da requisição (lib/tenant.ts). Como o pooler em modo transação
// não guarda estado entre transações, o valor vai com `set_config(..., true)`, que vale só dentro da
// transação: toda consulta avulsa vira uma transação curta (o set_config e a consulta seguem juntos,
// sem esperar um pelo outro), e toda transação começa com ele. Os serviços continuam usando `db`.

function scopeStatement(t: postgres.TransactionSql, scope: Exclude<TenantScope, { mode: 'denied' }>) {
  return scope.mode === 'company'
    ? t`SELECT set_config('app.company_id', ${String(scope.companyId)}, true), set_config('app.bypass', 'off', true)`
    : t`SELECT set_config('app.bypass', 'on', true)`;
}

function scopedUnsafe(
  query: string,
  params?: postgres.ParameterOrJSON<never>[],
  options?: postgres.UnsafeQueryOptions,
) {
  const scope = currentTenantScope();
  // Sem empresa e sem modo sistema, nada é definido: as policies não mostram linha das tabelas da empresa.
  if (scope.mode === 'denied') return raw.unsafe(query, params, options);
  const run = (values: boolean) =>
    raw
      .begin((t) => [
        scopeStatement(t, scope),
        values ? t.unsafe(query, params, options).values() : t.unsafe(query, params, options),
      ])
      .then((results) => results[1]);
  // O Drizzle usa `await client.unsafe(...)` e `client.unsafe(...).values()`.
  return {
    // biome-ignore lint/suspicious/noThenProperty: imita o PendingQuery do postgres-js, que é thenable.
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      run(false).then(resolve, reject),
    values: () => run(true),
  };
}

function scopedBegin(...args: unknown[]) {
  const callback = args.at(-1) as (t: postgres.TransactionSql) => unknown;
  const scope = currentTenantScope();
  const wrapped = async (t: postgres.TransactionSql) => {
    if (scope.mode !== 'denied') await scopeStatement(t, scope);
    return callback(t);
  };
  return args.length > 1 ? raw.begin(args[0] as string, wrapped) : raw.begin(wrapped);
}

const scopedClient = new Proxy(raw, {
  get(target, property, receiver) {
    if (property === 'unsafe') return scopedUnsafe;
    if (property === 'begin') return scopedBegin;
    return Reflect.get(target, property, receiver);
  },
});

// Cliente cru, sem escopo de empresa: só para migração, seed e encerramento (código fora de requisição).
export const sql = raw;

export const db = drizzle(scopedClient, { schema, casing: 'snake_case' });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Transaction;
