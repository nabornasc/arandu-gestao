import { expect, type Page, test } from '@playwright/test';
import { ACCOUNTANT, CUSTOMER, login, OWNER } from './helpers.ts';

// Os atalhos só valem depois que o perfil carrega: espera o botão de busca aparecer.
async function ready(page: Page, email: string) {
  await login(page, email);
  await expect(page.getByRole('button', { name: /^Buscar/ })).toBeVisible();
}

test('Ctrl+K abre a busca; Enter abre a ficha do cliente encontrado', async ({ page }) => {
  await ready(page, OWNER);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await expect(dialog.getByRole('searchbox').or(dialog.getByRole('textbox'))).toBeFocused();

  await page.keyboard.type('ana sou');
  const results = dialog.getByRole('list', { name: 'Resultados' });
  const customer = results.getByRole('button').filter({ hasText: 'Cliente' }).filter({ hasText: CUSTOMER });
  await expect(customer).toBeVisible();
  // O cliente vem antes dos documentos dele: Enter abre o primeiro resultado.
  await expect(results.getByRole('button').first()).toHaveClass('active');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/clientes\/\d+\/ficha$/);
});

test('a busca também acha telas e ações; Esc fecha', async ({ page }) => {
  await ready(page, OWNER);
  await page.getByRole('button', { name: /^Buscar/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await page.keyboard.type('novo orcamento');
  await expect(dialog.getByRole('button', { name: /Novo orçamento/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('F4 abre novo orçamento, Alt+X fecha a aba; F6 abre novo pedido', async ({ page }) => {
  await ready(page, OWNER);
  const tabs = page.getByRole('navigation', { name: 'Telas abertas' });

  await page.keyboard.press('F4');
  await expect(page).toHaveURL(/\/orcamentos\/novo$/);
  await expect(tabs.locator('.tab.active')).toContainText('Novo orçamento');
  const before = await tabs.locator('.tab').count();
  // Fora de um campo de texto, Alt+X fecha a aba ativa.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Alt+x');
  await expect(tabs.locator('.tab')).toHaveCount(before - 1);

  await page.keyboard.press('F6');
  await expect(page).toHaveURL(/\/pedidos\/novo$/);
});

test('atalho de criação sem permissão não faz nada', async ({ page }) => {
  await ready(page, ACCOUNTANT);
  const start = page.url();
  await page.keyboard.press('F4');
  await page.keyboard.press('F6');
  await expect(page).toHaveURL(start);
});
