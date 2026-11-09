// Conversão dos artigos do manual (docs/manual) no build. Só o subconjunto de Markdown que os artigos
// usam: títulos ## e ###, parágrafos, listas, negrito, código, links e mídia. Todo o texto é escapado.

export interface ManualMeta {
  titulo: string;
  modulo: string;
  tela: string | null;
  permissoes: string[];
  atualizado: string | null;
}

export type ManualBlock =
  | { type: 'html'; id: string; html: string }
  | { type: 'media'; id: string; name: string; alt: string; available: boolean };

export interface ManualArticle extends ManualMeta {
  slug: string;
  summary: string;
  blocks: ManualBlock[];
}

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Link interno (/ajuda/..., /orcamentos) ou https. "//site" e qualquer outro esquema viram texto.
const safeHref = (href: string) => (/^(\/(?![/\\])|https:\/\/)/.test(href) ? href : null);

export function inline(text: string): string {
  const parts: string[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(escapeHtml(text.slice(last, match.index)));
    const [, code, bold, label, href] = match;
    if (code !== undefined) parts.push(`<code>${escapeHtml(code)}</code>`);
    else if (bold !== undefined) parts.push(`<strong>${escapeHtml(bold)}</strong>`);
    else if (label !== undefined && href !== undefined) {
      const target = safeHref(href);
      parts.push(target ? `<a href="${escapeHtml(target)}">${escapeHtml(label)}</a>` : escapeHtml(label));
    }
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(escapeHtml(text.slice(last)));
  return parts.join('');
}

// Cabeçalho entre linhas "---", no formato chave: valor. Listas como [a, b].
export function parseFrontmatter(source: string): { meta: Record<string, string | string[]>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta: Record<string, string | string[]> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const pair = /^([a-z]+):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (!pair?.[1]) continue;
    const value = pair[2] ?? '';
    meta[pair[1]] = value.startsWith('[')
      ? value
          .slice(1, -1)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : value;
  }
  return { meta, body: source.slice(match[0].length) };
}

const MEDIA = /^!\[([^\]]*)\]\(midia:([a-z0-9/_-]+)\)$/;

export function parseBody(body: string, hasMedia: (name: string) => boolean): ManualBlock[] {
  const blocks: ManualBlock[] = [];
  let html: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      html.push(`<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushHtml = () => {
    flushParagraph();
    flushList();
    if (html.length) blocks.push({ type: 'html', id: `bloco-${blocks.length}`, html: html.join('\n') });
    html = [];
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const media = MEDIA.exec(line);
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    const item = /^(-|\d+\.)\s+(.*)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (media) {
      flushHtml();
      const name = media[2] ?? '';
      blocks.push({
        type: 'media',
        id: `bloco-${blocks.length}`,
        name,
        alt: media[1] ?? '',
        available: hasMedia(name),
      });
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length === 2 ? 'h2' : 'h3';
      html.push(`<${level}>${inline(heading[2] ?? '')}</${level}>`);
    } else if (item) {
      flushParagraph();
      const tag = item[1] === '-' ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(inline(item[2] ?? ''));
    } else if (list && /^\s{2,}/.test(raw)) {
      // Continuação do item anterior, indentada.
      list.items[list.items.length - 1] += ` ${inline(line)}`;
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushHtml();
  return blocks;
}

const text = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

export function parseArticle(
  slug: string,
  source: string,
  hasMedia: (name: string) => boolean,
): ManualArticle {
  const { meta, body } = parseFrontmatter(source);
  const titulo = text(meta.titulo);
  const modulo = text(meta.modulo);
  if (!titulo || !modulo) throw new Error(`Manual: ${slug} sem "titulo" ou "modulo" no cabeçalho.`);
  const blocks = parseBody(body, hasMedia);
  // Resumo: o primeiro parágrafo, sem marcação, para o índice e a busca.
  const first = /<p>([\s\S]*?)<\/p>/.exec(blocks.find((block) => block.type === 'html')?.html ?? '');
  const summary = (first?.[1] ?? '').replace(/<[^>]+>/g, '');
  return {
    slug,
    titulo,
    modulo,
    tela: text(meta.tela),
    permissoes: Array.isArray(meta.permissoes) ? meta.permissoes : [],
    atualizado: text(meta.atualizado),
    summary,
    blocks,
  };
}
