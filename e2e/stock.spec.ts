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

test('inventário: conta vários produtos de uma vez e só ajusta o que mudou', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Inventário' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventário' });
  await dialog.getByLabel('Motivo').fill('Inventário de teste');
  await dialog.getByLabel('Filtrar produtos').fill('carvao');
  const coal = dialog.getByRole('row', { name: /Carvão 3 kg/ });
  const current = ((await coal.getByRole('cell').nth(1).textContent()) ?? '').split(' ')[0] ?? '';
  await dialog.getByLabel('Contado: Carvão 3 kg').fill(current.replace(',', '.'));
  await dialog.getByLabel('Filtrar produtos').fill('amendoim');
  await dialog.getByLabel('Contado: Amendoim salgado 150 g').fill('99');
  await expect(dialog.getByRole('status')).toHaveText('2 contado(s), 1 com diferença.');
  await dialog.getByRole('button', { name: 'Registrar inventário' }).click();
  await expect(toast(page, 'Inventário registrado: 1 produto ajustado.')).toBeVisible();

  const peanut = page.getByRole('row', { name: /Amendoim salgado 150 g/ });
  await expect(peanut).toContainText('99');
  await peanut.getByRole('button', { name: 'Estoque' }).click();
  await expect(page.getByRole('dialog').getByRole('row').nth(1)).toContainText('Inventário de teste');
});
