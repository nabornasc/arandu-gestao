---
titulo: Lançar e pagar uma conta a pagar
modulo: financeiro
tela: /despesas
permissoes: [payables.create, payables.pay]
atualizado: 2026-11-09
---

Registre as despesas do negócio, como aluguel, energia e mercadoria. Quando pagar, dê baixa: a saída entra no caixa da conta escolhida.

## Antes de começar

- Para lançar, você precisa da permissão **Criar** em Contas a pagar. Para pagar, **Marcar como paga**.
- Para a saída aparecer no caixa, cadastre antes a conta em **Contas bancárias**.

## Passo a passo

1. No menu, abra **Contas a pagar** e clique em **Novo registro**.
2. Preencha **Descrição**, **Categoria**, **Valor (R$)** e **Vencimento / pagamento**.
3. Deixe o **Status** em **Pendente** e, se quiser, escolha o **Fornecedor**.
4. Clique em **Criar registro**.

![Lançar uma conta a pagar pendente](midia:financeiro/lancar-despesa)

5. No dia do pagamento, clique em **Baixas** na linha da conta.
6. Confira o **Valor pago (R$)**, a **Data do pagamento** e a **Conta de débito**.
7. Clique em **Registrar pagamento**.

![Dar baixa em uma conta a pagar](midia:financeiro/pagar-despesa)

## Dicas e atalhos

- Valor menor que o saldo deixa a conta **Parcial**, com o restante em aberto.
- Para pagar várias contas de uma vez, use **Pagar em lote**, marque as contas e clique em **Pagar selecionadas**.
- Para desfazer um pagamento, abra **Baixas** e clique em **Estornar**. O estorno pede o motivo e a sua senha de login.
- A compra recebida do fornecedor já cria a conta a pagar sozinha.

## Problemas comuns

- **"passa do saldo"**: o valor pago, menos juros e mais desconto, é maior que o que falta pagar.
- **A janela de Baixas não mostra o formulário**: a conta já está paga ou falta a permissão **Marcar como paga**.

## Veja também

- [Cadastrar uma conta bancária](/ajuda/financeiro/contas-bancarias)
- [Lançar e receber uma compra](/ajuda/cadastros/registrar-compra)
