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

test('no celular, o menu rola até a última opção', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await login(page, OWNER);
  await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
  const sidebar = page.locator('.sidebar.open');
  await expect(sidebar).toBeVisible();
  // O conteúdo passa da altura da tela e o menu rola por dentro.
  const { scrollHeight, clientHeight } = await sidebar.evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  const last = page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await sidebar.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});
