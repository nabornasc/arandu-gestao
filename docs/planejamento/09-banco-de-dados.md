# 09 — Banco de dados: segurança, backup, custo, transações, schema e índices

Plano das sete frentes de revisão do banco pedidas em 15/11/2026. Cada frente tem o objetivo, o que já existe, o que será entregue, o que depende de decisão sua e o risco para o app no ar. Nenhuma frente roda nada em produção sem você: o MCP do Supabase recusa escrita, então o SQL de produção é entregue testado e você cola no SQL Editor.

## Ordem de execução

| Ordem | Frente | Por que nesta posição | Situação |
|-------|--------|------------------------|----------|
| 1 | [A. Exposição do banco](#a-exposição-do-banco) | Já auditada; os itens restantes são cliques no painel | Em andamento: B3 feito em 15/11/2026; B4 e B2 pendentes |
| 2 | [B. Backup que volta](#b-backup-que-volta) | Maior risco hoje: os backups atuais ficam **dentro do mesmo banco** e não protegem contra perda do projeto | Concluída em 15/11/2026: primeira execução em produção restaurou 43 tabelas com as contagens batendo |
| 3 | [C. Migrations e dev x produção](#c-migrations-e-dev-x-produção) | Base para D, E e F: confirma que o banco real é igual às migrations antes de criar outras | Feita no código; SQL de produção aguardando você |
| 4 | [D. Transações](#d-transações) | O app já usa transação na maior parte; fecha as lacunas e prepara o B1 (RLS por empresa), que precisa de uma transação por requisição | Concluída em 15/11/2026 |
| 5 | [E. Schema e constraints](#e-schema-e-constraints) | Depende de C (migrations confiáveis) | Feita no código; SQL de produção aguardando você |
| 6 | [F. Índices](#f-índices) | Depende de C; aproveita o levantamento de consultas de G | Feita no código; SQL de produção aguardando você |
| 7 | [G. Custo](#g-custo) | Menor risco: os planos atuais têm teto fixo | Concluída em 16/11/2026, sem mudança de código |

Cada frente termina em um commit próprio, com testes, e só vai para produção com o seu OK.

## Decisões tomadas (15/11/2026)

1. **Destino do backup:** artefato do GitHub Actions. Como o repositório é público e qualquer pessoa logada no GitHub baixa artefatos, a cópia sai criptografada com `gpg` (AES-256).
2. **Planos:** Supabase Free e Vercel Hobby.
3. **RLS por empresa (B1):** fazer, em etapas e com testes, depois da frente D.

## A. Exposição do banco

Relatório completo: [AUDITORIA-BANCO.md](../../AUDITORIA-BANCO.md). Nenhuma chave publicada; a chave pública não lê nenhuma tabela.

| Item | Ação | Derruba o app? |
|------|------|----------------|
| B3 | Desligar o cadastro do Supabase Auth (painel). **Feito em 15/11/2026** (`disable_signup: true` conferido pela API) | Não |
| B4 | Tirar `public` da Data API e desativar as chaves legacy (painel); testar upload de anexo no CRM depois | Não |
| B2 | Confirmar *Enforce SSL*; trocar as senhas de `postgres` e `arandue_app` junto com a `DATABASE_URL` da Vercel. Não ligar *Network Restrictions* sem IP fixo | Sim, se a senha mudar antes da variável |
| B1 | RLS por empresa, em 4 etapas. **Etapas 1 e 2 feitas em 16/11/2026:** empresa de cada consulta levada ao banco (`lib/tenant.ts`, `db/client.ts`) e testes rodando como `arandue_app` com o RLS de produção. Etapa 3 feita: migration `0045` com as policies por empresa, suíte (339) e e2e (90) passando como `arandue_app`. **Em produção desde 16/11/2026:** policies idênticas às testadas, as duas empresas da demo isoladas pela API e o backup diário funcionando | Sim, se feito fora de ordem |

## B. Backup que volta

**O que existe hoje.**
- O plano gratuito do Supabase não tem backup automático diário nem restauração para um ponto no tempo (a confirmar no painel, em Database > Backups, junto com o plano da decisão 2).
- Os schemas `backup_*` são cópias criadas antes de cada migração e ficam **no mesmo banco**: protegem contra uma migração errada, não contra perda, pausa prolongada ou exclusão do projeto. A rotina `demo.prune_backups(5)` mantém os 5 mais recentes.
- O schema `demo` guarda a cópia usada para restaurar a demonstração a cada 12 horas. Também fica no mesmo banco.

**Entregas.**
1. `scripts/backup.sh`: `pg_dump --format=custom` do banco de produção, compressão, envio para o destino escolhido e rotação (7 diárias e 4 semanais, a semanal sendo a de domingo). A connection string vem de variável de ambiente (`BACKUP_DATABASE_URL`), nunca do arquivo.
2. Workflow `.github/workflows/backup.yml`, diário, com a URL e as credenciais do destino em GitHub Secrets.
3. `scripts/testar-restauracao.sh`: baixa a cópia mais recente, restaura num Postgres descartável (container no próprio GitHub Actions ou local), confere se todas as tabelas existem e compara a contagem de linhas das principais (`companies`, `users`, `people`, `products`, `orders`, `receivables`, `audit_logs`) com produção. Roda logo depois do backup; se falhar, o workflow falha e o GitHub avisa por e-mail. Nunca restaura em produção: o script recusa URL de destino que não seja local.
4. `docs/guias/restauracao.md`: passo a passo do dia que der ruim, com tempo medido no teste e o que se perde (tudo desde o último backup, até 24 horas).

**Cuidado técnico.** As tabelas têm RLS ligado. O `pg_dump` desliga o RLS na sessão e falha com usuário que não pode ignorá-lo, como `arandue_app`. O backup precisa de um usuário próprio, só leitura e com `BYPASSRLS`, criado por você no SQL Editor (o comando vai pronto).

**Risco ao app:** nenhum. O dump só lê.

## C. Migrations e dev x produção

**O que existe hoje.** Drizzle Kit com 40 migrations em `backend/drizzle/`. Bancos separados no Docker local: `arandue` (dev), `arandue_test` e `arandue_e2e`, com travas que recusam apagar banco cujo nome não seja de teste. Produção recebe as migrations à mão, com registro em `drizzle.__drizzle_migrations`. O app em produção usa `arandue_app`, sem poder de alterar a estrutura (`scripts/supabase-seguranca.sql`).

**Entregas.**
1. Comparação do schema real de produção (via catálogo, só leitura) com o gerado pelas migrations: tabelas, colunas, tipos, defaults, índices, constraints, policies e funções. Lista do que foi criado à mão; a função `public.rls_auto_enable` já aparece como candidata.
2. Migration de alinhamento, se houver diferença, sem apagar nada que exista só em produção sem perguntar.
3. Revisão de `.env.example` e de `config.ts`: `DATABASE_URL` padrão sempre local; produção só na Vercel. Regra escrita no `CLAUDE.md` do projeto para o agente de IA usar só o banco local.
4. Os `GRANT`s atuais de `arandue_app` (hoje `SELECT, INSERT, UPDATE, DELETE` em todas as tabelas do `public`), com a lista do que o app realmente usa. Possível ajuste: tirar `UPDATE`/`DELETE` de tabelas só de inserção, como `audit_logs`.

**Risco ao app:** nenhum até a migration de alinhamento, que vai com o SQL testado.

**Resultado (15/11/2026).**
- Colunas, constraints, enums e índices de produção são idênticos aos gerados pelas 40 migrations; RLS e policies são idênticos ao `scripts/supabase-seguranca.sql`. Não há tabela, coluna ou índice criado à mão, e não foi preciso migration de alinhamento.
- Só em produção: o event trigger `ensure_rls` e a função `public.rls_auto_enable`, de uma opção do Supabase que liga o RLS em tabela nova. Mantidos e documentados em `docs/guias/deploy.md`.
- As migrations `0000` a `0009` foram registradas em produção com o hash do arquivo em CRLF (aplicadas de uma cópia do Windows). O schema é o mesmo; o SQL de produção corrige os 10 hashes.
- `arandue_app` passa a ter só as permissões que o código usa, tabela por tabela, no próprio `supabase-seguranca.sql`. Validado rodando a suíte inteira (314 testes) conectada como esse usuário, com RLS e policies iguais às de produção. O teste `appGrants.test.ts` falha se uma tabela nova ficar sem permissão.
- Regra para agentes de IA em `CLAUDE.md`: banco local por padrão; produção só por SQL entregue ao dono do projeto.

## D. Transações

**O que existe hoje.** 38 arquivos de `backend/src/services` usam transação. Venda, baixa, estorno, renegociação, conversão de orçamento, cadastro de empresa e ajuste de estoque já rodam numa transação só, com `FOR UPDATE` onde há disputa.

**Entregas.**
1. Lista de toda operação que grava em mais de uma tabela ou registro, com o que fica inconsistente se o servidor cair no meio. Candidatos já vistos: `confirmAction` do assistente (a ação e a marcação de "confirmada" são gravações separadas), `completeAttachment` do CRM (arquivo no Storage e linha no banco), a troca da reserva pelo custo real no assistente e a criação de sessão depois do cadastro.
2. Ajuste de cada lacuna para uma transação, sem mudar regra nem valor.
3. Teste por operação que força erro no meio e prova que nada foi gravado.
4. Chamadas externas (IA, Telegram, Storage) ficam fora da transação, com a explicação de onde cada uma entra e o que acontece se falhar.

**Risco ao app:** baixo; cada mudança vem com teste.

**Resultado (15/11/2026).** Venda, baixa, estorno, renegociação, cancelamento, conversão, compras, estoque, contas a pagar, cadastros e oportunidades já eram atômicos, e o front faz uma chamada por ação. Lacunas corrigidas: cadastro de empresa (sessão na mesma transação), login (auditoria e sessão juntas) e exclusão de anexo (banco antes do arquivo). A confirmação de ação do assistente continua em dois passos, porque juntar exigiria os serviços aceitarem `tx`; o estado intermediário não grava de novo e agora tem mensagem própria. `backend/src/tests/atomicity.test.ts` força erro no meio de 7 operações com um trigger temporário e prova que nada fica gravado.

## E. Schema e constraints

**O que existe hoje.** Nenhuma coluna `real`/`double precision` (dinheiro em `numeric(12,2)`) e nenhum `timestamp without time zone`. 95 foreign keys declaradas.

**Entregas.**
1. Inventário de tabelas, colunas e tipos, apontando texto que guarda número ou data e dado repetido (ex.: nome copiado em `audit_logs`, que é intencional e será justificado).
2. Colunas que referenciam outra tabela sem foreign key.
3. Constraints equivalentes às validações Zod de `packages/shared` (`NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY`), cada uma com a consulta que conta quantas linhas atuais quebram a regra, em dev e em produção (só leitura).
4. Uma migration por assunto, cada uma com o SQL de volta em comentário.

Nenhum dado é alterado para a constraint passar: linha que quebra a regra vira pergunta para você.

**Risco ao app:** médio. Constraint nova recusa gravação que hoje passa; cada uma é testada com a suíte e o e2e antes.

**Resultado (15/11/2026).** Tipos corretos (dinheiro em `numeric`, datas com fuso; documento, CEP e telefone como texto de propósito). Nenhuma coluna de referência sem foreign key que precise de uma (`audit_logs.entity_id` e `events.ref_id` são polimórficas; os IDs do Telegram são externos). Dado repetido só onde é intencional (`audit_logs.actor_name`, `quotes.mirror_snapshot`). Tabela `events` sem uso no código, mantida. A regra "parcela a partir de 1" ficou de fora: a renegociação grava posições negativas temporárias para renumerar sem bater no índice único. `demo.reset` passou a manter o mês da meta no dia 1. 58 regras contadas em dev e em produção, com zero violações; 56 viraram constraints `CHECK`, mais um índice único, em 4 migrations (`0040` a `0043`), cada uma com o SQL de volta em comentário. `constraints.test.ts` prova que o banco recusa gravação direta fora das regras e que o erro chega à tela como 400.

## F. Índices

**O que existe hoje.** Pela consulta no catálogo local, cerca de 34 das 95 foreign keys não têm índice que comece por elas (número aproximado, a confirmar coluna a coluna).

**Entregas.**
1. Lista de foreign keys sem índice, cruzada com as consultas que filtram ou juntam por elas.
2. Consultas com função na coluna do `WHERE` (`lower()`, `date()`, `cast`), `count` usado só para saber se existe, `OFFSET` alto e consulta dentro de loop. Já existem índices funcionais para `lower(email)` e para nomes únicos.
3. `EXPLAIN ANALYZE` das 5 consultas mais usadas num banco de dev com volume parecido com o de produção (gerado por script), mostrando onde aparece `Seq Scan` em tabela grande.
4. Migration só com os índices que uma consulta real usa, cada um com a consulta que acelera. Em produção, `CREATE INDEX CONCURRENTLY` fora de transação, avisado antes.

**Risco ao app:** baixo; `CONCURRENTLY` não trava escrita.

**Resultado (16/11/2026).** As 5 consultas mais executadas em produção (sessão, perfil, listas de pedidos e clientes, estoque baixo, pelo `pg_stat_statements`) já usam índice e ficam abaixo de 1,3 ms num banco de dev com 100 mil pedidos e 500 mil linhas de auditoria. `Seq Scan` em tabela grande só aparecia nas verificações de chave estrangeira e de "em uso" ao excluir pedido, produto, cliente ou transportadora, e no limite por minuto da IA: 8 índices na migração `0044`. Ficaram de fora as chaves para `users` (usuário nunca é excluído), a paginação por `OFFSET` (cursor mudaria a navegação por página), a consulta em laço da baixa em lote (trava os títulos em ordem) e as funções na coluna de relatórios raros e da busca de telefone (curinga no começo, que índice comum não resolve).

## G. Custo

**O que existe hoje.** Supabase cobra por plano e uso (banco, tráfego, armazenamento), não por leitura; não há listener em tempo real no app (Realtime não é usado). A Vercel cobra por invocação e tempo de função.

**Entregas.**
1. Confirmação dos planos (decisão 2).
2. Lista de consultas em loop, consultas sem limite de linhas e paginação por `OFFSET` (as listas usam `OFFSET` em `orders`, `quotes`, `expenses`, `transactions` e `history`), com a estimativa de leituras por usuário por dia e o efeito de 10 vezes mais usuários, mostrando a conta. Feita junto com a frente F para não levantar as consultas duas vezes.
3. A correção mais simples para cada uma (JOIN ou IN, limite, cursor), sem mudar regra de negócio.
4. Corte de gasto real: no Supabase Free os limites são fixos e o projeto é restringido ao estourar, sem cobrança extra; no Pro existe o *Spend Cap*, ligado por padrão. Na Vercel Hobby não há cobrança; no Pro, *Spend Management* pausa os projetos ao atingir o valor. Se o plano não tiver corte automático, a alternativa proposta é o teto já existente no app para a IA (`AI_PLATFORM_MONTHLY_BRL`) e um alerta com ação manual.

**Risco ao app:** nenhum no levantamento; as correções seguem o fluxo normal.

**Resultado (16/11/2026).** Supabase Free e Vercel Hobby não cobram por leitura: ao estourar um limite, o serviço é restringido, sem cobrança. O único custo por uso é a IA. Produção fez cerca de 1.360 consultas por dia (`pg_stat_statements`, desde 05/11), com banco de 20 MB e nenhuma pergunta à IA registrada. Itens avaliados e mantidos:
- leitura dos tipos do banco a cada conexão nova (35% do tempo de banco, mas cerca de 37 vezes por dia): desligar faria o driver devolver arrays como texto e quebraria as permissões (`array_agg`) e os dias das condições de pagamento (`int4[]`);
- lista de produtos sem limite: centenas de linhas por empresa; paginar se algum cliente passar de cerca de 2.000 produtos;
- listas com até 500 linhas quando chamadas sem página (média de 4,7 linhas em produção), paginação por `OFFSET`, consulta em laço da baixa em lote e atualização a cada 3 s do vínculo do Telegram: custo limitado;
- nenhuma assinatura em tempo real.

Estimativa com 10 vezes mais usuários (20): cerca de 1,1 GB por mês de tráfego (abaixo dos 5 GB do Free) e cerca de R$ 60 por mês de IA (R$ 0,002 a R$ 0,005 por pergunta, 20 perguntas por usuário por dia). Corte de gasto real: na IA, a cota por empresa e o teto da plataforma (`AI_PLATFORM_MONTHLY_BRL`) já recusam perguntas acima do limite; fora do app, o dono do projeto define o limite de gasto mensal no workspace da chave na Console da Anthropic. Se passar para Pro: Spend Cap ligado no Supabase e Spend Management com pausa na Vercel.
