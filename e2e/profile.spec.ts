import { expect, test } from '@playwright/test';
import { login, SELLER } from './helpers.ts';

test('meu perfil: abre pelo nome no topo, mostra os dados e a seção do Telegram', async ({ page }) => {
  await login(page, SELLER);
  await page.getByRole('button', { name: /^Meu perfil:/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('MEU PERFIL')).toBeVisible();
  await expect(dialog.getByText(SELLER)).toBeVisible();
  // Sem o token do bot no ambiente de teste, a seção explica que o Telegram não está configurado.
  await expect(dialog.getByRole('heading', { name: 'Telegram' })).toBeVisible();
  await expect(dialog.getByText('O bot do Telegram ainda não foi configurado neste sistema.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toBeHidden();
});
