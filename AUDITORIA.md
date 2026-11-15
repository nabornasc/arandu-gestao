# Auditoria técnica — Arandu Gestão (v2.5.0)

Data: 15/11/2026. Escopo: leitura do código em `main` (commit `0470ee9`), execução dos testes locais e consultas somente leitura (catálogo do Postgres e advisors) no Supabase de produção. Nenhum arquivo do projeto foi alterado, nenhuma migração rodou e nada foi instalado.

Contexto que muda a leitura deste relatório: o app é um ERP multiempresa (Fastify + Drizzle + Postgres no Supabase, front em Vite/React, deploy na Vercel). **Não existe gateway de pagamento, checkout nem assinatura.** O único webhook recebido é o do bot do Telegram. A API do Supabase (PostgREST) não é usada: o backend conecta direto no Postgres.

## Os 5 achados de maior risco

| # | Achado | Risco | Onde |
|---|--------|-------|------|
| 1 | Rate limit guardado em memória: na Vercel cada instância tem seu contador, então o limite de 10 tentativas/min no login (e 20/min no assistente) se multiplica pelo número de instâncias. Não há bloqueio por conta. | Alto | `backend/src/plugins/security.ts:15`, `backend/src/routes/auth.ts:6`, `backend/src/routes/index.ts:489` |
| 2 | Webhook do Telegram sem registro de `update_id`: se o Telegram reenviar um update (timeout de 30 s da função, erro 5xx), a pergunta vai de novo para a IA (custo em dobro) e o assistente pode propor a mesma ação duas vezes. | Médio | `backend/src/routes/index.ts:57-62`, `backend/src/services/telegram.ts:465-474` |
| 3 | Cota mensal de IA é "lê, decide, chama, grava" sem trava: requisições simultâneas passam todas pela checagem e estouram a cota da empresa e o teto da plataforma (`AI_PLATFORM_MONTHLY_BRL`). | Médio | `backend/src/services/assistant/index.ts:105-111` e `:140` |
| 4 | Contador de tentativas erradas do `/vincular` no Telegram é lido e depois gravado sem trava: updates em paralelo do mesmo chat passam do limite de 5. Um vínculo acertado dá ao atacante as permissões do usuário no ERP. | Médio | `backend/src/services/telegram.ts:157-187` |
| 5 | Isolamento entre empresas só na aplicação: as policies de RLS são `USING (true) WITH CHECK (true)` para o papel da aplicação. Hoje está correto (anon/authenticated sem acesso), mas um único `where` esquecido vaza dados de outra empresa sem nenhuma segunda barreira no banco. | Médio | `scripts/supabase-seguranca.sql:20-29` |

**Situação em 15/11/2026:** o achado 1 foi corrigido depois desta auditoria. Login e cadastro agora têm um contador no banco (`backend/src/services/rateLimit.ts`, migração `0038_limite_de_tentativas`), com teste em `backend/src/tests/rateLimit.test.ts`. Em produção desde o mesmo dia. O achado 2 também foi corrigido: o webhook reserva cada `update_id` na tabela `telegram_updates` (migração `0039_updates_do_telegram`) antes de tratar, com teste de reenvio simultâneo e sequencial em `backend/src/tests/telegram.test.ts`. Os achados 3 a 5 continuam abertos.

---

## 1. Testes de integração

**Ferramenta.** Vitest 5 (`backend/vitest.config.ts`) com testes que sobem o app Fastify real (`buildApp`) e fazem requisições com `app.inject` em `/api/...` (`backend/src/tests/helpers.ts:35-45`). Playwright 1.65 para e2e no navegador (`playwright.config.ts`). A CI roda lint, typecheck, Vitest, Playwright, build e `npm audit` (`.github/workflows/ci.yml`).

**Banco de teste separado.** Sim, três bancos distintos no Postgres local do Docker:
- `arandue` (desenvolvimento);
- `arandue_test`: o `globalSetup` apaga e recria o schema, e recusa rodar se a URL não contém `test` (`backend/src/tests/globalSetup.ts:9`);
- `arandue_e2e`: o setup recusa nome que não termina em `e2e` (`e2e/setup-db.ts:7`).

A produção (Supabase) não aparece em nenhum desses caminhos. O `backend/.env` local aponta `DATABASE_URL` e `TEST_DATABASE_URL` para `127.0.0.1`. Os testes zeram `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e as variáveis do Telegram.

**Comandos.** `npm run db:up` (sobe o Postgres) → `npm test` (integração) → `npm run test:e2e` (navegador).

**Resultado da execução (15/11/2026, máquina local):**
- `npm test`: **47 arquivos, 303 testes, 303 passaram, 0 falharam** (147 s).
- `npx playwright test --project=chromium`: **90 testes, 90 passaram, 0 falharam** (6,9 min). O projeto `manual` (roteiros que gravam mídia do manual) não foi executado.

Os testes gravam artefatos fora do Git (`.uploads-test/`, `.uploads-e2e/`, `test-results/`).

**Fluxos críticos:**

| Fluxo | Cobertura | Arquivo |
|-------|-----------|---------|
| Cadastro (empresa + dono) | Teste na rota real (`POST /api/auth/register`) | `backend/src/tests/auth.test.ts`, usado por todos os testes via `signupCompany` |
| Login / logout / sessão | Teste na rota real | `backend/src/tests/auth.test.ts` |
| Permissões e isolamento entre empresas | Teste na rota real | `rbac.test.ts`, `access.test.ts`, `isolation.test.ts` |
| Venda (pedido, estoque, contas a receber, baixa) — o "checkout" deste ERP | Teste na rota real, inclusive concorrência (3 pedidos simultâneos para a mesma unidade, `orders.test.ts:67`) e numeração simultânea (`company.test.ts:20`) | `orders.test.ts`, `receivables.test.ts`, `stock.test.ts` |
| Webhook do Telegram | Teste na rota real (`POST /api/telegram/webhook`), com segredo errado → 404. A API do Telegram é interceptada | `backend/src/tests/telegram.test.ts:37`, `:91` |
| Assistente de IA | Rota real com provedor `fake` (o modelo é simulado, o resto não) | `assistant.test.ts`, `assistantActions.test.ts` |
| Consulta de CNPJ (serviço externo) | Rota real com `fetch` mockado | `people.test.ts:170`, `:201` |
| Checkout com gateway / assinatura / webhook de pagamento | **Não existe no produto** | — |
| Reenvio do mesmo update do Telegram | **Sem teste** | — |
| Concorrência na cota de IA, na cota de anexos e no `/vincular` | **Sem teste** | — |
| Upload real para o Supabase Storage | **Sem teste** (testes usam disco local) | `backend/src/lib/storage.ts:56-80` |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| Nenhum teste reenvia o mesmo `update_id` ao webhook | Médio | `backend/src/tests/telegram.test.ts` | Teste que envia o mesmo update 2 vezes e espera uma só chamada à IA (junto com a correção do achado 2) |
| Nenhum teste de concorrência para cota de IA, cota de anexos e falhas do `/vincular` | Médio | `backend/src/tests/assistant.test.ts`, `crm.test.ts`, `telegram.test.ts` | `Promise.all` com N requisições, como já feito em `orders.test.ts:67` |
| Caminho do Supabase Storage (`SupabaseStorage`) nunca roda em teste | Baixo | `backend/src/lib/storage.ts:26-133` | Teste com `fetch` mockado verificando URL assinada, `HEAD` e tratamento de 404 |
| Base de testes de integração sólida: rota real, banco real e proteção contra apagar banco errado | — (positivo) | `backend/src/tests/globalSetup.ts:9`, `e2e/setup-db.ts:7` | Manter |

## 2. Confiança no cliente

**Regras só no front.** Não encontrei. Preço, total, desconto, parcelas, custo e margem são recalculados ou filtrados no servidor:
- total do pedido/orçamento: `backend/src/services/orders.ts:584-620` (preço do catálogo vem do banco quando o item não informa preço; total nunca negativo);
- custo só para quem tem `costs.read`, inclusive na gravação: `backend/src/services/products.ts:44-45`, `:71`, `:113`;
- margem interna: `authorize(ctx, 'costs.read')` em `backend/src/services/quotes.ts:319`;
- permissões: toda função de serviço exposta chama `authorize`, `authorizeAny` ou `can`; escopo "só os próprios registros" aplicado no `where` (ex.: `orders.ts:69-70`); escalada de grupo bloqueada em `accessGroups.ts:127-133`;
- validação de valores com Zod compartilhado (`packages/shared/src/schemas/index.ts`, ex.: desconto `nonnegative` na linha 547).

O vendedor pode digitar qualquer preço unitário e desconto (não há teto de desconto por grupo). Isso é regra de negócio ausente, não confiança no cliente.

**Chaves no front.** Só duas variáveis vão para o navegador:

| Variável | Classificação | Arquivo |
|----------|---------------|---------|
| `VITE_SENTRY_DSN` | Pública por design (DSN do Sentry só permite enviar eventos) | `frontend/src/lib/monitoring.ts:3` |
| `VITE_DEMO_MODE` | Flag, não é chave | `frontend/src/components/DemoNotice.tsx:1` |

`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` são lidas só no backend (`backend/src/config.ts`). Busca por `api_key|secret|token|service_role` em `frontend/src` não achou segredo. O upload de anexos usa URL assinada gerada pelo backend (`backend/src/lib/storage.ts:56-67`), então a chave do Supabase não vai ao navegador.

**Supabase (verificado em produção, somente leitura, em 15/11/2026).**
- As 41 tabelas do schema `public` têm RLS ligado.
- `anon` e `authenticated` não têm `SELECT` em nenhuma tabela.
- O advisor de segurança do Supabase não retornou alertas.
- O bucket `anexos` é privado, com limite de 50 MB e lista de tipos permitidos. Não há policies em `storage.objects`, então só a service role acessa.

Todas as tabelas têm a mesma policy, criada por `scripts/supabase-seguranca.sql:20-29`:

```sql
CREATE POLICY arandue_app_all ON public.<tabela> TO arandue_app USING (true) WITH CHECK (true)
```

Em português: "o usuário de banco `arandue_app` (o backend) pode ler, inserir, alterar e apagar qualquer linha desta tabela, de qualquer empresa". `USING (true)` libera a leitura de todas as linhas. `WITH CHECK (true)` aceita gravar qualquer valor. Nenhuma regra compara com `auth.uid()`, porque o app não usa o Supabase Auth. Para os papéis públicos (`anon`, `authenticated`), o efeito é "nada", porque o mesmo script revoga os privilégios deles (linhas 7-12) e nenhuma policy os menciona.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| Policies `USING (true)` para o papel da aplicação: o isolamento entre empresas depende só dos `where companyId` no código | Médio | `scripts/supabase-seguranca.sql:24-28` | Opcional e de custo alto: definir `SET LOCAL app.company_id` por transação e trocar a policy por `USING (company_id = current_setting('app.company_id')::int)`. Alternativa barata: manter e ampliar `isolation.test.ts` para cada rota nova |
| O script precisa ser rodado à mão depois de cada migração; uma tabela nova fica sem RLS até lá | Baixo | `scripts/supabase-seguranca.sql:1`, `docs/guias/deploy.md:37` | Incluir o bloco de RLS na própria migração ou rodar o script no fim de `db:migrate` em produção |
| Nenhuma regra de negócio crítica só no front; nenhum segredo no bundle | — (positivo) | ver acima | Manter |

## 3. Race condition

Pontos que leem, decidem e gravam sobre recurso limitado:

| Recurso | 2 requisições iguais ao mesmo tempo | Proteção no banco | Risco |
|---------|-------------------------------------|-------------------|-------|
| Estoque na venda | A segunda espera a trava da primeira e falha com "Estoque insuficiente" | `SELECT ... FOR UPDATE` em ordem de id (`orders.ts:88-93`), com teste de concorrência | OK |
| Ajuste e inventário de estoque | Serializadas | `FOR UPDATE` (`stock.ts:56-62`) | OK |
| Numeração de pedido/orçamento/compra | Números diferentes | `UPDATE ... RETURNING` atômico (`numbering.ts:19-23`) + índice único `(company_id, number)` (`schema.ts:536`, `:601`, `:740`) | OK |
| Conversão de orçamento em pedido | Uma converte, a outra cai no índice único | `uniqueIndex().on(t.quoteId)` (`schema.ts:600`) | OK |
| Baixa de contas a receber/pagar e adiantamentos | Serializadas | `FOR UPDATE` (`orders.ts:1121-1140`, `:1240-1248`; `expenses.ts:321`, `:407-408`; `advances.ts:96`) | OK |
| Confirmar ação do assistente (2 cliques) | Só uma grava | `UPDATE ... WHERE status='pending' RETURNING` (`assistant/actions.ts:408-422`) | OK |
| Cadastro com o mesmo e-mail | Uma cria; a outra recebe 409 "Registro duplicado" | Índice único `lower(email)` (`schema.ts:115`) | OK |
| **Cota mensal de IA** | As duas leem o gasto antes de qualquer gravação, as duas chamam a IA, as duas gravam. Com N paralelas, a cota estoura em até N × custo de uma pergunta | Nenhuma | Médio |
| **Cota de anexos da empresa (300 MB)** | As duas somam o uso, as duas passam e as duas inserem. Além disso, a soma usa o tamanho declarado pelo navegador; o tamanho real só é conferido contra o limite por arquivo, não contra a cota | Nenhuma | Baixo |
| **Tentativas do `/vincular`** | Contagem e inserção separadas: updates paralelos do mesmo chat passam do limite de 5 | Nenhuma | Médio |
| **Limite de 20 mensagens/min no bot** | Mesmo padrão: conta, decide, grava depois da resposta da IA | Nenhuma | Baixo |
| **Código de vínculo do Telegram** | Dois usuários podem receber o mesmo código (checa e grava sem índice único) | Só índice comum (`schema.ts:117`) | Baixo (1 em 1.000.000 por par) |

**Proteções em memória.**

| Achado | Risco | Arquivo e linha | O banco sozinho resolveria? |
|--------|-------|-----------------|-----------------------------|
| `@fastify/rate-limit` sem `store` externo: contador na memória de cada instância. Na Vercel (serverless), instâncias novas começam do zero, então o limite de login (10/min), do assistente (20/min) e o global (300/min) não valem para o conjunto | Alto | `backend/src/plugins/security.ts:15`, `backend/src/routes/auth.ts:6`, `backend/src/routes/index.ts:489` | Sim: tabela de tentativas por e-mail/IP com `INSERT` + `count` na mesma transação, ou o store Postgres/Upstash do plugin. Para login, somar bloqueio por conta após N falhas |
| Limpeza de anexos controlada por `lastCleanup` em memória | Baixo | `backend/src/services/crm.ts:40-46` | Não precisa: a limpeza é idempotente; no máximo roda mais vezes |
| `trustProxy: true` em produção: o IP do rate limit vem de `X-Forwarded-For` | Não verificado | `backend/src/app.ts:13` | Não verificado: depende de a Vercel sobrescrever o cabeçalho enviado pelo cliente. Confirmar na documentação/teste em produção antes de confiar no IP |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| Rate limit em memória no serverless | Alto | `backend/src/plugins/security.ts:15` | Store compartilhado (Postgres ou Redis) + bloqueio por conta no login |
| Cota de IA sem trava | Médio | `backend/src/services/assistant/index.ts:105-111` | `pg_advisory_xact_lock(company_id)` ou `SELECT ... FOR UPDATE` em `companies` ao reservar; gravar um custo estimado antes de chamar a IA e ajustar depois |
| `/vincular` sem trava no contador | Médio | `backend/src/services/telegram.ts:157-187` | Advisory lock por `chat_id` na checagem + inserção, ou contador com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` |
| Cota de anexos sem trava e com tamanho declarado | Baixo | `backend/src/services/crm.ts:73-81`, `:130-138` | Trava por empresa no `create`; recontar a cota no `completeAttachment` com o tamanho real |
| Código de vínculo sem unicidade no banco | Baixo | `backend/src/services/telegram.ts:115-133`, `backend/src/db/schema.ts:117` | Índice único parcial em `telegram_link_code` e tratar `23505` como nova tentativa |

## 4. Idempotência

**Webhooks recebidos.** Só o do Telegram (`POST /api/telegram/webhook`, `backend/src/routes/index.ts:57-62`).
- Assinatura: o Telegram não assina o corpo. O mecanismo dele é o cabeçalho `X-Telegram-Bot-Api-Secret-Token`, comparado em tempo constante (`telegram.ts:455-461`). Corpo bruto não se aplica.
- Registro de eventos processados: **não existe**. O `update_id` só é validado como número (`routes/index.ts:60`).
- Mesmo evento duas vezes: o handler responde 200 mesmo com erro interno (`telegram.ts:465-474`), o que reduz reenvios. Mas se a função passar de 30 s (IA lenta, anexo grande) ou cair, o Telegram reenvia. Efeitos: segunda chamada paga à IA, segunda resposta no chat e, se o assistente preparar uma ação, uma segunda ação pendente. Cada ação só grava com confirmação explícita, e o clique duplo no mesmo botão é seguro (`actions.ts:408-422`).

**Gateway de pagamento.** Não existe integração. Não há chamadas que precisem de idempotency key.

**Requisições do próprio app.** Criar pedido, orçamento, compra e baixa não aceitam chave de idempotência. O formulário desabilita o botão enquanto salva (`frontend/src/components/FormModal.tsx:188`), mas um reenvio da rede ou dois cliques em abas diferentes criam dois pedidos e baixam estoque duas vezes.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| Webhook do Telegram sem dedup por `update_id` | Médio | `backend/src/routes/index.ts:57-62` | Tabela `telegram_updates(update_id bigint primary key, received_at)`; `INSERT ... ON CONFLICT DO NOTHING RETURNING` antes de processar; se não retornar linha, responder 200 e sair. Limpar registros com mais de 1 dia |
| Ação confirmada fica em `confirming` para sempre se o processo cair entre `execute` e o `UPDATE` final (não grava duas vezes, mas trava a ação) | Baixo | `backend/src/services/assistant/actions.ts:439-457` | Executar a ação e marcar `confirmed` na mesma transação |
| Criação de pedido/orçamento sem idempotency key | Baixo | `backend/src/services/orders.ts:727` | Cabeçalho `Idempotency-Key` gerado ao abrir o formulário, gravado com índice único `(company_id, key)` |
| Gateway de pagamento | Não se aplica | — | — |

## 5. Separação de responsabilidades

Arquivos mais longos (sem CSS e JSON):

| Arquivo | Linhas | Mistura? |
|---------|--------|----------|
| `backend/src/services/orders.ts` | 1.426 | Sem tela, mas junta 5 domínios no mesmo arquivo: pedidos, estoque (`moveStock`), contas a receber, baixas/estornos e renegociação, além de adiantamentos e conta de caixa. 32 funções |
| `backend/src/db/schema.ts` | 1.009 | Só schema. Tamanho natural |
| `packages/shared/src/schemas/index.ts` | 944 | Só validação Zod. Poderia ser dividido por domínio, sem urgência |
| `frontend/src/pages/CustomerFilePage.tsx` | 761 | Tela + 5 chamadas de API + estado local. Regras de negócio ficam no backend |
| `backend/src/services/quotes.ts` | 729 | Serviço de domínio, com acesso a banco. Coeso |
| `frontend/src/pages/PersonDocumentPage.tsx` | 700 | Tela + 7 chamadas de API |
| `frontend/src/actions/registry.ts` | 657 | Tabela de ações. Coeso |
| `backend/src/services/opportunities.ts` | 610 | Coeso |
| `backend/src/routes/index.ts` | 558 | Só roteamento. Delega aos serviços |

O padrão geral é bom: rotas finas, regras e banco nos serviços, front sem cálculo de negócio (as páginas chamam a API por `frontend/src/lib/*`).

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| **Candidato nº 1 para refatorar:** `orders.ts` concentra pedidos, contas a receber, baixas, estornos, renegociação e estoque. Qualquer mudança em recebíveis mexe no arquivo de pedidos | Médio | `backend/src/services/orders.ts:135-420` (recebíveis/baixas), `:942-1300` (listagem, baixa, estorno), `:1329-1409` (renegociação), `:74-116` (estoque) | Extrair `receivables.ts` (listagem, baixa, estorno, renegociação) e mover `moveStock` para `stock.ts`, sem mudar comportamento. `receivables.test.ts` e `orders.test.ts` cobrem a troca |
| Páginas de 700+ linhas no front misturam tela e orquestração de várias chamadas | Baixo | `frontend/src/pages/CustomerFilePage.tsx`, `frontend/src/pages/PersonDocumentPage.tsx` | Extrair hooks de dados (`useCustomerFile`) e subcomponentes por aba |

---

## Qual correção rodar primeiro

Corrija primeiro o **rate limit em memória** (achado 1). É o único de risco alto e o único que protege a entrada do sistema. Na Vercel, o limite de 10 tentativas por minuto no login vale por instância, não para o conjunto. Assim, a força bruta de senha fica mais barata do que o código promete, e não há bloqueio por conta para compensar. As outras falhas pedem um usuário já logado (cota de IA, anexos) ou têm efeito limitado e reversível (reenvio do Telegram).

A correção também é pequena e não exige migração arriscada: um store compartilhado para o `@fastify/rate-limit` mais um contador de falhas por e-mail no Postgres. Ela já prepara o terreno para os achados 3 e 4, que usam a mesma ideia de contador atômico no banco.

Ordem sugerida em seguida: 2 (dedup do webhook, uma tabela e um `ON CONFLICT`), 4 (trava no `/vincular`), 3 (cota de IA), 5 (RLS por empresa, o mais caro).
