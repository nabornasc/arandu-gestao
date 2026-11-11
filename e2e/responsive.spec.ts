import { expect, test } from '@playwright/test';
import { login, OWNER } from './helpers.ts';

// Celular e tablet: nenhuma tela passa da largura (rolar para o lado só dentro das tabelas).
const ROUTES = [
  '/',
  '/crm',
  '/orcamentos',
  '/pedidos',
  '/contas-a-receber',
  '/produtos',
  '/clientes',
  '/configuracoes',
];

for (const width of [360, 768]) {
  test.describe(`tela de ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: width < 800, hasTouch: width < 800 });

    test('sem estouro horizontal', async ({ page }) => {
      await login(page, OWNER);
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} passa ${overflow}px da tela em ${width}px`).toBeLessThanOrEqual(1);
      }
    });
  });
}
