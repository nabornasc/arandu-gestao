# Resposta do notebook Arch Linux

Data: 2026-11-06
Commit testado: 4ec4ab5

| Passo | Resultado | Observação |
|---|---|---|
| Ferramentas | OK | Node v24.21.0, npm 11.19.0, git 2.56.0, Docker 29.9.2, Compose 5.7.0; Docker ativo e usuário no grupo `docker` |
| Código | OK | Sem alterações locais; `git pull --ff-only` já estava atualizado; `npm install` concluído |
| Configuração | OK | `backend/.env` já existia; host do banco: `127.0.0.1` |
| Banco | OK | Porta 5432 ocupada pelo próprio `arandue-postgres`, sem parar nenhum serviço; migrações aplicadas |
| Dados | Feito | Usuário confirmou. Havia `Doces da Vila` e `Ateliê Aranduê`, com 8 pedidos, 3 orçamentos e 1 oportunidade. Backup local com `pg_dump` antes do seed (dump válido, com 23 tabelas de dados); agora há `Conveniência da Esquina` e `Doces da Vila`, com 12 pedidos |
| API e login | OK | `{"status":"ok"}`; login `200`; interface `200` |
| Tela, conferida pelo usuário | OK | Usuário abriu <http://localhost:5173>, entrou com `dono@conveniencia.test` e viu os dados da Conveniência da Esquina |
| Lint | OK | Sem erros; 1 aviso e 1 info |
| Testes | OK | 118 de 118 passaram, em 17 arquivos |

## Problemas

Nenhum.

Nenhuma decisão pendente na passagem inicial. O backup do banco local anterior ao seed fica só na pasta temporária do notebook e não vai para o Git.

## Atualização de 06/11/2026

Notebook atualizado com a seção 1 do alinhamento:

| Comando | Resultado |
|---|---|
| `git switch main` e `git pull --ff-only` | OK, em `dfa48e0` |
| `npm install` | OK |
| `npm run db:migrate` | OK, 16 de 16 migrações no banco local (`127.0.0.1`) |
| `npm run typecheck` | Sem erros |

Os planos guardados foram organizados em `PLANEJAMENTO_ETAPAS.md` (PR #14).

## Problemas

**Teste que falha à noite, sem relação com o PR #14:** `backend/src/tests/customerFile.test.ts:124`, com `AssertionError: expected 4 to be 5`. Reproduzido localmente às 01:23 UTC, com `TZ=UTC` e sem ele. O `dayOffset` do teste usa a data em UTC, e o servidor usa `todayInBrazil()`, então a falha ocorre das 21h à meia-noite de Brasília. O código de produção não foi alterado. A correção está na etapa 1, aguardando decisão do usuário.

**Revisão do Copilot no PR #14:** não rodou. Mensagem: `Copilot was unable to review this pull request because the user who requested the review has insufficient remaining quota.`

## Decisões pendentes do usuário

Nenhuma.

## Atualização de 07/11/2026

- **Teste corrigido** (PR #15): `today()` em `backend/src/tests/helpers.ts` passa a ser `todayInBrazil()`, a mesma data do servidor. Com o relógio simulado em 22h30 de Brasília, antes falhava 1 teste e depois passaram 175 de 175.
- **PRs #14 e #15 na `main`** com `--ff-only`, depois do CI verde nos dois. `PLANEJAMENTO_ETAPAS.md` já está na `main`.
- **Copilot:** não revisou os PRs por falta de cota.
- **Para o Windows:** `git switch main` e `git pull --ff-only`. Não há migração nova.

## Atualização de 07/11/2026, noite

**Etapa 1 concluída: v2.5.0** (PR #17, tag `v2.5.0`).

- Rótulo de permissão por área: "Cancelar" em orçamentos e "Cancelar ou reativar" em pedidos.
- Biome ignora `.vercel`.
- Dependências atualizadas dentro da versão principal. Sentry 11 e `postgres` 4 ficaram de fora.
- Teste e2e da ficha do cliente estabilizado.
- Lighthouse nos espelhos: 100 em acessibilidade.
- Portfólio com o login novo e 11 capturas novas (commit `dc01a36` no repositório do portfólio).

**Etapa 2, estoque: pronta no PR #18 (`feat/estoque`), sem merge.** A `main` faz deploy na Vercel, e o código novo lê `products.unit`, `products.min_stock` e `stock_movements`. A migração `0016_estoque.sql` só acrescenta colunas e uma tabela, então o código atual continua funcionando depois dela.

## Para o Windows: produção antes do merge do PR #18

Faça nesta ordem, no Windows, com a branch `feat/estoque`:

1. **SQL Editor do Supabase:** `SELECT demo.reset();`. Volta a demonstração aos dados padrão, antes de mudar a lista de tabelas.
2. **Migração, pelo Prompt de Comando:** `git fetch origin`, depois `git switch feat/estoque`, e então:
   ```bat
   set DATABASE_URL=<conexão do postgres>?sslmode=require
   node backend/src/db/migrate.ts
   set DATABASE_URL=
   ```
3. **SQL Editor:** rode `scripts/supabase-seguranca.sql`. Ele dá o `GRANT`, a RLS e a policy para `stock_movements`.
4. **SQL Editor:** rode `scripts/supabase-demo.sql` desta branch, que inclui `stock_movements` em `demo.table_list()`.
5. **SQL Editor, opcional:** estoque mínimo nos dados de exemplo, igual ao seed:
   ```sql
   UPDATE products SET min_stock = v.min FROM (VALUES
     ('Cerveja Pilsen lata 350 ml', 60), ('Cerveja Puro Malte lata 350 ml', 24),
     ('Água com gás 500 ml', 12), ('Vodka 1 L', 4), ('Gelo 5 kg', 15), ('Carvão 3 kg', 5)
   ) AS v(name, min) WHERE products.name = v.name AND products.company_id = 1;
   ```
6. **SQL Editor:** `SELECT demo.capture();`, para a restauração das 00h e das 12h levar a tabela nova.
7. Peça a qualquer uma das estações para mesclar o PR #18 com `--ff-only`, depois do CI verde.

Se a restauração agendada rodar entre os passos 4 e 6, ela falha sem mudar nada, porque roda em uma transação.

No banco local do Windows, basta `npm run db:migrate`. `npm run db:seed` traz os novos exemplos, mas apaga os dados locais.

## Atualização de 07/11/2026, fim do dia

- **Etapa 2 em produção:** a migração `0016_estoque` foi aplicada pelo Claude do notebook via MCP, com registro em `drizzle.__drizzle_migrations`. O usuário rodou no SQL Editor a segurança, a lista da demonstração, o estoque mínimo e o `demo.capture()`. PR #18 mesclado (`6f8c766`), deploy no ar e conferido.
- **Novo padrão de acesso ao Supabase:** está na seção 4 do alinhamento. No Windows, aplique a mesma configuração:
  ```bat
  claude mcp remove supabase -s user
  claude mcp add -s user --transport http supabase "https://mcp.supabase.com/mcp?project_ref=whaunqisvvhubzmesudw"
  ```
  Depois, faça o login com `/mcp` e copie para `~/.claude/settings.json` a lista `permissions.allow` do notebook: `mcp__supabase__*` e `mcp__claude_ai_Supabase__*` para `execute_sql`, `apply_migration`, `list_migrations`, `list_tables` e `get_advisors`.
- **Teste do acesso:** a escrita comum passou. `DELETE` e `DROP` vieram como `declined`, porque a confirmação de comando destrutivo é do Supabase e não aparece nesta sessão.

## Atualização de 08/11/2026, madrugada

**Etapa 3, listas configuráveis: concluída e em produção** (PR #20, `d7e2a4a`).

- **Listas da empresa:** `company_list_items`, em Configurações > Listas. Os formulários sugerem os valores e aceitam digitar outro, por decisão do usuário. Desativar tira o valor das sugestões.
- **Grupo do produto:** `products.group_name`, com o resumo do espelho interno por grupo.
- **Produção, aplicada pelo Claude do notebook via MCP:**
  - migração `0017_listas`, registrada em `drizzle.__drizzle_migrations`;
  - `GRANT`, RLS e policy para `arandue_app` na tabela nova;
  - `demo.table_list()` atualizada e grupos de produto nos dados de exemplo;
  - `demo.capture()`. Os avisos de segurança do Supabase vieram sem nenhum item.
- **Backup antes da captura:** schema `backup_20261108_demo`, com as 25 tabelas da cópia anterior da demonstração, sem acesso externo. A demonstração foi conferida no ar. Pode apagar com `DROP SCHEMA backup_20261108_demo CASCADE;` no SQL Editor, porque o MCP recusa `DROP` nesta sessão.
- **Pendência técnica encontrada:** o tratador global de erros não reconhece a violação de unicidade quando o Drizzle embrulha o erro, e responde 500 em vez de 409. As listas já tratam isso. Registrado em `PLANEJAMENTO_ETAPAS.md`.
- **Próxima:** etapa 4, relatórios.
- **No Windows:** `git pull --ff-only` e `npm run db:migrate`.

## Atualização de 08/11/2026, etapa 4

**Etapa 4, relatórios: concluída e em produção** (PR #21, `97d0e15`).

- **Relatórios:** 17 relatórios de vendas, financeiro, estoque e gestão, em `/relatorios`, calculados no servidor. Cada grupo vê só os relatórios dos módulos que pode ver; custo e margem exigem `costs.read`.
- **Exportação em CSV:** pela permissão própria `reports.export`, por decisão do usuário. O arquivo é para o Excel em português, neutraliza fórmulas e entra no histórico.
- **Produção, aplicada pelo Claude do notebook via MCP:**
  - migração `0018_relatorios`, só com permissões, registrada no Drizzle;
  - backup `backup_20261108_demo_relatorios` (26 tabelas) e `demo.capture()`.
  - Conferido no ar: 17 relatórios e CSV respondendo.
- **Backups para apagar no SQL Editor**, porque o MCP recusa `DROP` nesta sessão:
  ```sql
  DROP SCHEMA backup_20261108_demo CASCADE;
  DROP SCHEMA backup_20261108_demo_relatorios CASCADE;
  ```
- **Próxima:** etapa 5, agenda.

## Atualização de 08/11/2026, etapa 5

**Etapa 5, agenda: concluída e em produção** (PR #22, `16c7c6c`).

- **Agenda:** `/agenda` nas visões dia, semana, mês e lista. Junta as tarefas manuais (`agenda_events`), as próximas ações do CRM, a validade de orçamentos enviados ou aprovados, as contas a receber em aberto e as despesas pendentes. Cada fonte exige a leitura do seu módulo e respeita "só os próprios".
- **Seed:** as datas seguem o fuso de Brasília, como o servidor e os testes.
- **Produção, aplicada pelo Claude do notebook via MCP:**
  - migração `0019_agenda`, registrada no Drizzle;
  - `GRANT`, RLS e policy na tabela nova;
  - `demo.table_list()` atualizada e 4 tarefas de exemplo;
  - backup `backup_20261108_demo_agenda` e `demo.capture()`.
  - Avisos de segurança do Supabase sem itens; agenda conferida no ar.
- **Backups para apagar no SQL Editor:**
  ```sql
  DROP SCHEMA backup_20261108_demo CASCADE;
  DROP SCHEMA backup_20261108_demo_relatorios CASCADE;
  DROP SCHEMA backup_20261108_demo_agenda CASCADE;
  ```
- **Próxima:** etapa 6, navegação.


## Atualização de 08/11/2026, etapa 6 (partes 1 e 2)

**Etapa 6, navegação: concluída.** Dividida em quatro partes.

1. **Menu por módulos e páginas de módulo:** concluída (PR #23, `eb05ef7`). Menu em Início, Vendas, Financeiro, Cadastros, Gestão e Administração; cada módulo tem página de entrada com atalhos de criação conforme a permissão. Menu fixo no desktop.
2. **Busca rápida e atalhos:** concluída (PR #26, `b4a28a8`).
   - Ctrl+K, F2 ou botão Buscar: telas, ações, clientes, fornecedores, produtos, orçamentos, pedidos e oportunidades (rota `GET /search`, aceita `#12`).
   - F4 novo orçamento, F6 novo pedido, F7 novo cliente, F8 produtos, F9 ou Ctrl+Enter salva, Alt+setas trocam de aba, Alt+X fecha a aba.
   - Correção: o `Modal` foca o campo com `data-autofocus` depois do `showModal()`.
   - Personalização dos atalhos por usuário fica para depois.
3. **Cadastro rápido:** concluída (PR #27, `d266cae`). "Novo cliente" e "Novo produto" dentro do orçamento e do pedido, já selecionando o item criado. Correção junto: o `Modal` para o `submit` na própria janela, porque salvar a janela salvava também o pedido de trás.
4. **Paginação e filtros no servidor:** concluída (PR #30, `121d8c4`). Orçamentos, pedidos, contas a receber, contas a pagar e movimentações paginam (25/50/100) e somam os totais no servidor. A API aceita `page`, `pageSize`, `from`, `to`, `status` e `q`; sem `page`, mantém a lista simples. "Imprimir lista" virou "Imprimir página".

**Etapa 6 concluída.** Também entrou a correção do menu no celular, que não rolava (PR #29, `daf8643`).

**Manuais de uso:** planejados em `PLANEJAMENTO_MANUAIS.md` (PR #28, `2856047`). Central `/ajuda`, botão "?" por tela, artigos em Markdown e vídeos curtos gerados por roteiros Playwright. Quatro decisões em aberto na seção 9, aguardando o usuário.

- **Produção:** partes 1 a 4 sem migração; a Vercel publica a partir da `main`.
- **No Windows:** `git pull --ff-only`. Nada a migrar.

## Atualização de 08/11/2026, etapa 7 (parte 1) e decisões dos manuais

**Manuais:** decisões registradas em `PLANEJAMENTO_MANUAIS.md` (PR #31). Entram depois da etapa 7, mídia no repositório, Markdown convertido para HTML no build e vídeo sem som com legenda gravada.

**Etapa 7, documentos: concluída**, em quatro partes.

1. **Ajustes do documento:** concluída e em produção (PR #32, `aebca15`).
   - Validade em dias ligada à data; desconto em R$ ou % (orçamento e pedido); duplicar grupo; ocultar item no espelho do cliente.
   - Migração `0020_espelho_item_oculto` (`quote_items.hidden_in_mirror`).
2. **Condições de pagamento:** concluída e em produção (PR #33, `531684b`).
   - Tabela `payment_conditions` (migração `0021`, com cinco condições padrão por empresa), cadastro em Configurações e escolha nas parcelas do orçamento e do pedido.
   - Produção via MCP antes do merge: migração registrada, `GRANT`, RLS e policy `arandue_app_all`, `demo.table_list()` com a tabela nova, backup `backup_20261108_demo_condicoes` e `demo.capture()`. Avisos de segurança sem itens; `/payment-conditions` conferido no ar.
3. Em duas entregas:
   - **3a. Biblioteca do orçamento:** concluída e em produção (PR #34, `8ea7646`). Cláusulas por orçamento (`quotes.clauses`), textos prontos (`text_snippets`) e modelos de grupo (`item_templates`). Migração `0022`; produção via MCP antes do merge, com `GRANT`, RLS, policy, `demo.table_list()`, backup `backup_20261108_demo_biblioteca` e `demo.capture()`. Avisos de segurança sem itens.
   - **3b. Item avulso e metro linear:** concluída e em produção (PR #35, `3bedd0c`). Item sem produto (descrição e preço livres, sem estoque) no orçamento e no pedido; metro linear; unidade do cadastro no espelho. Migração `0023` (`product_id` opcional, `description`, `CHECK` produto ou descrição); produção via MCP antes do merge, com backup `backup_20261108_demo_avulso` e `demo.capture()`. Avisos de segurança sem itens.
4. **Exportação em DOCX:** concluída e em produção (PR #36, `8a69cd6`). "Baixar em Word (DOCX)" no menu do orçamento; gerado no servidor sem dependência nova (`lib/zip.ts`). Sem migração. Conferido no ar: o arquivo da demo abre no LibreOffice.

**Etapa 7 concluída.** Os manuais foram adiados pelo usuário; a etapa 8 veio antes.

## Atualização de 08/11/2026, etapa 8 (parte 1)

**Etapa 8, gestão: concluída**, em três partes.

1. **Assistente de precificação:** concluída e em produção (PR #37, `d146cbb`). Tela `/precificacao` (exige `costs.read`), markup divisor com rateio das despesas fixas, ponto de equilíbrio e "Aplicar" ao produto. Base do servidor em `GET /pricing/base`. Sem migração; conferido no ar.
2. **Dashboard modular:** concluída e em produção (PR #38, `5232847`). 15 blocos com permissão e tamanhos, "Personalizar" por usuário (`user_preferences`, migração `0024`), dados novos no `/dashboard`. Produção via MCP antes do merge: `GRANT`, RLS, policy, `demo.table_list()` com `user_preferences`, backup `backup_20261108_demo_dashboard` e `demo.capture()`. Avisos de segurança sem itens.
3. **Metas de venda:** concluída e em produção (PR #39, `b1f9497`). Tabela `sales_goals` (migração `0025`), tela `/metas` com projeção e bloco "Metas do mês". Produção via MCP antes do merge, com backup `backup_20261108_demo_metas` e `demo.capture()`. Avisos de segurança sem itens.

**Etapa 8 concluída.** Próximas opções: etapa 9 (operações opcionais, só se ainda houver interesse), etapa 10 (assistente de IA) ou os manuais adiados.

- **Produção, aplicada pelo Claude do notebook via MCP, antes do merge:**
  - migração `0020` registrada no Drizzle;
  - backup `backup_20261108_demo_item_oculto` (27 tabelas da cópia da demonstração) e `demo.capture()`, porque `demo.reset()` copia as colunas por posição;
  - avisos de segurança do Supabase sem itens; espelho e paginação conferidos no ar.
- **Backups para apagar no SQL Editor:**
  ```sql
  DROP SCHEMA backup_20261108_demo CASCADE;
  DROP SCHEMA backup_20261108_demo_relatorios CASCADE;
  DROP SCHEMA backup_20261108_demo_agenda CASCADE;
  DROP SCHEMA backup_20261108_demo_item_oculto CASCADE;
  DROP SCHEMA backup_20261108_demo_condicoes CASCADE;
  DROP SCHEMA backup_20261108_demo_biblioteca CASCADE;
  DROP SCHEMA backup_20261108_demo_avulso CASCADE;
  DROP SCHEMA backup_20261108_demo_dashboard CASCADE;
  DROP SCHEMA backup_20261108_demo_metas CASCADE;
  ```
- **No Windows:** `git pull --ff-only` e `npm run db:migrate`.
