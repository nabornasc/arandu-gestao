import { defineConfig, devices } from '@playwright/test';

// Os testes rodam isolados do desenvolvimento: banco e portas próprios, recriados a cada execução.
const API_PORT = 3101;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://arandue:arandue@127.0.0.1:5432/arandue_e2e';

export default defineConfig({
  testDir: 'e2e',
  // Os testes dividem o mesmo banco, e a numeração dos documentos é por empresa.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // No CI, o relatório do GitHub mostra o teste que falhou ou que só passou na segunda tentativa.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Cuiaba',
    // Sem limite por ação, um clique travado só aparece como tempo esgotado do teste inteiro.
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    // Roteiros do manual: no CI rodam como teste; com MANUAL_RECORD=1, gravam a mídia.
    {
      name: 'manual',
      testDir: 'manual/roteiros',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Campos de data no formato brasileiro, como o usuário vê.
        launchOptions: { args: ['--lang=pt-BR'] },
      },
    },
  ],
  webServer: [
    {
      command: 'node e2e/setup-db.ts && npm start -w backend',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL,
        ALLOWED_ORIGINS: WEB_URL,
        AI_PROVIDER: 'fake',
        // O backend lê o backend/.env: vazio aqui desliga o bot real do Telegram nos testes.
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_WEBHOOK_SECRET: '',
      },
    },
    {
      command: `npm run dev -w frontend -- --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { E2E_API_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
