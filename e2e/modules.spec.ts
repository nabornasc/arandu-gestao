import { expect, test } from '@playwright/test';
import { ACCOUNTANT, login, OWNER } from './helpers.ts';

test('menu agrupado por módulos; a página de Vendas mostra o fluxo e os atalhos de criação', async ({
  page,
}) => {
  await login(page, OWNER);
  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await menu.getByRole('link', { name: 'Vendas', exact: true }).click();
  await expect(page).toHaveURL(/\/modulo\/vendas$/);

  const flow = page.getByRole('list', { name: 'Fluxo da venda' });
  await expect(flow.getByRole('link')).toHaveText([
    'CRM',
    'Orçamentos',
    'Vendas e pedidos',
    'Contas a receber',
  ]);

  await page.getByRole('link', { name: 'Novo orçamento' }).click();
  await expect(page).toHaveURL(/\/orcamentos\/novo$/);
});

test('contador vê só os módulos e atalhos que o grupo permite', async ({ page }) => {
  await login(page, ACCOUNTANT);
  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(menu.getByRole('link', { name: 'Administração', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Grupos de acesso' })).toHaveCount(0);

  await menu.getByRole('link', { name: 'Vendas', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Orçamentos', exact: true }).first()).toBeVisible();
  // Só leitura: nenhum atalho de criação.
  await expect(page.getByRole('link', { name: /^Novo/ })).toHaveCount(0);
});
