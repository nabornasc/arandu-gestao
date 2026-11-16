import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://arandue:arandue@127.0.0.1:5432/arandue_test';
// A aplicação roda como arandue_app, igual à produção: sem ser dona das tabelas, com os GRANTs e as
// policies de scripts/supabase-seguranca.sql. A conexão entra como dono e troca de papel na abertura.
const APP_DATABASE_URL = `${TEST_DATABASE_URL}${TEST_DATABASE_URL.includes('?') ? '&' : '?'}options=-c%20role%3Darandue_app`;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/tests/globalSetup.ts'],
    // Os arquivos compartilham o mesmo banco de teste.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: APP_DATABASE_URL,
      // Conexão de dono, só para os testes que criam trigger ou constraint temporária (helpers.ts).
      TEST_OWNER_DATABASE_URL: TEST_DATABASE_URL,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      AI_PROVIDER: 'fake',
      // O bot recebe updates simulados; as chamadas à API do Telegram são interceptadas nos testes.
      TELEGRAM_BOT_TOKEN: '123456:token-de-teste',
      TELEGRAM_WEBHOOK_SECRET: 'segredo-de-teste-do-webhook',
      // Anexos no disco, numa pasta só dos testes (nunca o Supabase).
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      UPLOADS_DIR: '.uploads-test',
    },
  },
});
