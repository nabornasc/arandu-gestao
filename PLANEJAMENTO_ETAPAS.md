# Planejamento: sequência em etapas

Organizado em 06/11/2026. **Este arquivo é a fonte única da ordem de trabalho das duas estações.** Os outros planos continuam guardando os detalhes de cada assunto.

Nada aqui tem data. Uma etapa só começa com pedido do dono do projeto, e a ordem pode mudar a cada ciclo. O projeto é só para estudo e demonstração: o critério é o que ensina e cabe no MEI.

## Visão geral

| Etapa | Conteúdo | Situação | Detalhes em |
|---|---|---|---|
| 1 | Fechar o que já está na `main` e resolver pendências pequenas | **Concluída em 07/11, v2.5.0** | Este arquivo |
| 2 | Estoque: mínimo com aviso, ajuste com motivo e unidade no produto | **Concluída em 07/11, em produção** | [Operações](PLANEJAMENTO_OPERACOES.md), seções 7 e 9 |
| 3 | Listas configuráveis e grupo do produto | **Concluída em 07/11** | [Listas](PLANEJAMENTO_LISTAS.md) |
| 4 | Central de relatórios com exportação em CSV | **Concluída em 08/11** | [Relatórios](PLANEJAMENTO_RELATORIOS.md) |
| 5 | Agenda: dia, semana, mês e lista | **Concluída em 08/11** | [Operações](PLANEJAMENTO_OPERACOES.md), seção 9 |
| 6 | Navegação: menu por módulos, cadastro rápido, paginação, busca e atalhos | **Concluída em 08/11** | [Plano da v2](PLANEJAMENTO_V2.md), seção 7 |
| 7 | Restante dos documentos | **Concluída em 08/11** | [Plano da v2](PLANEJAMENTO_V2.md), seção 11 |
| 8 | Gestão: precificação, dashboard modular e metas | **Concluída em 08/11** | [Plano da v2](PLANEJAMENTO_V2.md), seções 7.8 e 11 |
| 9 | Operações opcionais: compras, entrega, baixa em contas a pagar e renegociação | **Concluída em 08/11** | [Operações](PLANEJAMENTO_OPERACOES.md), seções 4, 9 e 10 |
| 10 | Assistente de IA: chat de ajuda e bot do Telegram | Planejada | [Plano da v2](PLANEJAMENTO_V2.md), seção 10 |

**Manuais de uso**, com texto e vídeos curtos gerados por roteiro: planejados em [PLANEJAMENTO_MANUAIS.md](PLANEJAMENTO_MANUAIS.md). Ordem decidida pelo usuário em 08/11/2026: etapa 9 inteira, depois os manuais e, por último, a etapa 10 (IA e bot).

## Por que esta ordem

- **Estoque antes de relatórios:** o ajuste com motivo cria o registro de movimentos, que os relatórios de extrato e de movimentação de estoque precisam.
- **Listas antes de relatórios:** filtros por categoria e forma de pagamento dependem de dados padronizados.
- **Grupo do produto com as listas:** sem elas, o grupo seria mais um campo de texto livre. Por isso sai da etapa do estoque.
- **Agenda depois dos títulos:** contas a receber por parcela já existem, então a agenda nasce com conteúdo.
- **Navegação depois das telas novas:** relatórios e agenda aumentam o menu, e a reorganização passa a considerar a estrutura completa.

## Etapas

### Etapa 1: fechar o que já está na `main`

- Feito: o `[Não lançado]` virou a v2.5.0.
- Feito em 07/11/2026: a data dos testes segue o fuso de Brasília, como o servidor. `customerFile.test.ts` falhava das 21h à meia-noite.
- Feito: espelho do cliente e espelho interno com 100 em acessibilidade e boas práticas, no desktop e no celular. O SEO fica em 63 por causa do `noindex`, de propósito.
- Feito: em orçamentos o rótulo é "Cancelar"; em pedidos continua "Cancelar ou reativar".
- Feito: dependências atualizadas dentro da versão principal. Sentry 11 e `postgres` 4 mudam a versão principal e ficam para uma etapa própria.
- Feito: o Biome ignora `.vercel`.
- Portfólio: trocar `dono@atelie.test` por `dono@conveniencia.test` e refazer as capturas, que ainda mostram os dados antigos.
- Apagar as branches já mescladas, só com pedido do dono do projeto.

### Etapa 2: estoque

- Estoque mínimo com aviso.
- Ajuste de estoque com motivo e histórico, criando o registro de movimentos.
- Unidade padrão no produto: UN, CX, KG, L, M ou M2.
- Feito em 07/11/2026 (PR #18), em produção. Fica para a etapa 7: ligar a unidade M2 às medidas do orçamento, porque muda o formulário e os espelhos.

### Etapa 3: listas

- Tela "Listas" em Configurações, com a tabela única `company_list_items`.
- Valores que hoje estão fixos no código, criados para cada empresa.
- "Categorias financeiras" unificando centro de custos, plano de contas e histórico financeiro.
- Grupo do produto, com resumo por grupo no espelho interno.
- Feito em 07/11/2026. Decisão do usuário: o campo sugere os valores da lista e aceita digitar outro. A ordem é alfabética, sem coluna de posição.

### Etapa 4: relatórios

- Página com busca, grupos, filtro de período, impressão e exportação em CSV, com o cálculo no servidor.
- Os 14 relatórios já possíveis no plano original.
- Candidatos que passaram a ter dados: formação de preço, composições dos orçamentos e, depois da etapa 2, extrato e movimentação de estoque.
- Feito em 08/11/2026: 17 relatórios, com "Baixas de contas a receber" sobre `receivable_payments`. Decisão do usuário: exportar em CSV tem permissão própria, `reports.export`. Limite de 5.000 linhas por relatório, com aviso para escolher um período menor.

### Etapa 5: agenda

- Tarefas, próximas ações, validades de orçamento e títulos a vencer, com tipos fixos que podem ser mostrados ou escondidos.
- Eventos manuais.
- Ficam para depois: visão de ano, feriados e integração com Apple e Google.
- Feito em 08/11/2026: tabela `agenda_events`, visões dia, semana, mês e lista, filtro por tipo lembrado no navegador e período de até 92 dias por consulta.

### Etapa 6: navegação

- Menu por módulos e páginas de módulo. Feito em 08/11/2026.
- Busca rápida e atalhos de teclado. Feito em 08/11/2026: Ctrl+K ou F2 abre a busca de telas, ações, clientes, fornecedores, produtos, orçamentos, pedidos e oportunidades. F4 abre novo orçamento, F6 novo pedido, F7 novo cliente e F8 a tela de produtos. F9 ou Ctrl+Enter salva o formulário visível. Alt+setas trocam de aba e Alt+X fecha a aba ativa. A personalização dos atalhos por usuário (seção 7.6 do plano da v2) fica para depois.
- Cadastro rápido de cliente e produto dentro do orçamento e do pedido. Feito em 08/11/2026: o cliente novo já fica escolhido e o produto novo entra na primeira linha vazia, com o preço. Cada botão exige a permissão de criar.
- Paginação no servidor. Feito em 08/11/2026: orçamentos, pedidos, contas a receber, contas a pagar e movimentações filtram, paginam (25, 50 ou 100 por página) e somam os totais no servidor, sobre todo o filtro. Sem `page`, a API mantém a lista simples de até 500 registros, usada pelos campos de seleção. Produtos, pessoas e contas bancárias continuam com a lista completa, sem filtros de período.

### Etapa 7: restante dos documentos

Em quatro partes:

1. **Ajustes do documento.** Feito em 08/11/2026: validade em dias ligada à data, desconto em R$ ou % (o documento guarda o valor em R$), duplicar grupo de itens e ocultar item no espelho do cliente. O item oculto continua no subtotal, no subtotal do grupo e no total; o espelho interno mostra a linha marcada. Migração `0020_espelho_item_oculto`.
2. **Condições de pagamento cadastráveis.** Feito em 08/11/2026: tabela `payment_conditions` (migração `0021_condicoes_pagamento`, que cria cinco condições padrão em cada empresa), cadastro em Configurações e escolha nas parcelas do orçamento e do pedido. A entrada em % vence no dia do documento com a sua forma; os prazos em dias geram as demais parcelas com outra forma. As parcelas continuam editáveis e são copiadas para o documento: mudar a condição depois não altera documentos antigos.
3. Em duas entregas:
   - **3a. Biblioteca do orçamento.** Feito em 08/11/2026: cláusulas próprias de cada orçamento (`quotes.clauses`; vazio usa o texto padrão da empresa no espelho), textos prontos (`text_snippets`) inseridos nas cláusulas e modelos de grupo (`item_templates`): "Criar modelo do grupo" no orçamento e "Inserir modelo" procurando pelo nome. Manutenção em Configurações. Migração `0022_biblioteca_orcamento`.
   - **3b. Unidades e item avulso.** Feito em 08/11/2026: metro linear (só o comprimento vira a quantidade em metros) ao lado do m²; a unidade do cadastro (CX, KG, L...) aparece no espelho; item avulso no orçamento e no pedido, com descrição e preço livres, sem estoque, presente no histórico, nos espelhos e nos relatórios de itens. Migração `0023_item_avulso` (`product_id` opcional, `description` e uma regra no banco: produto ou descrição). Modelos de grupo guardam só itens do catálogo.
4. **Exportação em DOCX.** Feito em 08/11/2026: "Baixar em Word (DOCX)" no menu do orçamento, com o conteúdo do espelho do cliente (logo PNG ou JPEG, grupos com subtotal, item avulso, medidas, totais, parcelas, observações e cláusulas). Gerado no servidor sem dependência nova: o arquivo é um zip de XML montado em `lib/zip.ts`. A exportação fica no histórico.

### Etapa 8: gestão

- Assistente de precificação, com rateio de custos fixos. Feito em 08/11/2026: tela `/precificacao` (exige `costs.read`) com markup divisor, preço = custo ÷ (1 − rateio − custos da venda − margem). O servidor dá a média mensal dos três meses fechados de faturamento e de despesas pagas por categoria; a tela deixa marcar quais são fixas. Mostra lucro, margem de contribuição, ponto de equilíbrio e a comparação com o preço atual, e aplica o preço ao produto. Cálculo em `packages/shared/src/pricing.ts`.
- Dashboard modular com KPIs. Feito em 08/11/2026: catálogo de 15 blocos no front (`frontend/src/dashboard/blocks.tsx`), cada um com permissão e tamanhos; "Personalizar" adiciona, remove, move com botões (acessível pelo teclado), muda o tamanho (P, M, G) e restaura o padrão. Layout por usuário em `user_preferences` (migração `0024`). O `/dashboard` passou a mandar a receber, orçamentos aguardando, vendas de 12 meses, mais vendidos e CRM, cada um só para quem lê o módulo. Gráficos em CSS, sem biblioteca nova. Arrastar e soltar e o padrão por empresa ficaram para depois.
- Metas de venda. Feito em 08/11/2026: tabela `sales_goals` (migração `0025`), meta mensal da empresa e por vendedor, definida por quem altera as configurações e vista por quem tem a visão geral. O realizado soma os pedidos não cancelados do mês, por quem criou o pedido. Tela `/metas` com projeção do mês no ritmo atual e bloco "Metas do mês" na visão geral.

### Etapa 9: operações opcionais

Em quatro partes:

1. **9a. Entrega no pedido.** Feito em 08/11/2026: previsão de entrega no pedido, "Marcar como entregue" e "Desfazer entrega" no menu, situação na lista (data, atrasada ou entregue) e entregas pendentes na agenda. Migração `0026_entrega_pedido`.
2. **9b. Baixas nas contas a pagar.** Feito em 08/11/2026: tabela `expense_payments` e `expenses.paid_amount` (migração `0027`; cada despesa já paga virou uma baixa, ligada à saída de caixa existente). Pagamento parcial, com juros e desconto, em lote e estorno com permissão própria (`payables.reverse`), senha e motivo. O cadastro continua como lançamento único: marcar "pago" quita o saldo e voltar para "pendente" estorna as baixas.
3. **9c. Compras simples.** Feito em 08/11/2026: tabelas `purchases` e `purchase_items` (migração `0028`), área de permissão `purchases` (ver, criar, editar, receber, cancelar). Rascunho editável; receber dá entrada no estoque (tipo "compra" no extrato), atualiza o custo médio ponderado e cria a conta a pagar do fornecedor (categoria Mercadorias). Cancelar a recebida devolve o estoque e apaga a conta a pagar sem pagamento; o custo médio não volta. O frete entra no total da conta, não no custo do produto.
4. 9d. Em duas entregas:
   - **9d1. Renegociação.** Feito em 08/11/2026: "Renegociar parcelas" no pedido pendente transforma o saldo em aberto em novas parcelas (pela condição de pagamento ou à mão), com motivo e permissão própria (`receivables.renegotiate`). Parcela com pagamento parcial fica quitada no valor pago; as sem pagamento ficam "renegociadas" e saem das somas; as que valem são renumeradas. Sem juros nem desconto, para não mudar o total do pedido. Migração `0029`.
   - **9d2. Adiantamentos do cliente.** Feito em 08/11/2026: tabela `customer_advances` (adiantamentos e usos) e `receivable_payments.from_advance` (migração `0030`). O adiantamento entra no caixa (categoria Adiantamentos) e vira crédito; a baixa com "Usar adiantamento" quita contas do mesmo cliente sem nova entrada no caixa; estornar essa baixa devolve o crédito; estornar o adiantamento só vale se o crédito não foi usado. Seção na ficha do cliente.

### Etapa 10: assistente de IA

- Chat de ajuda guiada.
- Bot do Telegram, com confirmação antes de gravar.

## Fora da sequência

**Pendência técnica (resolvida em 09/11/2026):** o tratador global de erros agora desembrulha o erro do Postgres que o Drizzle repassa (`backend/src/lib/pgError.ts`) e responde 409 na violação de unicidade, em vez de 500.

**Itens pequenos:** todos feitos em 09/11/2026: copiar produto, código próprio do produto, número do pedido do cliente (ordem de compra), inventário, ficha cadastral para imprimir e colunas das listas.

**Backlog sem etapa:** tabelas de preço, parceiro de indicação com comissão, indicação separada da origem, ordem de serviço, anexos, aviso de vencimento por e-mail, várias empresas por usuário e recuperação de senha por e-mail.

**Fora do escopo de estudo:** emissão real de NF-e e NFS-e, boleto e retorno bancário, ordem de produção, centro de custo separado e os demais itens marcados como fora nos planos de operações, relatórios e listas.

**Só referência:** `PLANEJAMENTO_ESCALABILIDADE.md` descreve a evolução para um SaaS comercial, e o projeto não será vendido.

## Decisões pendentes

| Decisão | Quando responder |
|---|---|
| Quais itens da etapa 9 ainda interessam | Ao chegar nela |
| Se o registro manual de notas fiscais interessa como estudo | Quando o dono do projeto quiser |

## Versões

O número da versão é definido ao fechar cada etapa, para evitar renumerar o roadmap de novo. Planos mais antigos ainda citam os rótulos anteriores:

| Rótulo antigo | Agora |
|---|---|
| v2.5, navegação | Etapa 6 |
| v2.6, documentos | Etapa 7 |
| v2.7, gestão | Etapa 8 |
| v2.8, agenda | Etapa 5 |
| v3.0, assistente de IA | Etapa 10 |
| Operações, etapa 4 | Etapas 2 e 3 |
| Operações, etapa 5 | Etapas 2 e 5 |
| Operações, etapa 6 | Etapa 9 |
