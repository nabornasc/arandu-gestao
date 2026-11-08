import { writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;
let productId: number;

// PNG 1x1 válido, para o logo entrar no documento.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
  await owner.put('/company', { name: 'Ateliê DOCX', meiAnnualLimit: 81000, logo: PNG });
  productId = (await owner.post('/products', { name: 'Chopeira', type: 'service', price: 80 })).body.id;
});
afterAll(() => app.close());

const download = (client: Client, id: number) =>
  app.inject({ method: 'GET', url: `/api/quotes/${id}/docx`, headers: { cookie: client.cookie } });

// Lê as entradas do zip (sem compressão) e confere o CRC de cada uma.
function entries(buffer: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const crc = buffer.readUInt32LE(offset + 14);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const data = buffer.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(crc32(data), name).toBe(crc);
    files.set(name, data);
    offset += 30 + nameLength + size;
  }
  return files;
}

describe('orçamento em DOCX', () => {
  it('tem o conteúdo do espelho do cliente, com logo, grupos, avulso e cláusulas', async () => {
    const quote = (
      await owner.post('/quotes', {
        internalNotes: 'Margem secreta',
        clauses: 'Garantia de 90 dias.',
        items: [
          { productId, quantity: 2, groupName: 'Bar & Cozinha' },
          { description: 'Taxa de montagem', quantity: 1, unitPrice: 40, groupName: 'Bar & Cozinha' },
          { productId, quantity: 1, unitPrice: 10, hiddenInMirror: true },
        ],
      })
    ).body;
    const response = await download(owner, quote.id);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('wordprocessingml.document');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="orcamento-${String(quote.number).padStart(3, '0')}.docx"`,
    );
    if (process.env.DOCX_SAMPLE) writeFileSync(process.env.DOCX_SAMPLE, response.rawPayload);

    const files = entries(response.rawPayload);
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'word/media/logo.png',
    ]);
    const xml = files.get('word/document.xml')?.toString('utf8') ?? '';
    expect(xml).toContain('Ateliê DOCX');
    expect(xml).toContain('Bar &amp; Cozinha');
    expect(xml).toContain('Taxa de montagem');
    expect(xml).toContain('Garantia de 90 dias.');
    expect(xml).toContain('Rascunho: ainda não enviado ao cliente.');
    // O total conta o item oculto, mas a linha dele não sai; nem a observação interna.
    expect(xml).toContain('R$\u00a0210,00');
    expect(xml.match(/Chopeira/g)).toHaveLength(1);
    expect(xml).not.toContain('Margem secreta');

    const entry = (await owner.get('/history')).body.rows[0];
    expect(entry.summary).toBe('Exportou em DOCX');
  });

  it('segue as permissões do espelho', async () => {
    const quote = (await owner.post('/quotes', { items: [{ productId, quantity: 1 }] })).body;
    const other = await signupCompany(app);
    expect((await download(other, quote.id)).statusCode).toBe(404);
    const accountant = await addMember(app, owner, 'accountant');
    expect((await download(accountant, quote.id)).statusCode).toBe(200);
  });
});
