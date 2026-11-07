import { expect, test } from '@playwright/test';
import { login, OWNER, SELLER, toast } from './helpers.ts';

test('ajuste de estoque com motivo aparece no extrato e tira o aviso de estoque baixo', async ({ page }) => {
  await login(page, OWNER);
  // O seed deixa a Cerveja Puro Malte abaixo do mínimo.
  await expect(page.getByRole('region', { name: 'Estoque baixo' })).toContainText('Cerveja Puro Malte');

  await page.goto('/produtos');
  const row = page.getByRole('row', { name: /Cerveja Puro Malte lata 350 ml/ });
  await expect(row).toContainText('Estoque baixo');
  await row.getByRole('button', { name: 'Estoque' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('table', { name: /Extrato do estoque/ })).toContainText('Venda');
  await dialog.getByLabel('Tipo de ajuste').selectOption('in');
  await dialog.getByLabel(/Quantidade/).fill('48');
  await dialog.getByLabel('Motivo').fill('Compra da distribuidora');
  await dialog.getByRole('button', { name: 'Ajustar estoque' }).click();
  await expect(toast(page, 'Estoque ajustado')).toBeVisible();
  await expect(dialog.getByRole('row').nth(1)).toContainText('Compra da distribuidora');
  await expect(dialog.getByRole('row').nth(1)).toContainText('+48');
  await dialog.getByRole('button', { name: 'Fechar' }).click();

  await expect(row).not.toContainText('Estoque baixo');
});

test('vendedor vê o extrato, mas não ajusta o estoque', async ({ page }) => {
  await login(page, SELLER);
  await page.goto('/produtos');
  await page
    .getByRole('row', { name: /Vodka 1 L/ })
    .getByRole('button', { name: 'Estoque' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('table', { name: /Extrato do estoque/ })).toContainText('Garrafa quebrada');
  await expect(dialog.getByRole('button', { name: 'Ajustar estoque' })).toHaveCount(0);
});
