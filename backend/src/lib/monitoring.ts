// Monitoramento de erros. Sem SENTRY_DSN (desenvolvimento e testes), nada é enviado.
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Só erros, sem rastreamento de desempenho. O beforeSend tira cookies, IP e corpo da requisição.
    tracesSampleRate: 0,
    // Sentry 11 coleta cookies, corpos, cabeçalhos, consultas ao banco e conversas com a IA por padrão.
    // Aqui tudo fica desligado: só o erro e a pilha, sem dado de cliente nem do usuário.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend(event) {
      if (event.request) event.request = { method: event.request.method, url: event.request.url };
      return event;
    },
  });
}

// Na Vercel a função pode congelar logo após responder: espera o envio terminar.
export async function reportError(error: unknown): Promise<void> {
  if (!dsn) return;
  Sentry.captureException(error);
  await Sentry.flush(2000);
}
