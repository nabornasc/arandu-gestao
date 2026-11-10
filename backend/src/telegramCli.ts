// Bot do Telegram pela linha de comando. Lê TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET do .env.
//   npm run telegram -w backend -- polling          desenvolvimento: recebe as mensagens sem webhook
//   npm run telegram -w backend -- webhook <URL>    produção: aponta o bot para <URL>/api/telegram/webhook
//   npm run telegram -w backend -- info             mostra o webhook cadastrado e o último erro
import { config } from './config.ts';
import { telegramBot } from './services/telegram.ts';

const [command, argument] = process.argv.slice(2);
const bot = telegramBot();

if (command === 'polling') {
  // O Telegram não entrega por polling enquanto houver webhook: apaga antes. Volte com "webhook".
  await bot.api.deleteWebhook();
  bot.catch((error) => console.error('[telegram]', error.message));
  console.log('Bot recebendo mensagens. Ctrl+C para parar.');
  await bot.start();
} else if (command === 'webhook') {
  if (!argument?.startsWith('https://')) throw new Error('Informe o endereço do sistema com https://');
  if (!config.TELEGRAM_WEBHOOK_SECRET) throw new Error('Defina TELEGRAM_WEBHOOK_SECRET no .env.');
  const url = `${argument.replace(/\/+$/, '')}/api/telegram/webhook`;
  await bot.api.setWebhook(url, {
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  await bot.api.setMyCommands([
    { command: 'start', description: 'Como usar o assistente' },
    { command: 'vincular', description: 'Vincular sua conta com o código de Meu perfil' },
    { command: 'sair', description: 'Desvincular sua conta' },
  ]);
  console.log(`Webhook cadastrado: ${url}`);
} else if (command === 'info') {
  const info = await bot.api.getWebhookInfo();
  console.log({
    url: info.url || '(nenhum)',
    pendentes: info.pending_update_count,
    ultimoErro: info.last_error_message ?? null,
  });
} else {
  console.log('Use: polling | webhook <URL> | info');
}
