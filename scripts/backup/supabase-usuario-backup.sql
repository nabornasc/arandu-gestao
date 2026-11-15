-- Usuário só de leitura para o backup diário (scripts/backup/backup.sh). Rode no SQL Editor do Supabase,
-- trocando <senha-forte> por uma senha gerada por você. A senha não fica em nenhum arquivo: vai só no
-- GitHub Secret BACKUP_DATABASE_URL.
--
-- Por que BYPASSRLS: as tabelas têm RLS ligado, e o pg_dump desliga o RLS na própria sessão. Com um usuário
-- que não pode ignorar o RLS, o dump falha em vez de copiar menos linhas. O usuário não grava nada.

CREATE ROLE arandue_backup LOGIN PASSWORD '<senha-forte>' BYPASSRLS NOINHERIT;

GRANT USAGE ON SCHEMA public, drizzle, demo TO arandue_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle, demo TO arandue_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, drizzle TO arandue_backup;

-- Tabelas e sequências criadas depois (migrações rodam como postgres) também entram no backup.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, drizzle, demo GRANT SELECT ON TABLES TO arandue_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, drizzle GRANT SELECT ON SEQUENCES TO arandue_backup;
