import { expect, test } from '@playwright/test';
import { CUSTOMER, login, OWNER, SERVICE } from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiro do artigo docs/manual/vendas/criar-e-enviar-orcamento.md.
useRecording();

test('manual: criar e enviar um orçamento', async ({ page }) => {
  const scene = await Scene.open(page, 'vendas/criar-e-enviar-orcamento');
  await login(page, OWNER);
  await page.goto('/orcamentos');
  await expect(page.getByRole('heading', { name: 'Orçamentos', level: 1 })).toBeVisible();
  // O vídeo começa com a lista já carregada.
  await expect(page.getByText('Carregando...')).toHaveCount(0);
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('vendas/orcamento-criar', 'Clique em Novo orçamento', () =>
    scene.click(page.getByRole('button', { name: 'Novo orçamento' }).first()),
  );
  await scene.step('vendas/orcamento-criar', 'Escolha o cliente', () =>
    scene.select(page.locator('select[name="customerId"]:visible'), CUSTOMER),
  );
  await scene.step('vendas/orcamento-criar', 'Escolha o item e a quantidade', async () => {
    await scene.select(page.locator('select[name="items.0.productId"]:visible'), SERVICE);
    await scene.fill(page.locator('input[name="items.0.quantity"]:visible'), '2');
  });

  await scene.step('vendas/orcamento-salvar', 'Clique em Salvar', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar' }));
    await expect(page.getByRole('heading', { name: /Orçamento #\d+/ })).toBeVisible();
  });

  await scene.step('vendas/orcamento-enviar', 'Abra o menu ⋯ e escolha Enviar ao cliente', async () => {
    await scene.click(page.getByRole('button', { name: /^Ações:/ }));
    await scene.click(page.getByRole('menuitem', { name: 'Enviar ao cliente', exact: true }));
    await expect(page.getByRole('heading', { name: /Orçamento #\d+ Enviado/ })).toBeVisible();
  });
  await scene.step('vendas/orcamento-enviar', 'O espelho do cliente fica no mesmo menu', async () => {
    await scene.click(page.getByRole('button', { name: /^Ações:/ }));
    await expect(page.getByRole('menuitem', { name: 'Espelho do cliente', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await scene.finish();
});
