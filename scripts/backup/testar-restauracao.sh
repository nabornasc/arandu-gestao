#!/usr/bin/env bash
# Teste de restauração: volta um backup num Postgres descartável e confere se ele está inteiro.
#
# Uso:  BACKUP_PASSPHRASE=... scripts/backup/testar-restauracao.sh <arquivo.dump.gpg> <arquivo.contagens>
#
# O script não recebe URL de banco: ele cria o próprio container, restaura nele e o apaga no fim.
# Assim, nunca há como restaurar em produção por engano.
#
# Confere:
#   1. a restauração termina sem erro;
#   2. toda tabela de public que existia em produção existe na cópia;
#   3. a contagem de linhas de cada tabela fica entre a contagem de produção antes e depois do dump.
set -euo pipefail

: "${BACKUP_PASSPHRASE:?Defina BACKUP_PASSPHRASE (senha da criptografia do backup).}"
DUMP="${1:?Informe o arquivo .dump.gpg.}"
COUNTS="${2:?Informe o arquivo .contagens gerado junto com o backup.}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

CONTAINER="arandue-restauracao-$$"
WORK="$(mktemp -d)"
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

start=$(date +%s)

gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt --output "$WORK/backup.dump" "$DUMP" \
  3<<<"$BACKUP_PASSPHRASE"

docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -q && break
  sleep 1
done
# Sem -i: dentro do laço abaixo, o docker exec leria a entrada padrão e consumiria o arquivo de contagens.
psql_c() { docker exec "$CONTAINER" psql -U postgres -X -q -At -v ON_ERROR_STOP=1 "$@"; }

# As policies citam o usuário da aplicação; os schemas ficam com o dono do container.
psql_c -c "CREATE ROLE arandue_app NOLOGIN" -c "DROP SCHEMA public CASCADE"

docker exec -i "$CONTAINER" pg_restore -U postgres -d postgres --no-owner --no-privileges --exit-on-error \
  < "$WORK/backup.dump"
restored=$(date +%s)

failed=0
printf '%-28s %10s %10s %10s  %s\n' tabela antes depois cópia situação
while read -r table before after; do
  low=$((before < after ? before : after))
  high=$((before > after ? before : after))
  exists="$(psql_c -c "SELECT to_regclass('public.$table') IS NOT NULL")"
  if [ "$exists" != "t" ]; then
    printf '%-28s %10s %10s %10s  %s\n' "$table" "$before" "$after" "-" "FALTANDO"
    failed=1
    continue
  fi
  copy="$(psql_c -c "SELECT count(*) FROM public.\"$table\"")"
  status=ok
  if [ "$copy" -lt "$low" ] || [ "$copy" -gt "$high" ]; then
    status=DIFERENTE
    failed=1
  fi
  printf '%-28s %10s %10s %10s  %s\n' "$table" "$before" "$after" "$copy" "$status"
done < "$COUNTS"

migrations="$(psql_c -c "SELECT count(*) FROM drizzle.__drizzle_migrations")"
echo
echo "Migrações registradas na cópia: $migrations"
echo "Tempo: $((restored - start)) s para descriptografar e restaurar, $(($(date +%s) - start)) s no total."

if [ "$failed" -ne 0 ]; then
  echo "Restauração com problema: veja as linhas marcadas acima." >&2
  exit 1
fi
echo "Restauração conferida: todas as tabelas existem e as contagens batem."
