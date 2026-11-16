import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';

// O usuário da aplicação em produção (arandue_app) só recebe permissão nas tabelas listadas em
// scripts/supabase-seguranca.sql. Tabela nova sem linha lá ficaria inacessível depois da migração.
const SCRIPT = readFileSync(new URL('../../../scripts/supabase-seguranca.sql', import.meta.url), 'utf8');
// Tabelas que a aplicação não usa: ficam sem permissão de propósito.
const UNUSED = ['events'];

function grantedTables(): Set<string> {
  const tables = new Set<string>();
  for (const match of SCRIPT.matchAll(/GRANT [A-Z, ]+ ON\s+(?!SCHEMA\b)([\w,\s]+?)\s+TO arandue_app;/g)) {
    for (const name of (match[1] ?? '').split(',')) {
      const table = name.trim();
      if (table) tables.add(table);
    }
  }
  return tables;
}

describe('permissões do usuário da aplicação', () => {
  it('toda tabela do banco tem permissão no script de segurança, e o script não cita tabela que não existe', async () => {
    const rows = await db.execute<{ name: string }>(
      sql`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
    );
    const existing = rows.map((row) => row.name);
    const granted = grantedTables();
    expect(existing.filter((table) => !granted.has(table) && !UNUSED.includes(table))).toEqual([]);
    expect([...granted].filter((table) => !existing.includes(table))).toEqual([]);
  });

  it('toda tabela tem RLS ligado e uma policy (migração 0045 em diante)', async () => {
    const rows = await db.execute<{ name: string; rls: boolean; policies: number }>(sql`
      SELECT c.relname AS name, c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1`);
    expect(rows.filter((row) => !row.rls || row.policies === 0).map((row) => row.name)).toEqual([]);
    // A permissiva antiga não pode voltar.
    const [old] = await db.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM pg_policies WHERE policyname = 'arandue_app_all'`,
    );
    expect(old?.total).toBe(0);
  });
});
