// Empresa de cada requisição, para o banco filtrar as linhas pelo RLS (B1 da auditoria do banco).
//
// O contexto vive no AsyncLocalStorage: o plugin de autenticação abre um por requisição e grava a empresa
// da sessão. O cliente do banco (db/client.ts) lê o contexto a cada consulta e define, dentro da transação,
// `app.company_id` ou `app.bypass`, que as policies conferem.
//
// Três modos:
//   empresa  requisição autenticada: o banco só mostra as linhas da empresa;
//   sistema  login, cadastro, sessão, webhook antes de identificar a conversa, limpezas e código fora de
//            requisição (seed, scripts, testes): o banco mostra tudo;
//   negado   requisição sem empresa e sem marca de sistema: o banco não mostra nada das tabelas da empresa.
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  companyId: number | null;
  system: boolean;
}

export type TenantScope = { mode: 'company'; companyId: number } | { mode: 'system' } | { mode: 'denied' };

const storage = new AsyncLocalStorage<TenantStore>();

// Abre o contexto de uma requisição, ainda sem empresa (modo negado até a sessão ser validada).
export function runInRequestContext(next: () => void): void {
  storage.run({ companyId: null, system: false }, next);
}

// Grava a empresa da sessão (ou do usuário do Telegram) no contexto da requisição atual.
export function setTenantCompany(companyId: number): void {
  const store = storage.getStore();
  if (store) store.companyId = companyId;
}

// Roda `fn` em modo sistema: para o que, por natureza, não tem empresa (login, sessão, limpezas).
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  return storage.run({ companyId: store?.companyId ?? null, system: true }, fn);
}

export function currentTenantScope(): TenantScope {
  const store = storage.getStore();
  // Fora de requisição (seed, scripts, testes): sistema.
  if (!store || store.system) return { mode: 'system' };
  if (store.companyId !== null) return { mode: 'company', companyId: store.companyId };
  return { mode: 'denied' };
}
