import { expect, test } from '@playwright/test';
import { capture, login, OWNER, SELLER } from './helpers.ts';

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

test('assistente: consulta de dados com link para a tela e consumo em Configurações', async ({ page }) => {
  await login(page, OWNER);
  await page.getByRole('button', { name: 'Assistente de IA' }).click();
  const panel = page.getByRole('complementary', { name: 'Pergunte ao assistente' });
  await panel.getByLabel('Sua pergunta').fill('Contas vencidas? [ferramenta:contas_a_receber_vencidas]');
  await page.keyboard.press('Enter');
  await panel.getByRole('link', { name: '/contas-a-receber' }).click();
  await expect(page).toHaveURL(/\/contas-a-receber$/);

  await page.goto('/configuracoes');
  const settings = page.getByRole('region', { name: 'Assistente de IA' });
  await expect(settings.getByText(/perguntas? no mês/)).toBeVisible();
  await expect(settings.getByRole('table', { name: 'Consumo por usuário' })).toBeVisible();

  const quota = settings.getByLabel('Limite mensal (R$)');
  // O teto vem do servidor; acima dele, o próprio campo recusa.
  await expect(quota).toHaveAttribute('max', '200');
  await quota.fill('150');
  await settings.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(page.getByText('Limite do assistente atualizado.')).toBeVisible();
  await expect(settings.getByText(/de R\$\s150,00/)).toBeVisible();
  await capture(page, 'assistente-configuracoes');

  // Volta ao padrão para não afetar os outros testes.
  await quota.fill('200');
  await settings.getByRole('button', { name: 'Salvar limite' }).click();
  await expect(settings.getByText(/de R\$\s200,00/)).toBeVisible();
});
