import { expect, test } from '@playwright/test';
import { capture, login, OWNER, SELLER } from './helpers.ts';

const ARTICLE = 'Criar e enviar um orçamento';

test('botão "?" abre a ajuda da tela sem fechar o que está aberto', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/orcamentos/novo');
  await page.getByRole('button', { name: 'Ajuda desta tela (F1)' }).click();
  const panel = page.getByRole('complementary', { name: ARTICLE });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Passo a passo' })).toBeVisible();
  await expect(panel.locator('video')).toHaveCount(3);
  await expect(panel.getByRole('button', { name: /^Pausar vídeo: / }).first()).toBeVisible();
  await capture(page, 'ajuda-painel');

  // Vídeo ampliado: abre por cima do painel, e o Esc fecha só ele.
  await panel
    .getByRole('button', { name: /^Ampliar vídeo: / })
    .first()
    .click();
  const zoom = page.getByRole('dialog');
  await expect(zoom).toBeVisible();
  await expect(zoom.getByRole('button', { name: 'Tela cheia' })).toBeVisible();
  const box = await zoom.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.width >= viewport.width * 0.75).toBeTruthy();
  await capture(page, 'ajuda-video-ampliado');
  await page.keyboard.press('Escape');
  await expect(zoom).toBeHidden();
  await expect(panel).toBeVisible();
  // Clicar no próprio vídeo também amplia.
  await panel.locator('video').first().click();
  await expect(zoom).toBeVisible();
  await zoom.getByRole('button', { name: 'Fechar vídeo ampliado' }).click();
  await expect(zoom).toBeHidden();
  await expect(panel).toBeVisible();
  // A tela de trás continua aberta.
  await expect(page.getByRole('heading', { name: 'Novo orçamento', level: 2 })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ajuda desta tela (F1)' })).toBeFocused();
  await page.keyboard.press('F1');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Fechar ajuda' }).click();
  await expect(panel).toBeHidden();
});

test('tela sem artigo aponta para a central, e a central busca e abre o artigo', async ({ page }) => {
  await login(page, SELLER);
  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Ajuda desta tela (F1)' }).click();
  const panel = page.getByRole('complementary', { name: 'Esta tela ainda não tem artigo' });
  await expect(panel).toBeVisible();
  await panel.getByRole('link', { name: 'Central de ajuda' }).click();
  await expect(page).toHaveURL(/\/ajuda$/);
  await expect(panel).toBeHidden();

  await page.getByLabel('Buscar na ajuda').fill('xyz inexistente');
  await expect(page.getByText('Nenhum artigo encontrado.')).toBeVisible();
  await page.getByLabel('Buscar na ajuda').fill('enviar orcamento');
  await expect(page.getByRole('heading', { name: 'Vendas', level: 3 })).toBeVisible();
  await capture(page, 'ajuda-central');
  await page.getByRole('link', { name: ARTICLE }).click();
  await expect(page).toHaveURL(/\/ajuda\/vendas\/criar-e-enviar-orcamento$/);
  await expect(page.getByRole('heading', { name: ARTICLE, level: 2 })).toBeVisible();

  // Link interno do artigo abre a tela na área de trabalho.
  await page.locator('.manual-article').getByRole('link', { name: 'Lista de orçamentos' }).click();
  await expect(page).toHaveURL(/\/orcamentos$/);
});

test('o "?" do menu lateral leva à central de ajuda', async ({ page }) => {
  await login(page, OWNER);
  await page.getByRole('link', { name: 'Central de ajuda' }).click();
  await expect(page).toHaveURL(/\/ajuda$/);
  await expect(page.getByRole('heading', { name: 'Central de ajuda', level: 2 })).toBeVisible();
});
