// Limite de tentativas guardado no banco, válido para todas as instâncias da API ao mesmo tempo.
// O limite do @fastify/rate-limit (em memória) continua como proteção geral; este cobre as rotas de credenciais.
import { createHash } from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { rateLimits } from '../db/schema.ts';
import { AppError } from '../lib/errors.ts';

export interface Limit {
  max: number;
  windowMs: number;
}

// Chave sem dado pessoal: o e-mail ou o IP entram só como hash.
export const limitKey = (scope: string, value: string) =>
  `${scope}:${createHash('sha256').update(value).digest('hex')}`;

// Conta uma tentativa e devolve o total da janela. É um único INSERT ... ON CONFLICT: requisições
// simultâneas, em qualquer instância, esperam a trava da linha e nunca leem o mesmo valor.
export async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
  const resetAt = sql`now() + make_interval(secs => ${windowMs / 1000}::double precision)`;
  const expired = sql`${rateLimits.resetAt} <= now()`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${expired} THEN ${resetAt} ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });
  if (!row) throw new Error('Falha ao registrar a tentativa.');
  return row;
}

// Conta a tentativa e recusa com 429 quando passa do limite.
export async function consume(key: string, limit: Limit): Promise<void> {
  const { count, resetAt } = await hit(key, limit.windowMs);
  if (count > limit.max) {
    const minutes = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60_000));
    throw new AppError(
      429,
      `Muitas tentativas. Aguarde ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e tente de novo.`,
    );
  }
}

export async function resetLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

// Limpeza oportunista dos contadores vencidos há mais de um dia.
export async function cleanupLimits(): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.resetAt, sql`now() - interval '1 day'`));
}
