import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';

export interface TextSnippet {
  id: number;
  title: string;
  body: string;
  active: boolean;
}

export interface ItemTemplate {
  id: number;
  name: string;
  items: { productId: number; quantity: number; unitPrice: number | null }[];
  active: boolean;
}

// Ativos, para usar no orçamento.
export const useSnippets = () =>
  useQuery({ queryKey: ['/text-snippets'], queryFn: () => api<TextSnippet[]>('/text-snippets') });

export const useTemplates = (enabled = true) =>
  useQuery({
    queryKey: ['/item-templates'],
    queryFn: () => api<ItemTemplate[]>('/item-templates'),
    enabled,
  });
