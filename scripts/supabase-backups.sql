-- Rotação dos backups da demonstração: mantém só os mais recentes.
-- Backups são schemas com nome backup_<data>_<descrição>, criados antes de cada migração em produção.
-- Rode no SQL Editor do Supabase. Pode rodar de novo: recria a função e o agendamento.

-- Apaga os schemas de backup mais antigos e devolve os nomes apagados. A ordem é a de criação
-- (o oid do schema cresce a cada objeto novo). Só toca em schemas backup_* do usuário postgres.
CREATE OR REPLACE FUNCTION demo.prune_backups(keep integer DEFAULT 5) RETURNS text[]
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  name text;
  dropped text[] := '{}';
BEGIN
  IF keep IS NULL OR keep < 1 THEN
    RAISE EXCEPTION 'Mantenha ao menos um backup (keep = %).', keep;
  END IF;
  FOR name IN
    SELECT n.nspname
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname ~ '^backup_[a-z0-9_]+$'
      AND pg_catalog.pg_get_userbyid(n.nspowner) = 'postgres'
    ORDER BY n.oid DESC
    OFFSET keep
  LOOP
    EXECUTE pg_catalog.format('DROP SCHEMA %I CASCADE', name);
    dropped := dropped || name;
  END LOOP;
  RETURN dropped;
END $$;
REVOKE ALL ON FUNCTION demo.prune_backups(integer) FROM PUBLIC;

-- Todo dia às 05h00 UTC (02h00 em Brasília), longe da restauração das 04h e das 16h UTC.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'arandue-backup-prune';
SELECT cron.schedule('arandue-backup-prune', '0 5 * * *', 'SELECT demo.prune_backups(5)');

-- Limpeza agora e conferência.
SELECT demo.prune_backups(5) AS apagados;
SELECT nspname AS backups_mantidos FROM pg_catalog.pg_namespace
WHERE nspname LIKE 'backup\_%' ORDER BY oid;
SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobid;
