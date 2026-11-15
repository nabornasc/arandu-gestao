# Auditoria de exposição do banco — Arandu Gestão

Data: 15/11/2026. Somente leitura: consultas `SELECT` no catálogo do Postgres de produção, advisors do Supabase, requisições `GET` à API pública do Supabase com a chave publishable (pública por design), varredura do código, do histórico do git (todas as branches) e do JavaScript publicado em https://arandu-gestao.vercel.app. Nada foi alterado.

## Resumo

O banco não está aberto para quem só tem a chave pública: a API do Supabase recusa todas as tabelas do app com `permission denied`, e nenhum segredo foi publicado no front ou no histórico do git. **Nenhuma chave precisa ser trocada.**

Os pontos abertos são de defesa em profundidade: o Postgres aceita conexão com senha de qualquer endereço da internet, e o isolamento entre empresas depende só do código (policies `USING (true)`).

| # | Achado | Risco | Derruba o app se corrigir? |
|---|--------|-------|----------------------------|
| B1 | Policies `USING (true) WITH CHECK (true)` para `arandue_app` em todas as tabelas: o banco não separa as empresas | Médio | Sim, se feito errado. Exige mudança no backend antes |
| B2 | Postgres aceita login com senha de qualquer IP (conexão direta em IPv6 e pooler em IPv4). Restrição de rede não verificada | Médio | Sim: a Vercel não tem IP fixo; restringir a rede bloqueia a API |
| B3 | Cadastro do Supabase Auth aberto por e-mail, sem uso pelo app. **Corrigido em 15/11/2026** | Baixo | Não |
| B4 | API REST do Supabase (Data API) publica o schema `public` sem uso pelo app; o erro confirma o nome das tabelas. Chave legacy `anon` (JWT) ainda ativa | Baixo | Não (o backend conecta direto no Postgres; o upload de anexos usa a API de Storage, que é outro serviço) |
| B5 | Permissões padrão do Supabase em `realtime`, `storage` e `extensions` para `anon` | Baixo | Não |
| B6 | Sete schemas `backup_*` com cópia de dados da demonstração | Baixo | Não |

## 1. Onde o banco roda e o que está aberto

- **Produção:** Supabase gerenciado, projeto `whaunqisvvhubzmesudw`, região `sa-east-1`, PostgreSQL 17. O backend (Vercel, `gru1`) conecta pelo *transaction pooler* com o usuário `arandue_app` (`docs/guias/deploy.md`).
- **Porta exposta:** a conexão direta `db.whaunqisvvhubzmesudw.supabase.co:5432` resolve só para IPv6 (`2600:1f1e:90b:a701:…`) e o pooler do Supabase aceita IPv4 nas portas 5432/6543. Os dois aceitam login com usuário e senha de qualquer origem, a menos que *Network Restrictions* esteja configurado no painel. **Não verificado:** o MCP não expõe essa configuração.
- **`listen_addresses` e `pg_hba.conf` em produção:** não verificados. O Supabase gerencia esses arquivos e não dá acesso a eles. O servidor tem `ssl = on`; se a opção *Enforce SSL* está ligada no painel também não foi verificado.
- **Usuários com login:** `arandue_app` (app, sem superusuário, sem `BYPASSRLS`), `postgres` (dono, `BYPASSRLS`, usado só em migrações), e os papéis internos do Supabase (`authenticator`, `pgbouncer`, `supabase_*`). A força das senhas não foi verificada.
- **Desenvolvimento (Docker local):** o Postgres escuta em `*` dentro do container, mas o Docker só publica a porta em `127.0.0.1:5432` (`compose.yaml`, conferido com `ss -ltn` e `docker port`). O `pg_hba.conf` local usa `trust` para conexões da própria máquina e `scram-sha-256` para as demais. Nada aberto para a rede.

## 2. Segredos no front, em variáveis públicas e no histórico

| Onde | O que encontrei | Precisa trocar? |
|------|-----------------|-----------------|
| Variáveis `VITE_*` | `VITE_SENTRY_DSN` (pública por design: só envia eventos) e `VITE_DEMO_MODE` (flag) | Não |
| JavaScript publicado em produção | Só o DSN do Sentry. Nenhuma chave do Supabase, da Anthropic, do Telegram nem connection string | Não |
| Histórico do git, todas as branches | Nenhum `.env` commitado (só `backend/.env.example`). As únicas connection strings são `postgres://arandue:arandue@127.0.0.1:5432` (Postgres local de desenvolvimento) e uma senha fictícia de teste em `127.0.0.1:1` | Não |
| Código do backend | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` e `DATABASE_URL` vêm só do ambiente (`backend/src/config.ts`) | Não |
| README | Login da demonstração (`dono@conveniencia.test` / `senha-demo-123`): público de propósito, dados fictícios restaurados a cada 12 horas | Não |

Padrões procurados: `postgres://usuario:senha@`, `sb_secret_`, JWT (`eyJhbGciOi…`), `sk-ant-`, token de bot do Telegram, `sntrys_`, DSN do Sentry e atribuições de `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_WEBHOOK_SECRET` e `ANTHROPIC_API_KEY`.

Não verificado: as variáveis cadastradas na Vercel (o MCP da Vercel não tem acesso ao time `nabornasc`). Pelo build, só `VITE_*` vai para o navegador.

## 3. Quem lê e escreve em cada tabela

**Tabelas do app (41 no schema `public`).** Todas iguais:

- RLS ligado.
- `anon` e `authenticated` (os papéis da API pública): **não podem ler, inserir, alterar nem apagar.** Não há `GRANT` para eles, e a API responde `42501 permission denied` (testado com a chave publishable e com a legacy `anon` em `users`, `companies`, `sessions` e `rate_limits`).
- `arandue_app` (o backend): pode ler, inserir, alterar e apagar qualquer linha, de qualquer empresa. A policy `arandue_app_all … TO arandue_app USING (true) WITH CHECK (true)` libera tudo; quem separa as empresas é o `where company_id = …` no código.
- `postgres`: dono das tabelas, com `BYPASSRLS`; usado só para migrações.

Lista: `access_group_permissions`, `access_groups`, `agenda_events`, `ai_pending_actions`, `ai_usage`, `attachments`, `audit_logs`, `bank_accounts`, `cash_transactions`, `companies`, `company_list_items`, `customer_advances`, `events`, `expense_payments`, `expenses`, `interactions`, `item_templates`, `opportunities`, `opportunity_items`, `order_items`, `orders`, `payment_conditions`, `people`, `person_addresses`, `person_contacts`, `pipeline_stages`, `products`, `purchase_items`, `purchases`, `quote_items`, `quotes`, `rate_limits`, `receivable_payments`, `receivables`, `sales_goals`, `sessions`, `stock_movements`, `telegram_link_failures`, `telegram_messages`, `telegram_updates`, `text_snippets`, `user_preferences`, `users`.

**Funções.** `public.rls_auto_enable` (`SECURITY DEFINER`) e as funções do schema `demo` não são executáveis por `anon` nem `authenticated`.

**Outros schemas com permissão para `anon`/`authenticated`** (padrão do Supabase):

| Tabela | Permissão | Efeito real |
|--------|-----------|-------------|
| `storage.objects`, `storage.buckets`, `storage.buckets_analytics` | `SELECT/INSERT/UPDATE/DELETE` | Nenhum: RLS ligado e nenhuma policy. A API de Storage com a chave pública devolve lista de buckets vazia. O bucket `anexos` é privado; só o backend (service role) acessa |
| `storage.buckets_vectors`, `s3_multipart_uploads*`, `vector_indexes` | `SELECT` | Nenhum: RLS ligado e nenhuma policy |
| `realtime.messages` | `SELECT/INSERT/UPDATE` | Nenhum: RLS ligado e nenhuma policy |
| `realtime.subscription` | `SELECT`, **sem RLS** | Lista de assinaturas do Realtime, que o app não usa (tabela vazia na prática). O schema `realtime` não é servido pela API REST |
| `extensions.pg_stat_statements` | `SELECT`, sem RLS | Estatísticas de consultas; para papéis sem `pg_read_all_stats`, o texto das consultas de outros usuários aparece como `<insufficient privilege>`. O schema `extensions` não é servido pela API REST |
| `cron.job`, `cron.job_run_details` | `SELECT` (e `DELETE` em `job_run_details`) | Nenhum: `anon` não tem `USAGE` no schema `cron`, e a policy só mostra os jobs do próprio usuário |

**Regras que liberam geral.** Só as policies `USING (true) WITH CHECK (true)`, e elas valem apenas para `arandue_app` (achado B1). Não há Firebase.

**Outros serviços.** GraphQL desligado (`pg_graphql` não instalado). Supabase Auth: cadastro por e-mail aberto, com confirmação por e-mail; `auth.users` tem 0 usuários (achado B3).

## 4. Achados e correções

| # | Achado | Risco | Onde | Correção proposta |
|---|--------|-------|------|-------------------|
| B1 | Isolamento entre empresas só no código: a policy de `arandue_app` é `USING (true) WITH CHECK (true)`. Um `where` esquecido numa rota nova vaza dados de outra empresa sem barreira no banco. Hoje os testes `isolation.test.ts`, `rbac.test.ts` e `access.test.ts` cobrem as rotas existentes | Médio | `scripts/supabase-seguranca.sql:20-29` | Em etapas: (1) o backend passa a abrir cada requisição numa transação com `SET LOCAL app.company_id = <empresa da sessão>`; (2) policies `USING (company_id = current_setting('app.company_id')::int)` nas tabelas com `company_id`, e por junção nas tabelas filhas; (3) login, cadastro, webhook do Telegram e limpezas, que rodam sem empresa, usam um papel separado ou funções específicas. **Atenção:** a etapa 2 sem a 1 derruba o app inteiro. É a mudança mais cara da lista; alternativa mais barata é manter e exigir teste de isolamento para cada rota nova |
| B2 | Postgres aceita login por senha de qualquer IP (direto em IPv6, pooler em IPv4). Restrição de rede e *Enforce SSL* não verificados | Médio | Painel do Supabase: Database > Network Restrictions e SSL Configuration | Confirmar no painel que *Enforce SSL* está ligado (não derruba: a `DATABASE_URL` já usa `sslmode=require`). Usar senhas longas e aleatórias para `postgres` e `arandue_app` e trocar periodicamente. **Não ligar *Network Restrictions*** sem IP fixo na Vercel (Static IPs, plano Pro): bloquearia a API |
| B3 | Cadastro do Supabase Auth aberto por e-mail, sem uso pelo app. Quem se cadastrar vira `authenticated`; hoje esse papel não acessa nada, mas um `GRANT` ou policy futura para `authenticated` abriria dados | Baixo | Painel do Supabase: configurações de Authentication (cadastro e provedores) | Desligar *Allow new users to sign up* (e o provedor de e-mail). Não afeta o app, que tem login próprio |
| B4 | Data API publica o schema `public` sem necessidade. A resposta `permission denied for table users` confirma o nome das tabelas a quem tem a chave pública. A chave legacy `anon` (JWT) segue ativa | Baixo | Painel do Supabase: configurações da Data API e das API Keys | Tirar `public` dos *Exposed schemas* (ou desligar a Data API) e desativar as chaves legacy. Não afeta o app: o backend usa conexão direta e o upload de anexos usa a API de Storage com a service role |
| B5 | Permissões padrão do Supabase para `anon` em `realtime.subscription` (sem RLS) e `extensions.pg_stat_statements` | Baixo | Schemas gerenciados pelo Supabase | Nenhuma ação no banco (mexer em schemas gerenciados pode quebrar a plataforma). Os dois schemas não são servidos pela API REST. Se a Data API for desligada (B4), deixa de existir caminho até eles |
| B6 | Sete schemas `backup_*` com cópia de dados da demonstração e das funções. Sem acesso de `anon`, `authenticated` nem `arandue_app` | Baixo | `backup_20261108_*`, `backup_20261110_telegram`, `backup_20261115_*` | Nenhuma: a rotina `demo.prune_backups(5)` roda todo dia às 05h UTC e deixa os 5 mais recentes |
| — | Nenhum segredo publicado no front, no bundle de produção ou no histórico do git | — (positivo) | — | Nada a trocar |

## Não verificado

- *Network Restrictions*, *Enforce SSL* e força das senhas no Supabase: não aparecem por SQL nem pelo MCP. Conferir no painel.
- `listen_addresses` e `pg_hba.conf` de produção: gerenciados pelo Supabase, sem acesso.
- Variáveis de ambiente cadastradas na Vercel: o MCP da Vercel responde 403 para o time `nabornasc`.

## Ordem sugerida para corrigir (um item por vez, com o seu OK)

1. **B3** (desligar o cadastro do Supabase Auth): um clique no painel, não afeta o app.
2. **B4** (tirar `public` da Data API e desativar as chaves legacy): painel, não afeta o app; testar o upload de anexo no CRM logo depois.
3. **B2** (*Enforce SSL* e troca das senhas): trocar a senha de `arandue_app` exige atualizar `DATABASE_URL` na Vercel e publicar de novo; o app fica fora do ar entre as duas coisas, por isso deve ser feito junto.
4. **B1** (RLS por empresa): projeto próprio, em etapas, com testes.
