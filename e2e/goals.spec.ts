import { expect, test } from '@playwright/test';
import { login, OWNER, SELLER } from './helpers.ts';

test('metas: define a meta da empresa e de um vendedor e acompanha na visão geral', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/metas');
  const form = page.getByRole('form', { name: 'Definir metas' });
  await form.getByLabel('Empresa').fill('100000');
  await form.getByRole('spinbutton').nth(1).fill('50000');
  await form.getByRole('button', { name: 'Salvar metas' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Metas salvas.' })).toBeVisible();

  const progress = page.getByRole('region', { name: 'Andamento' });
  await expect(progress).toContainText('de R$ 100.000,00');
  await expect(progress).toContainText('No ritmo atual, o mês fecha em');

  await page.goto('/');
  const block = page.getByRole('region', { name: 'Metas do mês' });
  await expect(block).toContainText('de R$ 100.000,00');
  await expect(block.getByRole('meter').first()).toBeVisible();
});

test('vendedor não vê metas (não tem a visão geral)', async ({ page }) => {
  await login(page, SELLER);
  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(menu.getByRole('link', { name: 'Metas de venda' })).toHaveCount(0);
});
