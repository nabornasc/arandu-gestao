import { expect, test } from '@playwright/test';
import { CUSTOMER, chooseOption, itemSelect, login, OWNER, SERVICE, toast } from './helpers.ts';

test('entrega: previsão no pedido, marcar como entregue pelo menu e situação na lista', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/pedidos/novo');
  await chooseOption(page.locator('select[name="customerId"]:visible'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.getByLabel('Previsão de entrega').fill('2030-01-15');
  await page.getByRole('button', { name: 'Criar pedido' }).click();
  await expect(page).toHaveURL(/\/pedidos\/\d+$/);
  const heading = (await page.getByRole('heading', { name: /Pedido #\d+/ }).textContent()) ?? '';
  const code = heading.match(/#\d+/)?.[0] ?? '';

  await page.goto('/pedidos');
  await page.getByLabel('Cliente ou número').filter({ visible: true }).fill(code);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('entrega 15/01/2030');

  await page.getByRole('button', { name: new RegExp(`Ações: pedido ${code}`) }).click();
  await page.getByRole('menuitem', { name: 'Marcar como entregue' }).click();
  await expect(toast(page, `Pedido ${code} entregue.`)).toBeVisible();
  await expect(page.locator('tbody tr')).toContainText('entregue');

  await page.getByRole('button', { name: new RegExp(`Ações: pedido ${code}`) }).click();
  await page.getByRole('menuitem', { name: 'Desfazer entrega' }).click();
  await expect(page.locator('tbody tr')).toContainText('entrega 15/01/2030');
});
