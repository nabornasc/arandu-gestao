import { expect, test } from '@playwright/test';
import { ACCOUNTANT, login, OWNER } from './helpers.ts';

const blockTitles = (page: import('@playwright/test').Page) =>
  page.locator('.dashboard-block .block-controls strong').allTextContents();

test('personalizar: adiciona, move, muda o tamanho, remove e salva; restaurar volta ao padrão', async ({
  page,
}) => {
  await login(page, OWNER);
  await expect(page.getByRole('region', { name: 'Vendas por mês' })).toBeVisible();

  await page.getByRole('button', { name: 'Personalizar' }).click();
  await page.getByLabel('Adicionar bloco').selectOption({ label: 'CRM' });
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  // CRM entrou por último; sobe uma posição.
  expect((await blockTitles(page)).at(-1)).toBe('CRM');
  await page.getByRole('button', { name: 'Mover CRM para antes' }).click();
  expect((await blockTitles(page)).at(-2)).toBe('CRM');
  await page.getByLabel('Tamanho de Faturamento do mês').selectOption('M');
  await page.getByRole('button', { name: 'Remover Saldo atual' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Visão geral salva.' })).toBeVisible();

  // Depois de recarregar, o layout continua.
  await page.reload();
  await expect(page.getByRole('region', { name: 'CRM' })).toBeVisible();
  await expect(page.locator('.dashboard-block.size-M').first()).toContainText('Faturamento do mês');
  await expect(page.getByText('Saldo atual')).toHaveCount(0);

  await page.getByRole('button', { name: 'Personalizar' }).click();
  await page.getByRole('button', { name: 'Restaurar padrão' }).click();
  await expect(page.getByText('Saldo atual')).toBeVisible();
  await expect(page.getByRole('region', { name: 'CRM' })).toHaveCount(0);
});

test('contador vê só os blocos dos módulos que pode ver', async ({ page }) => {
  await login(page, ACCOUNTANT);
  await page.getByRole('button', { name: 'Personalizar' }).click();
  const options = await page.getByLabel('Adicionar bloco').locator('option').allTextContents();
  // O contador lê orçamentos, mas não o CRM: o bloco do CRM nem é oferecido.
  expect(options).toContain('Orçamentos aguardando');
  expect(options).not.toContain('CRM');
});
