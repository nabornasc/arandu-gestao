import { expect, test } from '@playwright/test';
import { login, OWNER } from './helpers.ts';

test('contas a pagar: a lista pagina no servidor e os totais contam todo o filtro', async ({ page }) => {
  await login(page, OWNER);
  const tag = `Lote ${Date.now().toString().slice(-6)}`;
  for (let index = 0; index < 27; index++) {
    const response = await page.request.post('/api/expenses', {
      data: {
        description: `${tag} gelo ${index + 1}`,
        category: 'Insumos',
        amount: 10,
        expenseDate: '2026-11-05',
        status: 'pending',
      },
    });
    expect(response.ok()).toBe(true);
  }

  await page.goto('/despesas');
  await page.getByLabel('Descrição, categoria ou fornecedor').fill(tag.toLowerCase());
  const pagination = page.getByRole('navigation', { name: 'Paginação' });
  await expect(pagination).toContainText('1–25 de 27');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  // O total soma as 27 despesas, não só as 25 da página.
  await expect(page.locator('.list-totals')).toContainText('R$ 270,00');

  await pagination.getByRole('button', { name: 'Próxima' }).click();
  await expect(pagination).toContainText('26–27 de 27');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  // Mudar o filtro volta para a primeira página.
  await page.getByLabel('Descrição, categoria ou fornecedor').fill(`${tag} gelo 13`);
  await expect(pagination).toContainText('Página 1 de 1');
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await page.getByLabel('Descrição, categoria ou fornecedor').fill(tag);
  await pagination.getByLabel('Por página').selectOption('50');
  await expect(page.locator('tbody tr')).toHaveCount(27);
});
