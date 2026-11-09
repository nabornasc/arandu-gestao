---
titulo: Criar um pedido de venda
modulo: vendas
tela: /pedidos
permissoes: [orders.create]
atualizado: 2026-11-09
---

Registre uma venda direta, sem passar pelo orçamento. O pedido baixa o estoque e gera a conta a receber.

## Antes de começar

- Você precisa da permissão **Criar** em Pedidos.
- Para marcar como pago na hora, também precisa da permissão **Dar baixa (marcar como pago)** em Contas a receber.

## Passo a passo

1. No menu, abra **Vendas e pedidos** e clique em **Novo pedido**. O atalho **F6** faz o mesmo.
2. Escolha o **Cliente**, o item e a quantidade.
3. Em **Status**, escolha **Pendente (a receber)** ou **Pago (entra no caixa)**.
4. Clique em **Criar pedido**.

![Criar um pedido com cliente, item e status](midia:vendas/criar-pedido)

## Dicas e atalhos

- Se o cliente mandou uma ordem de compra, anote o número em **Ordem de compra (nº)**. Ele aparece na lista como **OC**, e o filtro **Cliente ou número** e a busca rápida acham o pedido por ele.
- Em pedido pendente, abra **Parcelas** para dividir o valor. Cada parcela vira uma conta a receber.
- Em pedido pago, escolha a **Conta de recebimento**. Sem escolha, vale a conta padrão.
- O menu **⋯** do pedido tem **Dar baixa (recebido)**, **Marcar como entregue** e **Cancelar pedido**.

## Problemas comuns

- **"Estoque insuficiente"**: a quantidade passa do saldo do produto.
- **"A soma das parcelas (...) precisa ser igual ao total do pedido"**: ajuste os valores das parcelas.

## Veja também

- [Receber um pagamento](/ajuda/vendas/receber-pagamento)
- [Cadastro rápido no orçamento e no pedido](/ajuda/vendas/cadastro-rapido)
