// O Drizzle embrulha o erro do Postgres: o código SQLSTATE pode vir no próprio erro ou numa causa.
const SQLSTATE = /^\d{2}[0-9A-Z]{3}$/;

export function pgCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && SQLSTATE.test(code)) return code;
    current = cause;
  }
  return null;
}

export const isUniqueViolation = (error: unknown) => pgCode(error) === '23505';
