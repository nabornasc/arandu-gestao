// Monitoramento de erros no navegador. Sem VITE_SENTRY_DSN, o Sentry nem é baixado.
export function startMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Só erros: sem gravação de sessão nem rastreamento de desempenho.
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
    });
  });
}
