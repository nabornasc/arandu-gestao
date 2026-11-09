---
titulo: Cadastrar um produto ou serviço
modulo: cadastros
tela: /produtos
permissoes: [products.create]
atualizado: 2026-11-09
---

Cadastre o que você vende. O produto controla estoque e avisa quando está acabando. O serviço não tem estoque.

## Antes de começar

- Você precisa da permissão **Criar** em Produtos e serviços.
- O campo **Custo unitário** só aparece para quem pode ver **Custos e margem**.

## Passo a passo

1. No menu, abra **Produtos e serviços** e clique em **Novo registro**. O atalho **F8** abre a lista.
2. Preencha o **Nome** e, se usar, o **Código (opcional)**, como o da etiqueta. Escolha o **Tipo**: **Produto** ou **Serviço**.
3. Informe o **Preço de venda (R$)** e, se puder, o **Custo unitário (R$)**.
4. Escolha a **Unidade** e o **Grupo**.
5. Para produto, informe o **Estoque inicial** e o **Estoque mínimo (aviso)**.
6. Clique em **Criar registro**.

![Cadastrar um produto com estoque inicial e mínimo](midia:cadastros/cadastrar-produto)

## Dicas e atalhos

- Deixe o estoque inicial vazio para serviço. Depois do cadastro, o estoque só muda por venda, compra ou ajuste.
- Quando o saldo fica abaixo do mínimo, a lista mostra **Estoque baixo** e a **Visão geral** avisa.
- Para um produto parecido, use o ícone **Copiar** na linha. A cópia vem com os mesmos dados, sem código e com estoque zero.
- A busca rápida (**Ctrl+K**) acha o produto pelo nome ou pelo código.
- Dá para cadastrar um produto sem sair do orçamento, pelo botão **Novo produto**.

## Problemas comuns

- **"Já existe um produto com esse código"**: o código é único entre os produtos ativos. Use outro.

## Veja também

- [Ajustar o estoque, fazer inventário e ver o extrato](/ajuda/cadastros/ajustar-estoque)
- [Cadastro rápido no orçamento e no pedido](/ajuda/vendas/cadastro-rapido)
