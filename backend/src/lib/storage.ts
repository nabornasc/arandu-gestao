import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, isProduction } from '../config.ts';

// Onde ficam os anexos. Produção: Supabase Storage, com URLs assinadas e de curta duração; o navegador
// envia e baixa direto de lá, sem passar pela função da Vercel. Desenvolvimento e testes: disco local,
// com o mesmo formato de URL assinada, servida pela própria API.
export interface UploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface FileStorage {
  readonly available: boolean;
  createUpload(key: string, contentType: string): Promise<UploadTarget>;
  // Tamanho do arquivo já enviado, ou null se ele não existe.
  size(key: string): Promise<number | null>;
  downloadUrls(files: { key: string; name: string }[], expiresIn: number): Promise<string[]>;
  remove(keys: string[]): Promise<void>;
  // Todos os arquivos guardados, para a limpeza de arquivos sem registro.
  list(): Promise<{ key: string; createdAt: Date }[]>;
}

class SupabaseStorage implements FileStorage {
  readonly available = true;
  private readonly base: string;
  private readonly key: string;
  private readonly bucket: string;

  constructor(url: string, key: string, bucket: string) {
    this.base = `${url.replace(/\/$/, '')}/storage/v1`;
    this.key = key;
    this.bucket = bucket;
  }

  private headers(json = true) {
    return {
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      ...(json && { 'content-type': 'application/json' }),
    };
  }

  private async call(pathname: string, init: RequestInit) {
    const response = await fetch(`${this.base}${pathname}`, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(
        `Supabase Storage ${init.method} ${pathname.split('/').slice(0, 3).join('/')}: ${response.status}`,
      );
    }
    return response;
  }

  async createUpload(key: string, contentType: string): Promise<UploadTarget> {
    const response = await this.call(`/object/upload/sign/${this.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers(),
      body: '{}',
    });
    const { url } = (await response.json()) as { url: string };
    return {
      url: `${this.base}${url}`,
      method: 'PUT',
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
    };
  }

  async size(key: string) {
    const response = await fetch(`${this.base}/object/${this.bucket}/${key}`, {
      method: 'HEAD',
      headers: this.headers(false),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw new Error(`Supabase Storage HEAD: ${response.status}`);
    return Number(response.headers.get('content-length') ?? 0);
  }

  async downloadUrls(files: { key: string; name: string }[], expiresIn: number) {
    if (!files.length) return [];
    const response = await this.call(`/object/sign/${this.bucket}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ expiresIn, paths: files.map((file) => file.key) }),
    });
    const signed = (await response.json()) as { path: string; signedURL: string | null }[];
    const byPath = new Map(signed.map((item) => [item.path, item.signedURL]));
    return files.map((file) => {
      const url = byPath.get(file.key);
      return url ? `${this.base}${url}` : '';
    });
  }

  async remove(keys: string[]) {
    if (!keys.length) return;
    await this.call(`/object/${this.bucket}`, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({ prefixes: keys }),
    });
  }

  // As chaves ficam na raiz do bucket; a listagem vem em páginas de 1000.
  async list() {
    const files: { key: string; createdAt: Date }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await this.call(`/object/list/${this.bucket}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ prefix: '', limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      const page = (await response.json()) as {
        name: string;
        id: string | null;
        created_at: string | null;
      }[];
      for (const item of page) {
        if (item.id) files.push({ key: item.name, createdAt: new Date(item.created_at ?? Date.now()) });
      }
      if (page.length < 1000) return files;
    }
  }
}

// Assinatura das URLs locais: muda a cada início do servidor, como uma URL assinada que vence.
const localSecret = randomBytes(32);
export const signLocal = (value: string) => createHmac('sha256', localSecret).update(value).digest('hex');
export function validLocalSignature(value: string, signature: unknown) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signLocal(value), 'hex'), Buffer.from(signature, 'hex'));
}

class LocalStorage implements FileStorage {
  readonly available = true;
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  // A chave vira caminho dentro da pasta; nada sai dela.
  filePath(key: string) {
    const file = path.resolve(this.dir, key);
    if (!file.startsWith(path.resolve(this.dir) + path.sep)) throw new Error('Chave de arquivo inválida.');
    return file;
  }

  async createUpload(key: string, contentType: string): Promise<UploadTarget> {
    const expires = Date.now() + 2 * 60 * 60 * 1000;
    const query = `key=${encodeURIComponent(key)}&exp=${expires}`;
    return {
      url: `/api/storage/upload?${query}&sig=${signLocal(`upload:${key}:${expires}`)}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
    };
  }

  async write(key: string, data: Buffer) {
    const file = this.filePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: 'wx' });
  }

  async size(key: string) {
    try {
      return (await stat(this.filePath(key))).size;
    } catch {
      return null;
    }
  }

  async downloadUrls(files: { key: string; name: string }[], expiresIn: number) {
    const expires = Date.now() + expiresIn * 1000;
    return files.map(
      (file) =>
        `/api/storage/file?key=${encodeURIComponent(file.key)}&exp=${expires}&name=${encodeURIComponent(file.name)}` +
        `&sig=${signLocal(`file:${file.key}:${expires}`)}`,
    );
  }

  async remove(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.filePath(key), { force: true })));
  }

  async list() {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return Promise.all(
      names.map(async (name) => ({ key: name, createdAt: (await stat(this.filePath(name))).birthtime })),
    );
  }
}

class UnavailableStorage implements FileStorage {
  readonly available = false;
  private fail(): never {
    throw new Error('Armazenamento de anexos não configurado.');
  }
  createUpload = async () => this.fail();
  size = async () => this.fail();
  downloadUrls = async () => this.fail();
  remove = async () => this.fail();
  list = async () => this.fail();
}

let storage: FileStorage | null = null;

export function fileStorage(): FileStorage {
  if (!storage) {
    if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
      storage = new SupabaseStorage(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY,
        config.STORAGE_BUCKET,
      );
    } else if (!isProduction) {
      storage = new LocalStorage(path.resolve(config.UPLOADS_DIR));
    } else {
      // Produção sem Supabase: o disco da função some a cada execução, então não há onde guardar.
      storage = new UnavailableStorage();
    }
  }
  return storage;
}

export const localStorage = () => {
  const current = fileStorage();
  return current instanceof LocalStorage ? current : null;
};
