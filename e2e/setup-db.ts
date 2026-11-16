// Recria o banco dos testes ponta a ponta, aplica as migrações e carrega os dados de demonstração.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

// Conexão de dono (o backend do e2e roda como arandue_app, que não cria banco nem tabela).
const url = process.env.E2E_SETUP_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const name = new URL(url).pathname.slice(1);
// Este script apaga o banco inteiro: nunca pode alcançar o de desenvolvimento ou o de produção.
if (!/^[a-z_]*e2e$/.test(name)) throw new Error(`Recusando recriar um banco que não é de e2e: ${name}`);

const maintenance = new URL(url);
maintenance.pathname = '/postgres';
const sql = postgres(maintenance.href, { max: 1, onnotice: () => {} });
await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await sql.unsafe(`CREATE DATABASE ${name}`);
await sql.end();

const asOwner = { stdio: 'inherit' as const, env: { ...process.env, DATABASE_URL: url } };
execSync('npm run db:migrate -w backend', asOwner);
execSync('npm run db:seed -w backend', asOwner);

// Papéis do Supabase e a proteção de produção: GRANTs do arandue_app e RLS ligado.
const db = postgres(url, { max: 1, onnotice: () => {} });
for (const role of ['arandue_app', 'anon', 'authenticated']) {
  await db.unsafe(
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
  );
}
await db.unsafe(readFileSync('scripts/supabase-seguranca.sql', 'utf8'));
await db.end();
