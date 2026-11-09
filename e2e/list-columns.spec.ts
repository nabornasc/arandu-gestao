import { expect, test } from '@playwright/test';
import { ACCOUNTANT, login, OWNER } from './helpers.ts';

test('colunas da lista: esconder fica guardado para o usuário e "Mostrar todas" volta', async ({
  page,
  context,
}) => {
  await login(page, OWNER);
  await page.goto('/pedidos');
  const header = page.locator('thead');
  await expect(header).toContainText('Itens');

  await page.locator('.column-picker summary').click();
  const items = page.getByRole('group', { name: 'Colunas visíveis' }).getByLabel('Itens');
  await items.click();
  await expect(items).not.toBeChecked();
  await expect(header).not.toContainText('Itens');
  await expect(page.locator('.column-picker summary')).toContainText('1 ocultas');

  // Continua escondida depois de recarregar.
  await page.reload();
  await expect(page.locator('thead')).toContainText('Cliente');
  await expect(page.locator('thead')).not.toContainText('Itens');

  // Outro usuário vê a lista completa.
  const other = await context.browser()?.newContext();
  if (other) {
    const otherPage = await other.newPage();
    await login(otherPage, ACCOUNTANT);
    await otherPage.goto('/pedidos');
    await expect(otherPage.locator('thead')).toContainText('Itens');
    await other.close();
  }

  await page.locator('.column-picker summary').click();
  await page.getByRole('button', { name: 'Mostrar todas' }).click();
  await expect(page.locator('thead')).toContainText('Itens');
});
