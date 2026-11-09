# Changelog

Todas as mudanças relevantes do Arandu Gestão, por versão. O roadmap das próximas versões está no [PLANEJAMENTO_V2.md](PLANEJAMENTO_V2.md) (seção 11).

## [Não lançado]

### Adicionado

- **Assistente de IA (etapa 10a):** botão no topo abre um chat que responde dúvidas de uso com base no manual inteiro, em cache de prompt, pelo Claude Haiku 5.5. Cada chamada fica em `ai_usage` com tokens e custo em reais; cota mensal por empresa (padrão R$ 200, aviso em 80%) e teto da plataforma. Permissão nova `assistant.use`, dada a todos os grupos na migração `0034`. O texto do manual vem de `npm run manual:ia`, e um teste falha se ele ficar desatualizado.
- **Código próprio do produto** (opcional): aparece na lista, entra na busca rápida e no histórico. É único por empresa entre os produtos ativos, sem diferenciar maiúsculas. Migração `0031`.
- **Colunas das listas:** botão "Colunas" em pedidos, orçamentos, produtos, contas a pagar, contas bancárias e movimentações. Cada usuário esconde as colunas que não usa; a escolha fica guardada (`user_preferences.list_columns`, migração `0033`). A primeira coluna fica sempre à vista. Em produtos, "Nome" passa a ser a primeira coluna.
- **Ficha cadastral para imprimir:** "Imprimir ficha cadastral" no menu ⋯ de clientes, fornecedores, transportadoras e representantes abre o cadastro em A4, com cabeçalho da empresa, identificação, dados comerciais, contatos e endereços.
- **Inventário:** botão na lista de produtos para contar vários produtos de uma vez, com filtro por nome ou código e a diferença de cada um. Só os que mudaram são ajustados, numa transação só, cada um com uma contagem no extrato. Exige `products.adjust`.
- **Ordem de compra do cliente** no pedido: campo "Ordem de compra (nº)", mostrado na lista como "OC", no filtro de texto, na busca rápida e no histórico. Cópia de pedido e conversão de orçamento começam sem ele. Migração `0032`.
- **Copiar produto:** o ícone "Copiar" na lista abre um cadastro novo com os mesmos dados, sem código e com estoque zero.
- **Manual de uso:** central de ajuda em `/ajuda`, botão "?" com o artigo da tela, 27 artigos com vídeos curtos legendados (ampliáveis) e artigos na busca rápida. Os vídeos saem de roteiros do Playwright que rodam no CI como teste.

- **Extrato do estoque:** cada mudança de saldo fica registrada, com tipo, quantidade, saldo depois, motivo, pedido e usuário. Vendas, cancelamentos, reativações e exclusões de pedido entram sozinhas.
- **Ajuste de estoque** com entrada, saída ou contagem e motivo obrigatório, pela permissão nova `products.adjust`, concedida na migração a quem já edita produtos. O saldo nunca fica negativo.
- **Estoque mínimo com aviso** na lista de produtos e na visão geral.
- **Unidade no produto:** UN, CX, KG, L, M ou M2.
- **Listas da empresa**, em Configurações: formas e condições de pagamento, origens da oportunidade, motivos de perda, categorias de cliente, cargos de contato, categorias financeiras e grupos de produto. Os formulários sugerem esses valores e aceitam digitar outro. Desativar tira o valor das sugestões sem mudar os registros que já o usam.
- **Grupo do produto**, sugerido pela lista, com o resumo do espelho interno por grupo.
- **Relatórios:** 17 relatórios de vendas, financeiro, estoque e gestão, com busca, período, totais, impressão e paginação. Cada grupo vê só os relatórios dos módulos que já pode ver; custo e margem exigem `costs.read`. Permissão `reports.read` para todos os grupos na migração.
- **Agenda:** tarefas e compromissos lançados à mão, com as próximas ações do CRM, a validade dos orçamentos enviados e as contas a receber e a pagar, nas visões dia, semana, mês e lista. Cada tipo pode ser escondido, e cada item exige a leitura do seu módulo. Permissões `agenda.*`, com escopo "só os próprios".
- **Menu por módulos:** Início, Vendas, Financeiro, Cadastros, Gestão e Administração. Cada módulo tem uma página de entrada com um bloco por tela e os atalhos de criação que o grupo pode usar; a de Vendas mostra o fluxo CRM, orçamento, pedido e recebimento. No desktop, o menu fica fixo e rola sozinho.
- **Busca rápida:** Ctrl+K ou F2, ou o botão Buscar no topo. Acha telas e ações na hora e, pelo servidor, clientes, fornecedores, produtos, orçamentos, pedidos e oportunidades, também pelo número (`#12`). Cada resultado respeita a permissão e o escopo "só os próprios".
- **Atalhos de teclado:** F4 novo orçamento, F6 novo pedido, F7 novo cliente, F8 produtos, F9 ou Ctrl+Enter salva o formulário visível, Alt+setas trocam de aba e Alt+X fecha a aba. A lista fica na própria busca.
- **Cadastro rápido** no orçamento e no pedido: "Novo cliente" (nome, CPF ou CNPJ, celular e e-mail) e "Novo produto" sem sair do documento. O cliente novo já fica escolhido; o produto entra na primeira linha vazia, com o preço. Cada botão aparece só para quem pode criar.
- **Paginação no servidor** em orçamentos, pedidos, contas a receber, contas a pagar e movimentações: 25, 50 ou 100 por página, com filtros de período, status e texto aplicados pelo servidor. Os totais somam todo o filtro, não só a página. A API aceita `page`, `pageSize`, `from`, `to`, `status` e `q`; sem `page`, devolve a lista simples de antes.
- **Ajustes no orçamento:** validade em dias ligada à data; desconto em R$ ou % (também no pedido), recalculado enquanto os itens mudam; "Duplicar grupo" copia os itens do grupo com o nome "(cópia)"; "Ocultar no espelho" tira a linha do espelho do cliente sem tirar o valor do subtotal, do subtotal do grupo e do total. O espelho interno mostra a linha marcada.
- **Condições de pagamento** em Configurações: nome, entrada em %, forma da entrada, prazos em dias (ex.: 30/60/90) e forma das parcelas. Cada empresa começa com À vista, 30 dias, 30/60, 30/60/90 e Entrada 50% + 30 dias. No orçamento e no pedido, escolher a condição gera as parcelas, cada uma com a sua forma, e elas continuam editáveis. Só quem configura a empresa cria ou altera; desativar tira a condição da escolha.
- **Biblioteca do orçamento:** textos prontos (ex.: garantia, prazo de montagem) cadastrados em Configurações e inseridos nas novas "Cláusulas e condições" de cada orçamento, que substituem o texto padrão da empresa no espelho. Modelos de grupo: "Criar modelo do grupo" guarda os itens do grupo, e "Inserir modelo" os traz de volta em outro orçamento, procurando pelo nome. Quem monta orçamento cria e usa modelos; desativar fica em Configurações.
- **Item avulso** no orçamento e no pedido: "Item avulso (fora do catálogo)" na escolha do produto, com descrição e preço livres. Não mexe no estoque e segue na conversão, na duplicação, no histórico, nos espelhos e nos relatórios de itens.
- **Metro linear:** com as medidas ligadas, deixar a largura vazia e informar só o comprimento calcula a quantidade em metros. O espelho mostra a unidade do cadastro do produto (CX, KG, L...).
- **Orçamento em Word (DOCX):** "Baixar em Word (DOCX)" no menu de ações do orçamento. O arquivo tem o mesmo conteúdo do espelho do cliente, abre no Word e no LibreOffice e fica registrado no histórico.
- **Precificação** (Gestão): preço sugerido a partir do custo, das despesas fixas do mês (média dos três últimos meses fechados, com as categorias que você marcar como fixas), dos custos da venda em % e da margem desejada. Mostra lucro, margem de contribuição, ponto de equilíbrio e a comparação com o preço atual do produto, e aplica o preço sugerido com um clique. Exige ver custos.
- **Visão geral personalizável:** "Personalizar" deixa cada usuário escolher os blocos (faturamento, despesas, saldo, pedidos pendentes, a receber, orçamentos aguardando, resultado do mês, estoque baixo, vendas por mês, mais vendidos, últimos pedidos, CRM, limite do MEI, acesso rápido e ODS), a ordem e o tamanho. Cada um guarda o seu layout; quem não pode ver um módulo não vê o bloco dele.
- **Metas de venda** (Gestão): meta do mês para a empresa e para cada vendedor, com o vendido até agora, a projeção do mês no ritmo atual e o bloco "Metas do mês" na visão geral. Quem altera as configurações define as metas; mudanças ficam no histórico.
- **Entrega no pedido:** previsão de entrega no pedido, "Marcar como entregue" e "Desfazer entrega" no menu de ações, situação na lista de pedidos (data prevista, atrasada ou entregue) e entregas pendentes na agenda.
- **Baixas nas contas a pagar:** botão "Baixas" em cada despesa para pagar total ou parcial, com juros e desconto, ver as baixas e estornar (permissão nova `payables.reverse`, senha e motivo); "Pagar em lote" para várias contas de uma vez. A lista mostra o valor pago e o selo "Parcial", e os totais somam o pago e o saldo em aberto. As despesas já pagas viraram uma baixa cada, sem mudar o saldo.
- **Compras** (Cadastros): compra do fornecedor com itens e custo, em rascunho. "Receber" dá entrada no estoque, atualiza o custo médio do produto e cria a conta a pagar; "Cancelar" devolve o estoque e apaga a conta a pagar ainda sem pagamento. Permissões próprias (área "Compras").
- **Renegociação de parcelas:** no pedido pendente, "Renegociar parcelas" troca o saldo em aberto por novas parcelas, com motivo no histórico e permissão própria. O total do pedido não muda.
- **Adiantamentos do cliente:** na ficha do cliente, "Registrar adiantamento" lança o valor no caixa e cria um saldo de crédito. Na baixa das contas a receber de um mesmo cliente, "Usar adiantamento" quita com esse crédito, sem nova entrada no caixa. Estornar a baixa devolve o crédito; o adiantamento só se estorna se o crédito não foi usado.
- **Exportação em CSV** com a permissão nova `reports.export`, concedida a quem vê os indicadores. O arquivo abre no Excel em português, neutraliza textos que seriam lidos como fórmula e fica registrado no histórico. Nenhum relatório traz CPF/CNPJ, telefone ou endereço.

### Alterado

- A lista de texto "Condições de pagamento", sugerida no cadastro de clientes, passou a se chamar "Prazos no cadastro do cliente", para não se confundir com as condições que geram parcelas.
- As listas não param mais nos 500 registros mais recentes. "Imprimir lista" virou "Imprimir página": sai a página que está na tela.
- No cadastro, o estoque só é informado na criação; depois, muda pelo ajuste. Pela API, alterar `stock` no cadastro continua possível e entra no extrato como edição do cadastro.

### Corrigido

- Violação de unicidade (ex.: grupo de acesso com nome repetido) respondia 500: o erro do Postgres vem embrulhado pelo Drizzle. Agora responde 409.
- O botão da lista de transportadoras dizia "Novo transportadora".
- Janelas abertas de uma linha da tabela (estoque, baixas) não herdam mais o texto alinhado à direita.
- Em contas a receber, a parcela (ex.: 2/3) é contada no banco e continua certa com filtro ou paginação.
- No celular, o menu principal rola até as últimas opções.
- Salvar uma janela aberta de dentro de um formulário não envia mais o formulário de trás.
- Janelas com campo marcado para foco automático abrem com o foco nesse campo, não no botão de fechar.
- Datas do seed seguem o fuso de Brasília: à noite, as tarefas e os pedidos de exemplo não caem mais no dia seguinte.

## [2.5.0] — 2026-11-07

### Adicionado

- **Espelho interno:** o orçamento ganha um documento só para a empresa, com custo por item, resumo por tipo, resultado e margem, e o aviso "Uso interno: não enviar ao cliente". Frete e outras despesas ficam fora da margem. Sem o custo de todos os itens, a margem não é calculada.
- **Contas a receber por parcela:** cada pedido tem as suas contas, com vencimento, valor pago e saldo. A baixa é por parcela, com data e conta, e o pedido fica pago na última. Parcelas do orçamento viram contas ao converter.
- **Fornecedor na despesa:** contas a pagar passam a indicar o fornecedor, com busca na lista.
- **Filtros nas listas:** orçamentos, pedidos, contas a receber, contas a pagar e movimentações ganham filtro de período com atalhos, status e busca, totais no rodapé e "Imprimir lista".
- **Parcelas no orçamento:** vencimento, valor e forma, com geração automática e soma conferida com o total. Saem nos espelhos. Ainda não geram contas a receber por parcela.
- **Grupos de itens:** cada item pode ter um grupo, como ambiente, etapa ou kit, com subtotal nos espelhos.
- **Medidas opcionais:** ativadas em Configurações, com largura e comprimento em caixas separadas, digitados em mm, cm ou m. A quantidade é calculada em m².
- **Custo fixado no envio:** mudar o custo do produto depois não altera a margem de um orçamento já enviado.
- **Baixa parcial e em lote:** várias contas a receber de uma vez, com juros e desconto. O estorno exige a permissão `receivables.reverse`, a senha de login e o motivo, e o mesmo vale para cancelar, excluir ou voltar para pendente um pedido com baixa.
- **Ficha do cliente:** CRM, documentos e financeiro do cliente em uma tela, com dívida, limite e pontualidade. Todo atendimento registrado nela fica em uma oportunidade do CRM.
- **`PLANEJAMENTO_ETAPAS.md`:** a ordem de trabalho em etapas, fonte única para as duas estações.

### Alterado

- **Permissão `costs.read`:** o custo dos produtos deixa de aparecer para quem só vê produtos. Na migração, a permissão vai para os grupos que já veem contas a pagar; os demais podem recebê-la em Grupos de acesso.

- **Faturamento:** segue a data do pedido e só conta pedido quitado; juros e desconto da baixa ajustam o valor.
- **Rótulo de permissão:** em orçamentos, a ação passa a se chamar "Cancelar", porque reabrir usa a permissão de editar. Em pedidos continua "Cancelar ou reativar".
- **Dependências** atualizadas dentro da mesma versão principal, incluindo Fastify, Vite, Vitest, Playwright e Biome. Sentry 11 e `postgres` 4 ficam para depois, por mudarem a versão principal.
- **Dados de demonstração:** a empresa padrão agora é uma mini conveniência de bebidas, com vendas, orçamentos em cada situação, oportunidades e financeiro de exemplo. O acesso de teste passa a ser `dono@conveniencia.test`.

### Corrigido

- A data dos testes segue o fuso de Brasília, como o servidor: um teste falhava das 21h à meia-noite.
- Teste ponta a ponta da ficha do cliente procurava o texto também na aba escondida e falhava às vezes.
- `npm run lint` ignora `.vercel/output`.

## [2.4.0] — 2026-11-05

### Adicionado

- **Reabrir orçamento:** enviado, aprovado ou recusado volta para rascunho, com motivo no histórico, e passa de novo por envio e aprovação. Cancelado e convertido em pedido não reabrem.
- **Exclusão bloqueada depois do envio:** orçamento reaberto só pode ser excluído pelo Proprietário. Nenhum outro grupo recebe essa liberação.
- **Espelho do cliente:** o orçamento vira um documento A4, pronto para imprimir ou salvar em PDF, sem custos nem observação interna. Rascunho, recusado e cancelado saem com um aviso.
- **Dados da empresa no documento:** razão social, endereço, telefone, e-mail, logo e condições padrão, nas configurações.
- **Novos campos no orçamento:** frete, outras despesas, local de entrega ou serviço e observação interna. Frete e despesas entram no total e seguem para o pedido.
- **Documento enviado não muda sozinho:** ao enviar, o orçamento guarda uma cópia dos dados da empresa, do cliente e dos itens.

### Alterado

- **Monitoramento ligado:** erros da API e do navegador chegam ao Sentry, sem dados pessoais.
- **Novo nome: Arandu Gestão**, na interface, na documentação e no endereço da demonstração.

## [2.3.0] — 2026-11-05

### Adicionado

- **Histórico de alterações** em orçamentos e pedidos: aba com quem fez, o quê e quando; o clique abre o detalhe com valores de antes e depois, campo a campo e item a item.
- **Cancelar orçamento** enviado ou aprovado, com a permissão `quotes.cancel`, concedida a quem já cancelava pedidos.
- **Motivo obrigatório** ao recusar orçamento e ao cancelar orçamento ou pedido.
- O registro de auditoria guarda o nome do usuário na data da ação e, na exclusão, uma cópia do documento.
- **Registro detalhado em todos os módulos:** produtos, pessoas, oportunidades, financeiro, usuários, grupos e configurações guardam valores de antes e depois.
- **Tela de auditoria** com filtros por usuário, módulo, ação e período, e a permissão `audit.read`.
- **Dados pessoais protegidos no registro:** CPF/CNPJ, e-mail, telefone, endereço e senha aparecem como "alterado", sem guardar o valor.
- **Testes ponta a ponta** com Playwright, também no CI.
- **Preparação da publicação:** pacote para a Vercel em `gru1`, usuário de banco sem poder de alterar a estrutura, RLS em todas as tabelas, cabeçalhos de segurança e monitoramento opcional com Sentry, sem dados pessoais.
- **Modo demonstração:** aviso com o acesso de teste e dados que voltam ao padrão a cada 12 horas.

### Alterado

- **Só rascunhos podem ser excluídos** em orçamentos; enviado ou aprovado é cancelado.
- O botão de fechar abas e janelas fica à esquerda.

### Corrigido

- Migrações e testes falhavam no Windows por causa do caminho da pasta `drizzle`.

## [2.2.0] — 2026-11-03

### Adicionado

- **Oportunidades** no lugar dos leads: título, cliente ou dados de contato, valor estimado, previsão de fechamento e itens de interesse, que preenchem o primeiro orçamento.
- **Situação separada da etapa:** em andamento, ganha ou perdida, mantendo a etapa onde parou.
- **Funil configurável por empresa** (nome, ordem, cor e marco da automação), com a permissão `opportunities.configure`.
- **Automação de etapas, só para frente:** orçamento enviado, orçamento aprovado ou pedido criado e pedido recebido (ganha) geram eventos no histórico.
- **Rastreio** em cada orçamento e pedido: a cadeia completa desde a oportunidade, com a data do recebimento, respeitando o escopo de quem consulta.
- **Vincular, desvincular e criar oportunidade a partir de um documento.** Duplicar pergunta se mantém na mesma oportunidade (já marcado) e sempre guarda a origem.
- Kanban com total em R$ e quantidade por coluna; lista com filtros e totais no rodapé; tela da oportunidade com barra de etapas e valor estimado × em orçamentos × em pedidos × recebido.
- Tipos de atividade no histórico (comentário, ligação, visita, reunião, proposta, e-mail).
- Menu ⋯ organizado em grupos.

### Alterado

- Migração preserva os ids: leads viram oportunidades e `leads.*` vira `opportunities.*` nos grupos de acesso. Ganho e perdido deixam de ser colunas do funil e passam a ser situação.
- `/leads` foi substituído por `/opportunities`.
- Produto usado como item de interesse é arquivado em vez de excluído.

### Corrigido

- Contraste dos selos de status (pago, pendente, cancelado, aprovado, ganho, perdido) e dos textos secundários do menu e do histórico acima de 4,5:1.
- Barra de abas como navegação (`<nav>` + `aria-current`), sem papéis ARIA inválidos; Lighthouse de acessibilidade volta a 100.
- Título do topo nas telas fora do menu (ex.: cadastro de pessoa) e alinhamento de nomes longos em listas e cartões.

## [2.1.0] — 2026-11-02

### Adicionado

- Cadastro único de pessoas (`people`) com papéis: cliente, fornecedor, transportadora e representante.
- CPF/CNPJ validados pelos dígitos verificadores e únicos por empresa; inscrição estadual, contribuinte, consumidor final e regime tributário.
- Consulta de CNPJ (BrasilAPI) e de CEP (ViaCEP) pelo servidor, com limite de 5 s e de 20 consultas por minuto.
- Endereço estruturado, contatos, endereços de entrega e cobrança e dados comerciais (pagamento, frete, transportadora padrão, categoria, região, limite de crédito, vendedor da carteira).
- Permissão `customers.assign` para alterar o vendedor da carteira.
- Telas de Clientes, Fornecedores, Transportadoras e Representantes (lista com busca) e cadastro em abas.

### Alterado

- Clientes e fornecedores migrados para `people` mantendo os ids dos clientes; orçamentos, pedidos e leads passam a apontar para `people`. `/customers` e `/suppliers` continuam como atalhos por papel.
- Pessoa usada em documentos é arquivada em vez de excluída.

## [2.0.0] — 2026-11-02

Primeira versão do Arandu Gestão como SaaS multiempresa (a v1, monousuário com MySQL, está na tag `v1.0.0`).

### Adicionado

- Cadastro de empresa, login e sessão segura (Argon2id, cookie `HttpOnly`, proteção CSRF, limite de tentativas).
- Multiempresa com isolamento verificado por testes; numeração de pedidos e orçamentos por empresa.
- Permissões por ação (49) e grupos de acesso por empresa, com escopo "só os próprios" e administração delegável sem escalada.
- Usuários (convite, grupo, desativação), fornecedores, configurações da empresa com limite anual do MEI obrigatório.
- Orçamentos (rascunho → enviado → aprovado/recusado), conversão em pedido, duplicar e copiar entre orçamento e pedido.
- Contas a receber com baixa, contas a pagar com permissão própria de pagamento, caixa sincronizado com pedidos e despesas.
- CRM: funil em colunas, atendimentos por canal, lead ganho vira cliente sem duplicar.
- Área de trabalho com abas fixas, duas telas lado a lado e menu de ações ⋯ por status e permissão.
- 47 testes de integração; CI com lint, typecheck, testes, build e auditoria de dependências.
