import { expect, test } from '@playwright/test';
import { CUSTOMER, chooseOption, itemSelect, login, OWNER, SERVICE, toast } from './helpers.ts';

test('renegociar: o saldo do pedido vira novas parcelas pela condição escolhida', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/pedidos/novo');
  await chooseOption(page.locator('select[name="customerId"]:visible'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('90');
  await page.getByRole('button', { name: 'Criar pedido' }).click();
  await expect(page).toHaveURL(/\/pedidos\/\d+$/);

  await page.getByRole('button', { name: 'Renegociar parcelas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Renegociar parcelas' });
  await chooseOption(dialog.getByLabel('Condição de pagamento'), '30/60/90 dias');
  await expect(dialog.locator('input[name="installments.2.amount"]')).toHaveValue('30');
  await dialog.getByLabel('Motivo').fill('Cliente pediu mais prazo');
  await dialog.getByRole('button', { name: 'Renegociar', exact: true }).click();
  await expect(toast(page, 'Parcelas renegociadas.')).toBeVisible();

  const table = page.getByRole('table', { name: 'Contas a receber do pedido' });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('cell', { name: '3/3', exact: true })).toBeVisible();
});
