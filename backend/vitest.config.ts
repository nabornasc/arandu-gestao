import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://arandue:arandue@127.0.0.1:5432/arandue_test';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/tests/globalSetup.ts'],
    // Os arquivos compartilham o mesmo banco de teste.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      AI_PROVIDER: 'fake',
      // O bot recebe updates simulados; as chamadas à API do Telegram são interceptadas nos testes.
      TELEGRAM_BOT_TOKEN: '123456:token-de-teste',
      TELEGRAM_WEBHOOK_SECRET: 'segredo-de-teste-do-webhook',
    },
  },
});
