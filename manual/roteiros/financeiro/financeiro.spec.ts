import { expect, test } from '@playwright/test';
import { CUSTOMER, chooseOption, itemSelect, login, OWNER, SERVICE, toast } from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiros dos artigos do financeiro.
useRecording();

test.beforeEach(({ page }) => login(page, OWNER));

const EXPENSE = 'Conta de água da loja';

test('manual: lançar e pagar uma conta a pagar', async ({ page }) => {
  const scene = await Scene.open(page, 'financeiro/pagar-conta');
  await page.goto('/despesas');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('financeiro/lancar-despesa', 'Clique em Novo registro', () =>
    scene.click(page.getByRole('button', { name: 'Novo registro' })),
  );
  const form = page.getByRole('dialog', { name: 'Novo registro' });
  await scene.step('financeiro/lancar-despesa', 'Preencha descrição, categoria e valor', async () => {
    await scene.fill(form.locator('[name="description"]'), EXPENSE);
    await scene.fill(form.locator('[name="category"]'), 'Água e esgoto');
    await scene.fill(form.locator('[name="amount"]'), '86.4');
  });
  await scene.step('financeiro/lancar-despesa', 'Deixe Pendente e clique em Criar registro', async () => {
    await expect(form.locator('[name="status"]')).toHaveValue('pending');
    await scene.click(form.getByRole('button', { name: 'Criar registro' }));
    await expect(toast(page, 'Registro criado com sucesso.')).toBeVisible();
  });

  const row = page.locator('tbody tr').filter({ hasText: EXPENSE });
  await scene.step('financeiro/pagar-despesa', 'Busque a conta e clique em Baixas', async () => {
    await scene.fill(page.getByLabel('Descrição, categoria ou fornecedor'), 'água da loja');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await scene.click(row.getByRole('button', { name: 'Baixas' }));
  });
  const pay = page.getByRole('dialog', { name: EXPENSE });
  await scene.step('financeiro/pagar-despesa', 'Confira o valor, a data e a conta', async () => {
    await expect(pay.getByLabel('Valor pago (R$)')).toHaveValue('86.4');
    await scene.select(pay.getByLabel('Conta de débito'), 'Caixa da loja');
  });
  await scene.step('financeiro/pagar-despesa', 'Clique em Registrar pagamento', async () => {
    await scene.click(pay.getByRole('button', { name: 'Registrar pagamento' }));
    await expect(toast(page, 'Pagamento registrado.')).toBeVisible();
    await expect(row).toContainText('Pago');
  });
  await scene.finish();
});

test('manual: cadastrar uma conta bancária', async ({ page }) => {
  const scene = await Scene.open(page, 'financeiro/contas-bancarias');
  await page.goto('/contas');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('financeiro/cadastrar-conta', 'Clique em Novo registro', () =>
    scene.click(page.getByRole('button', { name: 'Novo registro' })),
  );
  const form = page.getByRole('dialog', { name: 'Novo registro' });
  await scene.step('financeiro/cadastrar-conta', 'Preencha a instituição e o nome da conta', async () => {
    await scene.fill(form.locator('[name="bankName"]'), 'Dinheiro');
    await scene.fill(form.locator('[name="accountName"]'), 'Cofre do escritório');
  });
  await scene.step('financeiro/cadastrar-conta', 'Escolha o tipo e informe o saldo inicial', async () => {
    await scene.select(form.locator('[name="accountType"]'), 'Caixa físico');
    await scene.fill(form.locator('[name="initialBalance"]'), '250');
  });
  await scene.step('financeiro/cadastrar-conta', 'Clique em Criar registro', async () => {
    await scene.click(form.getByRole('button', { name: 'Criar registro' }));
    await expect(toast(page, 'Registro criado com sucesso.')).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'Cofre do escritório' })).toBeVisible();
  });
  await scene.finish();
});

test('manual: lançar uma movimentação', async ({ page }) => {
  const scene = await Scene.open(page, 'financeiro/movimentacoes');
  await page.goto('/movimentacoes');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('financeiro/lancar-movimentacao', 'Clique em Novo registro', () =>
    scene.click(page.getByRole('button', { name: 'Novo registro' })),
  );
  const form = page.getByRole('dialog', { name: 'Novo registro' });
  await scene.step('financeiro/lancar-movimentacao', 'Escolha Saída e preencha os dados', async () => {
    await scene.select(form.locator('[name="type"]'), 'Saída');
    await scene.fill(form.locator('[name="category"]'), 'Tarifas bancárias');
    await scene.fill(form.locator('[name="description"]'), 'Tarifa de manutenção da conta');
    await scene.fill(form.locator('[name="amount"]'), '19.9');
  });
  await scene.step(
    'financeiro/lancar-movimentacao',
    'Escolha a conta e clique em Criar registro',
    async () => {
      await scene.select(form.locator('[name="bankAccountId"]'), 'Caixa da loja');
      await scene.click(form.getByRole('button', { name: 'Criar registro' }));
      await expect(toast(page, 'Registro criado com sucesso.')).toBeVisible();
    },
  );
  await scene.finish();
});

test('manual: renegociar as parcelas de um pedido', async ({ page }) => {
  const scene = await Scene.open(page, 'financeiro/renegociar-parcelas');
  // Preparação fora do vídeo: um pedido pendente com saldo em aberto.
  await page.goto('/pedidos/novo');
  await chooseOption(page.locator('select[name="customerId"]:visible'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('90');
  await page.getByRole('button', { name: 'Criar pedido' }).click();
  await expect(page).toHaveURL(/\/pedidos\/\d+$/);

  await scene.step('financeiro/renegociar', 'Clique em Renegociar parcelas', () =>
    scene.click(page.getByRole('button', { name: 'Renegociar parcelas' })),
  );
  const dialog = page.getByRole('dialog', { name: 'Renegociar parcelas' });
  await scene.step('financeiro/renegociar', 'Escolha a condição e informe o motivo', async () => {
    await scene.select(dialog.getByLabel('Condição de pagamento'), '30/60/90 dias');
    await expect(dialog.locator('input[name="installments.2.amount"]')).toHaveValue('30');
    await scene.fill(dialog.getByLabel('Motivo'), 'Cliente pediu mais prazo');
  });
  await scene.step('financeiro/renegociar', 'Clique em Renegociar', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Renegociar', exact: true }));
    await expect(toast(page, 'Parcelas renegociadas.')).toBeVisible();
  });
  await scene.finish();
});
