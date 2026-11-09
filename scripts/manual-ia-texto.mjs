// Texto do manual para o assistente: cada artigo com título, módulo e endereço, sem cabeçalho YAML e sem vídeos.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function buildManualText(dir) {
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();
  return files
    .map((file) => {
      const raw = readFileSync(path.join(dir, file), 'utf8').replaceAll('\r\n', '\n');
      const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
      const meta = match?.[1] ?? '';
      const title = meta.match(/^titulo:\s*(.+)$/m)?.[1]?.trim() ?? file;
      const body = raw
        .slice(match ? match[0].length : 0)
        .replace(/^!\[[^\]]*\]\(midia:[^)]+\)\n?/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return `<artigo titulo="${title}" endereco="/ajuda/${file.replace(/\.md$/, '')}">\n${body}\n</artigo>`;
    })
    .join('\n\n');
}
