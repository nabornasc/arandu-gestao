// Opções do esbuild para a API na Vercel, usadas pelo build e pelo teste do pacote.
export const apiBuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Binário nativo: não entra no pacote e é copiado à parte.
  external: ['@node-rs/argon2'],
  // Sem isto, o esbuild renomeia classes que colidem com globais (AbortSignal vira AbortSignal2), e
  // bibliotecas que conferem o nome da classe quebram: o node-fetch do grammY recusava o signal e o
  // bot do Telegram ficava repetindo a chamada até a função encerrar.
  keepNames: true,
  // Dependências em CommonJS usam require, __dirname e __filename, que não existem em módulos ES.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirnameOf } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __dirnameOf(__filename);',
    ].join('\n'),
  },
  logLevel: 'warning',
};
