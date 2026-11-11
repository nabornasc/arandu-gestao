import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import { db } from '../db/client.ts';
import { attachments } from '../db/schema.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { localStorage, validLocalSignature } from '../lib/storage.ts';

// Rotas do armazenamento local, com URLs assinadas e de prazo curto (mesmo papel das URLs do Supabase).
export async function localStorageRoutes(app: FastifyInstance) {
  const storage = localStorage();
  if (!storage) return;

  // O corpo é o arquivo cru, de qualquer tipo.
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer', bodyLimit: config.ATTACHMENT_MAX_MB * 1024 * 1024 + 1 },
    (_request, body, done) => done(null, body),
  );

  const signed = (query: unknown, purpose: 'upload' | 'file') => {
    const { key, exp, sig } = (query ?? {}) as Record<string, string | undefined>;
    const expires = Number(exp);
    if (!key || !Number.isFinite(expires) || expires < Date.now()) return null;
    return validLocalSignature(`${purpose}:${key}:${expires}`, sig) ? key : null;
  };

  app.put('/storage/upload', async (request, reply) => {
    const key = signed(request.query, 'upload');
    if (!key) throw notFound();
    if (!Buffer.isBuffer(request.body) || !request.body.length) throw badRequest('Arquivo vazio.');
    try {
      await storage.write(key, request.body);
    } catch {
      throw badRequest('Este envio já foi usado.');
    }
    reply.status(200);
    return { key };
  });

  app.get('/storage/file', async (request, reply) => {
    const key = signed(request.query, 'file');
    if (!key) throw notFound();
    const [row] = await db
      .select({ mimeType: attachments.mimeType, name: attachments.name })
      .from(attachments)
      .where(eq(attachments.storageKey, key));
    if (!row) throw notFound();
    const data = await readFile(storage.filePath(key)).catch(() => null);
    if (!data) throw notFound();
    reply.header('content-type', row.mimeType);
    reply.header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    reply.header('cache-control', 'private, max-age=600');
    return reply.send(data);
  });
}
