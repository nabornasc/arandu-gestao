import { expect, test } from '@playwright/test';
import { chooseOption, login, OWNER, STOCK_PRODUCT, toast } from './helpers.ts';

const stockOf = async (page: import('@playwright/test').Page) => {
  const products = (await (await page.request.get('/api/products')).json()) as {
    name: string;
    stock: number;
  }[];
  return products.find((row) => row.name === STOCK_PRODUCT)?.stock ?? 0;
};

test('compra: rascunho, receber (estoque e conta a pagar) e cancelar devolvendo o estoque', async ({
  page,
}) => {
  await login(page, OWNER);
  const before = await stockOf(page);
  await page.goto('/compras');
  await page.getByRole('button', { name: 'Nova compra' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova compra' });
  const supplier = dialog.getByLabel('Fornecedor');
  await supplier.selectOption({ index: 1 });
  await chooseOption(dialog.locator('select[name="items.0.productId"]'), STOCK_PRODUCT);
  await dialog.locator('input[name="items.0.quantity"]').fill('24');
  await dialog.locator('input[name="items.0.unitCost"]').fill('2.5');
  await expect(dialog).toContainText('Total da compra: R$ 60,00');
  await dialog.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(toast(page, 'Compra lançada como rascunho.')).toBeVisible();

  const row = page.locator('tbody tr').first();
  await expect(row).toContainText('Rascunho');
  await row.getByRole('button', { name: 'Receber' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Receber compra' }).click();
  await expect(row).toContainText('Recebida');
  expect(await stockOf(page)).toBe(before + 24);
  const code = (await row.locator('td').first().textContent())?.trim() ?? '';
  const expenses = (await (await page.request.get('/api/expenses')).json()) as { description: string }[];
  expect(expenses.some((item) => item.description.startsWith(`Compra ${code}`))).toBe(true);

  await row.getByRole('button', { name: 'Cancelar' }).click();
  const reason = page.getByRole('dialog', { name: /Cancelar a compra/ });
  await reason.getByLabel('Motivo').fill('Mercadoria veio errada');
  await reason.getByRole('button', { name: 'Cancelar compra' }).click();
  await expect(row).toContainText('Cancelado');
  expect(await stockOf(page)).toBe(before);
});
