---
titulo: Ajustar o estoque, fazer inventário e ver o extrato
modulo: cadastros
permissoes: [products.read, products.adjust]
atualizado: 2026-11-09
---

Corrija o saldo quando algo quebra, some ou chega fora de uma compra. Cada ajuste pede um motivo e fica no extrato do produto.

## Antes de começar

- Para ver o extrato, basta a permissão **Ver** em Produtos e serviços. Para ajustar, **Ajustar estoque**.

## Passo a passo

1. Em **Produtos e serviços**, clique em **Estoque** na linha do produto.
2. Escolha o **Tipo de ajuste**: **Entrada**, **Saída** ou **Contagem**.
3. Informe a **Quantidade** e o **Motivo**.
4. Clique em **Ajustar estoque**. O ajuste aparece no topo do **Extrato**.

![Lançar uma entrada de estoque com motivo](midia:cadastros/ajustar-estoque)

## Inventário: vários produtos de uma vez

1. Em **Produtos e serviços**, clique em **Inventário**.
2. Confira o **Motivo**. Ele já vem com a data de hoje.
3. Na coluna **Contado**, digite o que tem na prateleira. Use **Filtrar produtos** para achar pelo nome ou pelo código.
4. Clique em **Registrar inventário**. Só os produtos com diferença mudam, e cada um ganha uma contagem no extrato.

![Contar dois produtos e registrar o inventário](midia:cadastros/inventario)

Produto que você não contou fica como está.

## Dicas e atalhos

- **Contagem** troca o saldo pela quantidade contada na prateleira. Use no inventário do mês.
- O extrato mostra também vendas, compras e cancelamentos, com o usuário que fez cada um.
- Mercadoria comprada de fornecedor entra melhor pela tela **Compras**, que também atualiza o custo.

## Problemas comuns

- **"O saldo ficaria negativo"**: a saída é maior que o estoque. Confira a quantidade.
- **O botão Estoque não aparece**: o item é um serviço ou não controla estoque.

## Veja também

- [Cadastrar um produto ou serviço](/ajuda/cadastros/cadastrar-produto)
- [Lançar e receber uma compra](/ajuda/cadastros/registrar-compra)
