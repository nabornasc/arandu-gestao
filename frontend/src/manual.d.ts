declare module 'virtual:manual' {
  export type ManualBlock =
    | { type: 'html'; id: string; html: string }
    | { type: 'media'; id: string; name: string; alt: string; available: boolean };

  export interface ManualArticle {
    slug: string;
    titulo: string;
    modulo: string;
    tela: string | null;
    permissoes: string[];
    atualizado: string | null;
    summary: string;
    blocks: ManualBlock[];
  }

  export const articles: ManualArticle[];
}
