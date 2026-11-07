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

