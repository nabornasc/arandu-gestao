import { expect, test } from '@playwright/test';
import { CUSTOMER, chooseOption, itemSelect, login, OWNER, openMenuItem, SERVICE } from './helpers.ts';

test.beforeEach(({ page }) => login(page, OWNER));

const addDays = (days: number) => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000 + days * 86_400_000);
  return local.toISOString().slice(0, 10);
};

test('validade em dias e data andam juntas', async ({ page }) => {
  await page.goto('/orcamentos/novo');
  await page.getByLabel('Validade (dias)').fill('15');
  await expect(page.getByLabel('Válido até')).toHaveValue(addDays(15));
  await page.getByLabel('Válido até').fill(addDays(7));
  await expect(page.getByLabel('Validade (dias)')).toHaveValue('7');
});

test('desconto em %: recalcula com os itens e é salvo em R$', async ({ page }) => {
  await page.goto('/orcamentos/novo');
  await chooseOption(page.getByLabel('Cliente'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('100');
  await page.locator('input[name="items.0.quantity"]:visible').fill('2');
  await page.getByLabel('Tipo de desconto').selectOption('percent');
  await page.getByLabel('Desconto (%)').fill('10');
  await expect(page.getByText('= R$ 20,00')).toBeVisible();
  // Mais itens: o desconto em % acompanha o subtotal.
  await page.locator('input[name="items.0.quantity"]:visible').fill('3');
  await expect(page.getByText('= R$ 30,00')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);
  await expect(page.getByLabel('Desconto (R$)')).toHaveValue('30');
});

test('item oculto entra no total, mas não sai no espelho do cliente; grupo duplica', async ({ page }) => {
  await page.goto('/orcamentos/novo');
  await chooseOption(page.getByLabel('Cliente'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('100');
  await page.locator('input[name="items.0.groupName"]:visible').fill('Bar');
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await chooseOption(itemSelect(page, 1), SERVICE);
  await page.locator('input[name="items.1.unitPrice"]:visible').fill('40');
  await page.locator('input[name="items.1.groupName"]:visible').fill('Bar');
  await page.locator('input[name="items.1.hiddenInMirror"]:visible').check();

  await page.getByRole('button', { name: 'Duplicar grupo Bar' }).click();
  await expect(page.locator('input[name="items.2.groupName"]:visible')).toHaveValue('Bar (cópia)');
  await expect(page.locator('input[name="items.3.hiddenInMirror"]:visible')).toBeChecked();
  await page.getByRole('button', { name: 'Remover item 4' }).click();
  await page.getByRole('button', { name: 'Remover item 3' }).click();

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);

  const popup = page.waitForEvent('popup');
  await openMenuItem(page, 'Espelho do cliente');
  const mirror = await popup;
  // Só a linha visível sai; subtotal do grupo e total contam as duas.
  await expect(mirror.locator('table.mirror-items tbody tr').filter({ hasText: SERVICE })).toHaveCount(1);
  await expect(mirror.getByText('Subtotal de Bar')).toBeVisible();
  await expect(mirror.locator('tr.mirror-group-total')).toContainText('R$ 140,00');
});
