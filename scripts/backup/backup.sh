#!/usr/bin/env bash
# Backup do banco de produção: pg_dump em formato custom, criptografado com gpg (AES-256).
#
# Uso:  BACKUP_DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup/backup.sh <pasta-de-saída>
#
# BACKUP_DATABASE_URL: conexão do usuário arandue_backup pelo session pooler do Supabase
#   (o runner do GitHub não tem IPv6, e a conexão direta do Supabase é só IPv6).
# BACKUP_PASSPHRASE: senha da criptografia. Sem ela o backup não volta: guarde também fora do GitHub.
#
# Gera na pasta:
#   arandue-AAAA-MM-DD.dump.gpg   cópia dos schemas public, drizzle (histórico das migrações) e demo
#   arandue-AAAA-MM-DD.contagens  linhas de cada tabela de public antes e depois do dump, para o teste de
#                                 restauração conferir (o dump é uma foto entre os dois momentos)
#
# Senhas só por variável de ambiente: nada vai para a linha de comando nem para o log.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Defina BACKUP_DATABASE_URL (conexão do usuário arandue_backup).}"
: "${BACKUP_PASSPHRASE:?Defina BACKUP_PASSPHRASE (senha da criptografia do backup).}"
OUT="${1:?Informe a pasta de saída.}"
# Mesma versão principal do Postgres do Supabase (17); o pg_dump recusa servidor mais novo que ele.
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

mkdir -p "$OUT"
NAME="arandue-$(date -u +%Y-%m-%d)"
DUMP="$OUT/$NAME.dump.gpg"
COUNTS="$OUT/$NAME.contagens"

# Ferramentas do Postgres pelo container: a versão do pg_dump fica fixa, sem depender do apt do runner.
pg() {
  docker run --rm -i --network host -e BACKUP_DATABASE_URL "$PG_IMAGE" sh -c "$1"
}

COUNT_SQL="SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"

before="$(pg "psql \"\$BACKUP_DATABASE_URL\" -X -At -F ' ' -v ON_ERROR_STOP=1 -c \"$COUNT_SQL\"")"

pg 'pg_dump "$BACKUP_DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --schema=drizzle --schema=demo' |
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
    --output "$DUMP" 3<<<"$BACKUP_PASSPHRASE"

after="$(pg "psql \"\$BACKUP_DATABASE_URL\" -X -At -F ' ' -v ON_ERROR_STOP=1 -c \"$COUNT_SQL\"")"

# tabela linhas_antes linhas_depois
LC_ALL=C join -a 1 -a 2 -e 0 -o 0,1.2,2.2 <(LC_ALL=C sort <<<"$before") <(LC_ALL=C sort <<<"$after") > "$COUNTS"

tables="$(wc -l < "$COUNTS")"
if [ "$tables" -eq 0 ]; then
  echo "Nenhuma tabela contada: confira as permissões do usuário de backup." >&2
  exit 1
fi
echo "Backup gravado: $DUMP ($(du -h "$DUMP" | cut -f1)), $tables tabelas contadas."
