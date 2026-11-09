import { expect, test } from '@playwright/test';
import { CUSTOMER, chooseOption, itemSelect, login, OWNER, SERVICE } from './helpers.ts';

test('ordem de compra do cliente: informada no pedido, aparece na lista e acha pelo filtro', async ({
  page,
}) => {
  await login(page, OWNER);
  await page.goto('/pedidos/novo');
  await chooseOption(page.locator('select[name="customerId"]:visible'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.getByLabel('Ordem de compra (nº)').fill('OC-4412');
  await page.getByRole('button', { name: 'Criar pedido' }).click();
  await expect(page).toHaveURL(/\/pedidos\/\d+$/);
  await expect(page.getByLabel('Ordem de compra (nº)')).toHaveValue('OC-4412');

  await page.goto('/pedidos');
  await page.getByLabel('Cliente ou número').filter({ visible: true }).fill('oc-4412');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('OC OC-4412');
});
