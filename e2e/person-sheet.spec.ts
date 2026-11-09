import { expect, test } from '@playwright/test';
import { CUSTOMER, capture, login, OWNER } from './helpers.ts';

test('ficha cadastral: abre em outra guia, em A4, com os dados do cadastro', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/clientes');
  await page.getByRole('button', { name: `Ações: ${CUSTOMER}` }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('menuitem', { name: 'Imprimir ficha cadastral' }).click();
  const sheet = await popup;
  await expect(sheet).toHaveURL(/\/impressao\/cadastro\/\d+$/);
  await expect(sheet.getByRole('heading', { name: 'Ficha cadastral', level: 1 })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Identificação' })).toBeVisible();
  await expect(sheet.locator('.mirror-sheet')).toContainText(CUSTOMER);
  await expect(sheet.getByRole('button', { name: /Imprimir/ })).toBeVisible();
  await expect(sheet).toHaveTitle(`Ficha cadastral - ${CUSTOMER}`);
  await capture(sheet, 'ficha-cadastral');
});
