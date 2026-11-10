// Teste do pacote da API como vai para a Vercel: o esbuild junta tudo num arquivo e isso já quebrou
// bibliotecas que passam nos testes comuns (o bot do Telegram travava só no pacote).
// Gera o pacote com as mesmas opções do build, sobe um Telegram falso local e confere que o grammY de
// dentro do pacote consegue chamar a API. Não usa rede nem banco.
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { apiBuildOptions } from './esbuild-api.mjs';

// Dentro de node_modules, para o import do argon2 (fora do pacote) ser encontrado.
const dir = join('node_modules', '.cache', 'pacote-api');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
const outfile = join(dir, 'index.mjs');

await build({
  ...apiBuildOptions,
  // O ponto de entrada da Vercel e o Bot do mesmo pacote: os nomes ficam como no arquivo publicado.
  stdin: {
    contents: "export { default } from './backend/src/vercel.ts';\nexport { Bot } from 'grammy';\n",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile,
  logLevel: 'error',
});

const telegram = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      request.url?.endsWith('/getMe')
        ? { ok: true, result: { id: 1, is_bot: true, first_name: 'Teste', username: 'teste_bot' } }
        : { ok: false, error_code: 404, description: 'Not Found' },
    ),
  );
});
telegram.listen(0, '127.0.0.1');
await once(telegram, 'listening');
const { port } = telegram.address();

// A configuração é validada ao carregar o pacote; nada aqui conecta no banco.
process.env.DATABASE_URL ??= 'postgres://teste:teste@127.0.0.1:1/teste';
process.env.NODE_ENV = 'production';
const bundle = await import(pathToFileURL(outfile).href);
if (typeof bundle.default !== 'function') throw new Error('O pacote não exporta o handler da Vercel.');

const bot = new bundle.Bot('123:teste', {
  client: { apiRoot: `http://127.0.0.1:${port}`, timeoutSeconds: 5 },
});
let failure = null;
const timer = setTimeout(() => {
  console.error('Falhou: o grammY do pacote não respondeu em 8 s (ficou repetindo a chamada).');
  process.exit(1);
}, 8000);
try {
  await bot.init();
} catch (error) {
  failure = error;
}
clearTimeout(timer);
telegram.close();
if (failure || bot.botInfo.username !== 'teste_bot') {
  console.error('Falhou: o grammY do pacote não chamou a API do Telegram.', failure?.message ?? '');
  process.exit(1);
}
console.log('Pacote da API ok: o bot do Telegram chama a API de dentro do pacote.');
process.exit(0);
