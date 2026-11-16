import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import { asSystem, runInRequestContext, setTenantCompany } from '../lib/tenant.ts';

// O que chega ao banco em cada modo do contexto de empresa (lib/tenant.ts e db/client.ts).

interface Seen {
  role: string;
  company: string | null;
  bypass: string | null;
}

const seen = async (): Promise<Seen> => {
  const [row] = await db.execute<{ role: string; company: string | null; bypass: string | null }>(
    sql`SELECT current_user AS role, nullif(current_setting('app.company_id', true), '') AS company,
               nullif(current_setting('app.bypass', true), '') AS bypass`,
  );
  if (!row) throw new Error('Sem resposta do banco.');
  return row;
};

// Roda `fn` dentro de um contexto de requisição, como o plugin de autenticação faz.
const inRequest = <T>(fn: () => Promise<T>) =>
  new Promise<T>((resolve, reject) => runInRequestContext(() => fn().then(resolve, reject)));

describe('empresa de cada consulta', () => {
  it('a aplicação conecta como arandue_app, igual à produção', async () => {
    expect((await seen()).role).toBe('arandue_app');
  });

  it('fora de requisição (seed, scripts, testes) roda em modo sistema', async () => {
    expect(await seen()).toMatchObject({ company: null, bypass: 'on' });
  });

  it('requisição autenticada leva a empresa da sessão, sem modo sistema', async () => {
    const result = await inRequest(async () => {
      setTenantCompany(42);
      return seen();
    });
    expect(result).toMatchObject({ company: '42', bypass: 'off' });
  });

  it('a empresa também vale dentro das transações', async () => {
    const result = await inRequest(async () => {
      setTenantCompany(7);
      return db.transaction(async (tx) => {
        const [row] = await tx.execute<{ company: string }>(
          sql`SELECT current_setting('app.company_id', true) AS company`,
        );
        return row?.company;
      });
    });
    expect(result).toBe('7');
  });

  it('requisição sem empresa e sem marca de sistema não define nada (o banco nega)', async () => {
    expect(await inRequest(seen)).toMatchObject({ company: null, bypass: null });
  });

  it('asSystem dentro da requisição liga o modo sistema só no trecho marcado', async () => {
    const result = await inRequest(async () => {
      setTenantCompany(5);
      const inside = await asSystem(seen);
      const after = await seen();
      return { inside, after };
    });
    expect(result.inside).toMatchObject({ bypass: 'on' });
    expect(result.after).toMatchObject({ company: '5', bypass: 'off' });
  });

  it('requisições simultâneas não misturam as empresas', async () => {
    const results = await Promise.all(
      [11, 12, 13, 14, 15].map((id) =>
        inRequest(async () => {
          setTenantCompany(id);
          await new Promise((resolve) => setTimeout(resolve, 5));
          return (await seen()).company;
        }),
      ),
    );
    expect(results).toEqual(['11', '12', '13', '14', '15']);
  });
});
