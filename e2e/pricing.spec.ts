import { expect, test } from '@playwright/test';
import { chooseOption, login, OWNER, SELLER, STOCK_PRODUCT, toast } from './helpers.ts';

test('precificação: preço sugerido pelo markup e aplicado ao produto', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/precificacao');
  await chooseOption(page.getByLabel('Produto (opcional)'), STOCK_PRODUCT);
  await page.getByLabel('Custo unitário (R$)').fill('10');
  await page.getByLabel('Faturamento médio por mês (R$)').fill('10000');
  // Só as despesas digitadas, para a conta ficar conhecida: rateio 20%, mais 10% e 20%.
  for (const box of await page.locator('input[name="fixedCategory"]').all()) await box.uncheck();
  await page.getByLabel('Outras despesas fixas (R$ por mês)').fill('2000');
  await page.getByLabel('Custos da venda (% do preço)').fill('10');
  await page.getByLabel('Margem de lucro desejada (%)').fill('20');

  const result = page.getByRole('region', { name: 'Resultado' });
  await expect(result.locator('.pricing-price')).toHaveText('R$ 20,00');
  await expect(result).toContainText('R$ 5.000,00 por mês ou 250 unidades');

  await result.getByRole('button', { name: /^Aplicar R\$ 20,00/ }).click();
  await expect(toast(page, 'Preço do produto atualizado.')).toBeVisible();
  await expect(result.getByRole('heading', { name: 'Preço atual: R$ 20,00' })).toBeVisible();

  // Margem impossível: aviso no lugar do preço.
  await page.getByLabel('Margem de lucro desejada (%)').fill('80');
  await expect(result.getByRole('alert')).toContainText('chega a 100%');
});

test('vendedor sem acesso a custos não vê a precificação no menu', async ({ page }) => {
  await login(page, SELLER);
  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(menu.getByRole('link', { name: 'Precificação' })).toHaveCount(0);
});
