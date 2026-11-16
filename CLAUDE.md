# Instruções para agentes de IA neste repositório

## Banco de dados

- Use sempre o banco local do Docker (`npm run db:up`): `arandue` para desenvolvimento, `arandue_test` para `npm test`, `arandue_e2e` para `npm run test:e2e`. As URLs estão em `backend/.env.example`.
- Nunca rode escrita (DDL, `INSERT`, `UPDATE`, `DELETE`, `GRANT`) no banco de produção (Supabase). Para mudar produção, entregue um arquivo SQL testado num banco local descartável, numa transação, com backup das tabelas afetadas num schema `backup_AAAAMMDD_<assunto>`; o dono do projeto roda no SQL Editor. Leitura (`SELECT` no catálogo, advisors, logs) é permitida.
- Migração nova vai para produção antes do deploy do código que depende dela. Depois de cada migração, rode `scripts/supabase-seguranca.sql`; se ela criar tabela, inclua o `GRANT` dela no script e rode também `scripts/supabase-demo.sql`.

## Validação

- `npm run lint`, `npm run typecheck`, `npm test` e, quando a mudança afeta telas, `npm run test:e2e`.
