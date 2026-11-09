import { expect, test } from '@playwright/test';
import { capture, login, SELLER } from './helpers.ts';

test('assistente: pergunta, resposta com link para a ajuda, uso do mês e Esc fecha', async ({ page }) => {
  await login(page, SELLER);
  await page.getByRole('button', { name: 'Assistente de IA' }).click();
  const panel = page.getByRole('complementary', { name: 'Pergunte ao assistente' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Sua pergunta')).toBeFocused();

  await panel.getByLabel('Sua pergunta').fill('Como dou baixa numa conta a receber?');
  await page.keyboard.press('Enter');
  await expect(panel.getByText('Resposta de teste para: Como dou baixa numa conta a receber?')).toBeVisible();
  await expect(panel.getByText(/Uso do mês: R\$/)).toBeVisible();
  await capture(page, 'assistente');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Assistente de IA' })).toBeFocused();
});
