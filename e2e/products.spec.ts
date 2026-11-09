import { expect, test } from '@playwright/test';
import { login, OWNER, toast } from './helpers.ts';

test('produto com código próprio: copiar começa sem código e com estoque zero; a busca acha pelo código', async ({
  page,
}) => {
  await login(page, OWNER);
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Novo registro' }).click();
  const form = page.getByRole('dialog', { name: 'Novo registro' });
  await form.locator('[name="name"]').fill('Água saborizada limão');
  await form.locator('[name="code"]').fill('AG-500');
  await form.locator('[name="price"]').fill('4');
  await form.locator('[name="stock"]').fill('30');
  await form.getByRole('button', { name: 'Criar registro' }).click();
  await expect(toast(page, 'Registro criado')).toBeVisible();

  const row = page.getByRole('row', { name: /Água saborizada limão/ }).first();
  await expect(row.getByRole('cell', { name: 'AG-500' })).toBeVisible();

  await row.getByRole('button', { name: 'Copiar' }).click();
  const copy = page.getByRole('dialog', { name: 'Copiar registro' });
  await expect(copy.locator('[name="name"]')).toHaveValue('Água saborizada limão (cópia)');
  await expect(copy.locator('[name="code"]')).toHaveValue('');
  await expect(copy.locator('[name="price"]')).toHaveValue('4');
  await expect(copy.locator('[name="stock"]')).toHaveValue('0');
  await copy.locator('[name="name"]').fill('Água saborizada uva');
  await copy.locator('[name="code"]').fill('AG-500');
  await copy.getByRole('button', { name: 'Criar registro' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Já existe um produto com esse código.' }),
  ).toBeVisible();
  await copy.locator('[name="code"]').fill('AG-1500');
  await copy.getByRole('button', { name: 'Criar registro' }).click();
  await expect(toast(page, 'Registro criado')).toBeVisible();
  await expect(page.getByRole('row', { name: /Água saborizada uva/ })).toContainText('AG-1500');

  await page.keyboard.press('Control+k');
  await page.keyboard.type('ag-15');
  await expect(
    page.getByRole('dialog', { name: 'Buscar' }).getByRole('button', { name: /Água saborizada uva/ }),
  ).toBeVisible();
});
