// Recria o schema do banco de teste do zero e aplica as migrações antes da suíte.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://arandue:arandue@127.0.0.1:5432/arandue_test';
  if (!url.includes('test')) throw new Error(`Recusando limpar um banco que não parece de teste: ${url}`);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  // Papéis do Supabase e a proteção de produção (RLS, policies e GRANTs): a aplicação roda como arandue_app.
  for (const role of ['arandue_app', 'anon', 'authenticated']) {
    await sql.unsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
    );
  }
  await sql.unsafe(
    readFileSync(fileURLToPath(new URL('../../../scripts/supabase-seguranca.sql', import.meta.url)), 'utf8'),
  );
  await sql.end();
}
