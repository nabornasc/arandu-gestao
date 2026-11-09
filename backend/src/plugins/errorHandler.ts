import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { isProduction } from '../config.ts';
import { AppError } from '../lib/errors.ts';
import { reportError } from '../lib/monitoring.ts';
import { pgCode } from '../lib/pgError.ts';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send({ message: error.message });
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      return reply.status(400).send({
        message: first?.message ?? 'Dados inválidos.',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    const code = pgCode(error);
    if (code) {
      if (code === '23505') return reply.status(409).send({ message: 'Registro duplicado.' });
      if (code === '23503') {
        return reply
          .status(409)
          .send({ message: 'Registro vinculado a outros dados; não pode ser alterado assim.' });
      }
    }
    // Erros do próprio Fastify (JSON malformado, corpo grande, limite de requisições...) já trazem o status.
    const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) {
      request.log.error(error);
      await reportError(error);
    }
    const message =
      status >= 500 && isProduction ? 'Erro interno do servidor. Tente novamente mais tarde.' : error.message;
    return reply.status(status).send({ message });
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ message: 'Rota não encontrada.' }));
}
