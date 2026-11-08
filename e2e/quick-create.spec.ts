import { expect, test } from '@playwright/test';
import { itemSelect, login, OWNER, SELLER } from './helpers.ts';

test('no orçamento, cadastra cliente e produto sem sair da tela e já deixa os dois escolhidos', async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-6);
  await login(page, OWNER);
  await page.goto('/orcamentos/novo');

  await page.getByRole('button', { name: 'Novo cliente' }).click();
  const customerDialog = page.getByRole('dialog', { name: 'Novo cliente' });
  await customerDialog.getByLabel('Nome').fill(`Bar da Esquina ${suffix}`);
  await customerDialog.getByLabel('Celular').fill('(11) 98888-7777');
  // Enter envia só a janela: o orçamento continua aberto e sem salvar.
  await customerDialog.getByLabel('Nome').press('Enter');
  await expect(customerDialog).toBeHidden();
  await expect(page).toHaveURL(/\/orcamentos\/novo$/);
  await expect(page.getByLabel('Cliente').locator('option:checked')).toHaveText(`Bar da Esquina ${suffix}`);

  await page.getByRole('button', { name: 'Novo produto' }).click();
  const productDialog = page.getByRole('dialog', { name: 'Novo produto' });
  await productDialog.getByLabel('Nome').fill(`Gelo em cubos 5 kg ${suffix}`);
  await productDialog.getByLabel('Preço de venda (R$)').fill('12.5');
  await productDialog.getByRole('button', { name: 'Criar registro' }).click();
  await expect(productDialog).toBeHidden();
  await expect(page).toHaveURL(/\/orcamentos\/novo$/);
  await expect(itemSelect(page, 0).locator('option:checked')).toContainText(`Gelo em cubos 5 kg ${suffix}`);
  await expect(page.locator('input[name="items.0.unitPrice"]:visible')).toHaveValue('12.5');

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);
});

test('no pedido, o produto novo entra numa linha nova quando as linhas já estão preenchidas', async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-6);
  await login(page, OWNER);
  await page.goto('/pedidos/novo');
  await page.getByRole('button', { name: 'Novo produto' }).click();
  let dialog = page.getByRole('dialog', { name: 'Novo produto' });
  await dialog.getByLabel('Nome').fill(`Carvão 3 kg ${suffix}`);
  await dialog.getByLabel('Preço de venda (R$)').fill('20');
  await dialog.getByRole('button', { name: 'Criar registro' }).click();
  await expect(itemSelect(page, 0).locator('option:checked')).toContainText(`Carvão 3 kg ${suffix}`);
  // Salvar o produto não salva o pedido.
  await expect(page).toHaveURL(/\/pedidos\/novo$/);

  await page.getByRole('button', { name: 'Novo produto' }).click();
  dialog = page.getByRole('dialog', { name: 'Novo produto' });
  await dialog.getByLabel('Nome').fill(`Copo descartável ${suffix}`);
  await dialog.getByLabel('Preço de venda (R$)').fill('5');
  await dialog.getByRole('button', { name: 'Criar registro' }).click();
  await expect(itemSelect(page, 1).locator('option:checked')).toContainText(`Copo descartável ${suffix}`);
  await expect(itemSelect(page, 0).locator('option:checked')).toContainText(`Carvão 3 kg ${suffix}`);
});

test('o vendedor cadastra cliente pelo orçamento, mas não vê o cadastro rápido de produto', async ({
  page,
}) => {
  await login(page, SELLER);
  await page.goto('/orcamentos/novo');
  await expect(page.getByRole('button', { name: 'Novo cliente' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo produto' })).toHaveCount(0);
});
