# Backup e restauração do banco

O backup do banco de produção roda todo dia às 06h UTC (03h em Brasília) pelo workflow [Backup do banco](../../.github/workflows/backup.yml) e fica como artefato da execução no GitHub Actions. Logo depois, outro job restaura a cópia num Postgres descartável e confere as tabelas e as contagens. Se algo falhar, o GitHub manda e-mail.

## O que existe

| Cópia | Onde fica | Frequência | Até quando volta |
|-------|-----------|------------|------------------|
| Backup diário (este guia) | Artefato do GitHub Actions, criptografado | Todo dia, 06h UTC | As 7 últimas diárias e as 4 últimas semanais (domingo) |
| Schemas `backup_*` | Dentro do próprio banco | Antes de cada migração | Só protege contra migração errada, não contra perda do projeto |
| Schema `demo` | Dentro do próprio banco | Quando a demonstração é recapturada | Dados padrão da demonstração |
| Backup do Supabase | — | Não existe no plano Free | — |

O backup leva os schemas `public` (dados), `drizzle` (histórico das migrações) e `demo`. **Não leva** os arquivos dos anexos do CRM, que ficam no Supabase Storage, nem os agendamentos do `pg_cron`, que voltam rodando de novo os scripts da demonstração.

## Configuração (uma vez)

1. No SQL Editor do Supabase, rode [scripts/backup/supabase-usuario-backup.sql](../../scripts/backup/supabase-usuario-backup.sql) trocando `<senha-forte>` por uma senha gerada por você.
2. No Supabase, em **Connect**, copie a conexão do **Session pooler** (porta 5432) e troque o usuário por `arandue_backup.<ref-do-projeto>` e a senha pela do passo 1. A conexão direta não serve: ela é só IPv6, e o runner do GitHub não tem IPv6.
3. Gere uma senha longa para a criptografia (ex.: `openssl rand -base64 32`) e **guarde no seu gerenciador de senhas**. Sem ela, nenhum backup volta.
4. No GitHub, em **Settings > Secrets and variables > Actions**, crie `BACKUP_DATABASE_URL` (passo 2, terminando em `?sslmode=require`) e `BACKUP_PASSPHRASE` (passo 3).
5. Em **Actions > Backup do banco**, clique em **Run workflow** e confira que os dois jobs ficam verdes.

## O dia que der ruim

**O que se perde:** tudo o que foi gravado depois do último backup (até 24 horas) e os arquivos dos anexos do CRM.

**Quanto tempo leva:** a restauração da cópia leva cerca de 10 segundos no tamanho atual (medido no teste); o processo todo, com projeto novo e variáveis na Vercel, leva por volta de 30 minutos.

1. **Escolha a cópia.** Em **Actions > Backup do banco**, abra a execução do dia desejado e baixe o artefato `backup-AAAA-MM-DD` (ou `gh run download <id> -n backup-AAAA-MM-DD`).
2. **Teste antes de usar.** Na sua máquina, com Docker:
   ```bash
   BACKUP_PASSPHRASE='<senha>' scripts/backup/testar-restauracao.sh arandue-AAAA-MM-DD.dump.gpg arandue-AAAA-MM-DD.contagens
   ```
3. **Descriptografe:**
   ```bash
   gpg --decrypt --output arandue.dump arandue-AAAA-MM-DD.dump.gpg
   ```
4. **Prepare o banco de destino.** Prefira um projeto novo no Supabase (São Paulo, PostgreSQL 17): o projeto antigo fica intacto para comparar. No SQL Editor do projeto novo, crie o usuário da aplicação como em [Publicação](deploy.md), passo 4.
5. **Restaure** com o usuário `postgres` do projeto novo, pelo session pooler. O comando pula o schema `public`, que o Supabase já cria com as permissões dele, e para no primeiro erro:
   ```bash
   DESTINO='<conexão do postgres do projeto novo>?sslmode=require' \
   docker run --rm -e DESTINO -v "$PWD:/b" postgres:17-alpine sh -c '
     pg_restore -l /b/arandue.dump | grep -v -E "SCHEMA - public |COMMENT - SCHEMA public " > /tmp/lista &&
     pg_restore --no-owner --no-privileges --exit-on-error -L /tmp/lista -d "$DESTINO" /b/arandue.dump'
   ```
   Não use `--clean`: ele apagaria o schema `public` do projeto, com as permissões do Supabase.
6. **Recoloque a proteção e a demonstração** no SQL Editor do projeto novo: [scripts/supabase-seguranca.sql](../../scripts/supabase-seguranca.sql), [scripts/supabase-demo.sql](../../scripts/supabase-demo.sql), os agendamentos da demonstração e [scripts/backup/supabase-usuario-backup.sql](../../scripts/backup/supabase-usuario-backup.sql).
7. **Aponte o app para o banco novo:** na Vercel, troque `DATABASE_URL` (e `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, se o projeto mudou), publique de novo e abra `/api/health`. No GitHub, atualize `BACKUP_DATABASE_URL`.
8. **Confira:** entre com um usuário real, abra pedidos e contas a receber, e rode o workflow de backup manualmente.

A restauração nunca roda direto no banco de produção em uso: o script de teste cria o próprio container, e o passo 5 vai para um projeto novo.
