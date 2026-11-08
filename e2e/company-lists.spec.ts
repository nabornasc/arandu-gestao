import { expect, test } from '@playwright/test';
import { login, OWNER, toast } from './helpers.ts';

test('valor novo na lista vira sugestão no formulário; desativado sai das sugestões', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/configuracoes');
  const lists = page.getByRole('region', { name: 'Listas' });
  await lists.getByLabel('Lista').selectOption('financial_category');
  await lists.getByLabel('Novo valor').fill('Embalagens');
  await lists.getByRole('button', { name: 'Adicionar' }).click();
  await expect(toast(page, 'Valor adicionado')).toBeVisible();
  await expect(lists.getByLabel('Nome: Embalagens')).toBeVisible();

  // A despesa sugere a categoria nova e aceita digitar outra.
  await page.goto('/despesas');
  await page.getByRole('button', { name: 'Novo registro' }).click();
  const dialog = page.getByRole('dialog');
  const category = dialog.getByLabel('Categoria (ex.: Aluguel)');
  const listId = await category.getAttribute('list');
  await expect(page.locator(`datalist[id="${listId}"] option[value="Embalagens"]`)).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Fechar janela' }).click();

  await page.goto('/configuracoes');
  await lists.getByLabel('Lista').selectOption('financial_category');
  await lists
    .getByRole('listitem')
    .filter({ has: page.getByLabel('Nome: Embalagens') })
    .getByRole('button', { name: 'Desativar' })
    .click();
  await expect(toast(page, 'Lista atualizada')).toBeVisible();
  await expect(
    lists.getByRole('listitem').filter({ has: page.getByLabel('Nome: Embalagens') }),
  ).toContainText('Desativado');

  await page.goto('/despesas');
  await page.getByRole('button', { name: 'Novo registro' }).click();
  const newListId = await page
    .getByRole('dialog')
    .getByLabel('Categoria (ex.: Aluguel)')
    .getAttribute('list');
  await expect(page.locator(`datalist[id="${newListId}"] option[value="Embalagens"]`)).toHaveCount(0);
});
