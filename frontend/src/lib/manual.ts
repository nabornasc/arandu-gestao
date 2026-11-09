import { articles, type ManualArticle } from 'virtual:manual';
import { MODULES } from '../config/navigation.ts';

export type { ManualArticle };
export { articles };

export const articlePath = (article: ManualArticle) => `/ajuda/${article.slug}`;

export const moduleLabel = (key: string) => MODULES.find((module) => module.key === key)?.label ?? key;

export const findArticle = (slug: string) => articles.find((article) => article.slug === slug) ?? null;

// Artigo da tela aberta: a tela do artigo ou qualquer endereço abaixo dela (/orcamentos/12).
export function articleForPath(pathname: string): ManualArticle | null {
  const matches = articles.filter(
    (article) => article.tela && (pathname === article.tela || pathname.startsWith(`${article.tela}/`)),
  );
  return matches.sort((a, b) => (b.tela?.length ?? 0) - (a.tela?.length ?? 0))[0] ?? null;
}
