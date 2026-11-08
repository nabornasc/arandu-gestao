import { expect, test } from '@playwright/test';
import { login, OWNER, PASSWORD, toast } from './helpers.ts';

test('contas a pagar: pagamento parcial, estorno com senha e pagamento em lote', async ({ page }) => {
  await login(page, OWNER);
  const tag = `Fornecedor ${Date.now().toString().slice(-6)}`;
  for (const [suffix, amount] of [
    ['gelo', 100],
    ['copos', 30],
  ] as const) {
    const response = await page.request.post('/api/expenses', {
      data: {
        description: `${tag} ${suffix}`,
        category: 'Insumos',
        amount,
        expenseDate: '2030-01-10',
        status: 'pending',
      },
    });
    expect(response.ok()).toBe(true);
  }

  await page.goto('/despesas');
  await page.getByLabel('Descrição, categoria ou fornecedor').fill(tag.toLowerCase());
  const row = page.locator('tbody tr').filter({ hasText: `${tag} gelo` });
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await row.getByRole('button', { name: 'Baixas' }).click();
  const dialog = page.getByRole('dialog', { name: `${tag} gelo` });
  await dialog.getByLabel('Valor pago (R$)').fill('40');
  await dialog.getByRole('button', { name: 'Registrar pagamento' }).click();
  await expect(toast(page, 'Pagamento registrado.')).toBeVisible();
  await expect(row).toContainText('Parcial');
  await expect(dialog).toContainText('em aberto R$ 60,00');

  await dialog.getByRole('button', { name: 'Estornar' }).click();
  const reverse = page.getByRole('dialog', { name: /Estornar a baixa/ });
  await reverse.getByLabel('Motivo').fill('Lançado por engano');
  await reverse.getByLabel('Sua senha de login').fill(PASSWORD);
  await reverse.getByRole('button', { name: 'Estornar baixa' }).click();
  await expect(toast(page, 'Baixa estornada.')).toBeVisible();
  await expect(row).not.toContainText('Parcial');
  await dialog.getByRole('button', { name: 'Fechar janela' }).click();

  await page.getByRole('button', { name: 'Pagar em lote' }).click();
  const batch = page.getByRole('dialog', { name: 'Pagar em lote' });
  for (const box of await batch.getByRole('checkbox').all()) await box.check();
  await expect(batch).toContainText('Total: R$ 130,00');
  await batch.getByRole('button', { name: 'Pagar selecionadas' }).click();
  await expect(toast(page, '2 contas pagas.')).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: 'Pago' })).toHaveCount(2);
});
