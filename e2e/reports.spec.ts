import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login, OWNER, SELLER } from './helpers.ts';

test('proprietário abre um relatório, filtra o período e exporta em CSV', async ({ page }) => {
  await login(page, OWNER);
  await page.getByRole('link', { name: 'Relatórios', exact: true }).click();
  const catalog = page.getByRole('navigation', { name: 'Relatórios disponíveis' });
  await catalog.getByLabel('Buscar relatório').fill('pedidos');
  await catalog.getByRole('button', { name: 'Pedidos emitidos', exact: true }).click();

  await page.getByLabel(/^Período/).selectOption('all');
  const table = page.getByRole('table', { name: 'Pedidos emitidos' });
  await expect(table.getByRole('row', { name: /Condomínio Jardim das Palmeiras/ })).toBeVisible();
  await expect(table.locator('tfoot')).toContainText('Total');

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^orders-.*\.csv$/);
  const content = await readFile((await file.path()) ?? '', 'utf8');
  expect(content.replace(/^﻿/, '').split('\r\n')[0]).toBe('Número;Data;Cliente;Situação;Total');
});

test('vendedor vê os relatórios de vendas, sem financeiro e sem exportar', async ({ page }) => {
  await login(page, SELLER);
  await page.goto('/relatorios');
  const catalog = page.getByRole('navigation', { name: 'Relatórios disponíveis' });
  await expect(catalog.getByRole('button', { name: 'Orçamentos', exact: true })).toBeVisible();
  await expect(catalog.getByRole('button', { name: 'Contas a pagar', exact: true })).toHaveCount(0);
  await catalog.getByRole('button', { name: 'Orçamentos', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveCount(0);
});
