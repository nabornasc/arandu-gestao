---
titulo: Lançar e receber uma compra
modulo: cadastros
tela: /compras
permissoes: [purchases.create, purchases.receive]
atualizado: 2026-11-09
---

Registre a mercadoria comprada do fornecedor. Ao receber a compra, o estoque entra, o custo médio é atualizado e a conta a pagar é criada.

## Antes de começar

- Você precisa das permissões **Criar** e **Receber** em Compras.
- O fornecedor e os produtos precisam estar cadastrados. Só produtos com estoque entram na compra.

## Passo a passo

1. No menu, abra **Compras** e clique em **Nova compra**.
2. Escolha o **Fornecedor** e confira a **Data da compra** e o **Vencimento da conta a pagar**.
3. Em cada item, escolha o produto, a **Qtd.** e o **Custo unitário (R$)**. Use **Adicionar item** para mais linhas.
4. Clique em **Salvar rascunho**.

![Lançar uma compra como rascunho](midia:cadastros/lancar-compra)

5. Quando a mercadoria chegar, clique em **Receber** na linha da compra.
6. Confira o resumo e clique em **Receber compra**.

![Receber a compra no estoque](midia:cadastros/receber-compra)

## Dicas e atalhos

- Enquanto está em rascunho, a compra pode ser editada. Depois de recebida, não.
- **Cancelar** uma compra recebida devolve o estoque e apaga a conta a pagar. O custo médio não muda.
- O **Frete (R$)** soma no total da compra.

## Problemas comuns

- **"Escolha o fornecedor"**: cadastre o fornecedor antes, em **Fornecedores**.
- **"Só produtos com controle de estoque entram na compra"**: serviço não entra em compra.

## Veja também

- [Cadastrar um fornecedor](/ajuda/cadastros/cadastrar-fornecedor)
- [Lançar e pagar uma conta a pagar](/ajuda/financeiro/pagar-conta)
