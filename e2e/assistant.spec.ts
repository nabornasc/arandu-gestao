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

test('assistente: anexo de imagem e cadastro proposto que só grava ao confirmar', async ({ page }) => {
  await login(page, OWNER);
  await page.getByRole('button', { name: 'Assistente de IA' }).click();
  const panel = page.getByRole('complementary', { name: 'Pergunte ao assistente' });

  // Imagem de 1x1 pixel: o navegador reduz e converte para JPEG antes de enviar.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await panel.getByLabel('Arquivo para o assistente').setInputFiles({
    name: 'documento.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(panel.getByText('Anexo: documento.png')).toBeVisible();
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await expect(panel.getByText(/Resposta de teste para: Leia este documento/)).toBeVisible();

  const name = `Cliente IA ${Date.now()}`;
  await panel
    .getByLabel('Sua pergunta')
    .fill(`Cadastre [ferramenta:propor_cadastro_cliente {"name":"${name}","city":"Cuiabá","state":"MT"}]`);
  await page.keyboard.press('Enter');
  const card = panel.getByRole('group', { name: 'Ação para confirmar' });
  await expect(card.getByText(`Nome: ${name}`)).toBeVisible();
  await expect(card.getByText('Cidade: Cuiabá/MT')).toBeVisible();
  await capture(page, 'assistente-acao');

  await card.getByRole('button', { name: 'Confirmar' }).click();
  await expect(card.getByText(`Cliente ${name} cadastrado.`)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Confirmar' })).toBeHidden();
  await card.getByRole('link', { name: 'Abrir' }).click();
  await expect(page).toHaveURL(/\/clientes\/\d+\/ficha$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
});

test('assistente: ditado pelo microfone preenche a pergunta para conferir', async ({ page }) => {
  // Reconhecimento de voz falso: devolve uma frase pronta, sem microfone de verdade.
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: 'quanto faturei este mês' }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await login(page, SELLER);
  await page.getByRole('button', { name: 'Assistente de IA' }).click();
  const panel = page.getByRole('complementary', { name: 'Pergunte ao assistente' });
  await panel.getByRole('button', { name: 'Falar a pergunta' }).click();
  await expect(panel.getByLabel('Sua pergunta')).toHaveValue('quanto faturei este mês');
  await expect(panel.getByRole('button', { name: 'Falar a pergunta' })).toBeVisible();
});
