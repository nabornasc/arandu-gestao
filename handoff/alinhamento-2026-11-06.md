# Alinhamento: situação em 06/11/2026

Para o Claude Code do notebook Arch Linux. Enviado pelo Claude Code do Windows 11, a pedido do dono do projeto. Fale com o usuário em português.

Este arquivo está na branch `handoff/resposta-arch`, que serve para conversar entre as duas máquinas. Ela está atrás da `main`: o código atual vem da `main`.

## 1. Atualizar o notebook

A `main` está em `dfa48e0`. Rode na raiz do repositório, com `backend/.env` apontando só para `127.0.0.1` ou `localhost`:

```bash
git status -sb
git switch main
git pull --ff-only
npm install
npm run db:migrate
```

Se `git status` mostrar alterações sem commit, pare e pergunte ao usuário.

## 2. O que foi publicado hoje

| Entrega | Commit | PR |
|---|---|---|
| Filtros, totais e impressão nas listas | `04580d0`, `b3905e2` | #10 |
| Contas a receber por parcela e fornecedor na despesa | `cc999cc` | #11 |
| Baixa parcial e em lote, juros, desconto e estorno | `4e556b3` | #12 |
| Ficha do cliente ligada ao CRM e correção de `/history?module=` | `dfa48e0` | #13 |

Regras novas que valem para quem mexer nesse código:

- **Estorno:** estornar uma baixa exige a permissão `receivables.reverse`, a senha de login e o motivo. Cancelar, excluir ou voltar para pendente um pedido com baixa exige o mesmo, pela rota `POST /orders/:id/undo-payments`.
- **Faturamento:** segue a data do pedido e só conta pedido quitado. Juros e desconto da baixa ajustam o valor.
- **Total do pedido:** não muda se houver baixa parcial, juros ou desconto. É preciso estornar antes.
- **Ficha do cliente:** todo atendimento fica em uma oportunidade do CRM. Cada aba respeita a permissão e o escopo da sua área.

## 3. O que falta no planejamento

**A ordem de trabalho agora está em `PLANEJAMENTO_ETAPAS.md`**, fonte única para as duas estações. Nada tem data, e cada etapa só começa com pedido do usuário.

| Etapa | Conteúdo |
|---|---|
| 1 (concluída, v2.5.0) | Fechar o `[Não lançado]` em uma versão e resolver pendências pequenas |
| 2 (concluída, em produção) | Estoque: mínimo com aviso, ajuste com motivo e unidade no produto |
| 3 (concluída, em produção) | Listas configuráveis e grupo do produto |
| 4 (concluída, em produção) | Central de relatórios com exportação em CSV |
| 5 (concluída, em produção) | Agenda |
| 6 (próxima) | Navegação: menu por módulos, cadastro rápido, paginação, busca e atalhos |
| 7 | Restante dos documentos |
| 8 | Gestão: precificação, dashboard modular e metas |
| 9 | Operações opcionais, só se ainda houver interesse |
| 10 | Assistente de IA |

As decisões pendentes e a correspondência com os rótulos antigos de versão estão no mesmo arquivo.

**Situação da publicação:** `PLANEJAMENTO_ETAPAS.md` está na `main` desde 07/11/2026, junto com a correção do teste que falhava à noite. Veja `handoff/resposta-arch.md`.

## 4. Como trabalhamos

**Escopo.** O projeto é só para estudo e demonstração. Não será vendido.

**Segurança**

- Senhas e segredos não passam pela conversa nem entram no repositório, que é público.
- Nunca grave a URI de produção em `backend/.env`: com ela, `npm run db:seed` apaga a demonstração.
- Prints e PDFs de ERP têm dados reais. Não versione esses arquivos e não use os dados deles em código, testes, dados de exemplo ou documentação. Aproveite só a estrutura das telas.

**Código**

- Fluxo: branch, PR, CI verde, `git merge --ff-only` na `main` e push.
- Commits são assinados. Não use `--no-gpg-sign` nem `--no-verify`.
- Commit, push e publicação só com pedido do usuário.
- Antes de publicar, rode `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build` e `npm audit --omit=dev`.
- Trabalhe junto com o GitHub Copilot: peça uma revisão do diff, avalie cada achado e relate os que recusou, com o motivo.

**Migrações em produção**

- Tabela nova precisa de `GRANT` para `arandue_app`, `REVOKE` de `anon` e `authenticated`, RLS, a policy `arandue_app_all` e inclusão em `demo.table_list()` e `scripts/supabase-demo.sql`.
- **Acesso do Claude à produção (liberado pelo usuário em 07/11/2026):** o Claude das duas estações aplica migrações e roda SQL no Supabase pelo MCP, sem pedir confirmação a cada passo. O servidor MCP `supabase` fica restrito ao projeto (`?project_ref=whaunqisvvhubzmesudw`), e `~/.claude/settings.json` libera `execute_sql`, `apply_migration`, `list_migrations`, `list_tables` e `get_advisors`.
- **Única ressalva: mudança crítica exige backup manual antes.** É crítica a mudança que remove ou reescreve dados ou estrutura: `DROP`, `TRUNCATE`, `DELETE` ou `UPDATE` em massa, `ALTER` que remove coluna ou muda tipo, `demo.reset()` e `demo.capture()`. Antes dela, copie as tabelas afetadas para um schema `backup_AAAAMMDD_HHMM` com `CREATE TABLE backup_….tabela AS TABLE public.tabela`, sem acesso externo (`REVOKE ALL ON SCHEMA … FROM PUBLIC`). Registre o schema na resposta do handoff e apague-o depois de conferir o resultado.
- **Limite conhecido:** o próprio Supabase pede confirmação para comandos destrutivos, e uma sessão sem tela de confirmação recebe `declined`. Nesse caso, não contorne: rode numa sessão interativa, que mostra a pergunta, ou entregue o SQL para o usuário colar no SQL Editor.
- Migração com remoção de dados ou de coluna continua em um arquivo `.sql`, testado antes em banco temporário.
- Aplicar a migração do repositório pelo MCP: rode o `.sql` dentro de uma transação e registre a linha em `drizzle.__drizzle_migrations`, com o `sha256` do arquivo e o `when` do `_journal.json`. Assim o `migrate.ts` não tenta aplicá-la de novo.
- Depois de testar em produção, restaure a demonstração com `demo.reset()`. Se os dados de exemplo mudarem, rode também `demo.capture()`.

## 5. Resposta

Depois de atualizar, confirme ao usuário o resultado de cada comando da seção 1. Se ele pedir uma resposta para o Windows, registre em `handoff/resposta-arch.md`, nesta branch, sem senha, token, conteúdo do `.env` ou dado real de cliente.
