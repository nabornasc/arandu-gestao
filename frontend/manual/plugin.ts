import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { isPermission } from '../../packages/shared/src/permissions.ts';
import { type ManualArticle, parseArticle } from './markdown.ts';

const VIRTUAL = 'virtual:manual';
const RESOLVED = `\0${VIRTUAL}`;

// Artigos em docs/manual/<módulo>/<tarefa>.md; mídia em frontend/public/manual/<nome>.webm.
export function manualPlugin(root: string): Plugin {
  const docs = path.join(root, 'docs', 'manual');
  const media = path.join(root, 'frontend', 'public', 'manual');

  const load = (): ManualArticle[] => {
    if (!existsSync(docs)) return [];
    const files = readdirSync(docs, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replaceAll('\\', '/'))
      .sort();
    return files.map((file) => {
      const article = parseArticle(
        file.replace(/\.md$/, ''),
        readFileSync(path.join(docs, file), 'utf8'),
        (name) => existsSync(path.join(media, `${name}.webm`)),
      );
      // A busca rápida filtra os artigos pelas permissões: nome errado esconderia o artigo de todos.
      const unknown = article.permissoes.filter((permission) => !isPermission(permission));
      if (unknown.length)
        throw new Error(`Manual: ${article.slug} com permissão desconhecida: ${unknown.join(', ')}.`);
      return article;
    });
  };

  return {
    name: 'arandue-manual',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined;
      return `export const articles = ${JSON.stringify(load())};`;
    },
    configureServer(server) {
      // Editar um artigo recarrega a página no desenvolvimento.
      server.watcher.add(docs);
      server.watcher.on('change', (file) => {
        if (!file.startsWith(docs)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
