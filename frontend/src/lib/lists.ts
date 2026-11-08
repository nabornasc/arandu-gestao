import type { ListKind } from '@arandue/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';

export interface ListItem {
  id: number;
  kind: ListKind;
  name: string;
  active: boolean;
}

export type Lists = Record<ListKind, ListItem[]>;

// Valores ativos das listas da empresa. Sugestões: o campo continua aceitando digitar outro valor.
export function useListValues(kind: ListKind): string[] {
  const lists = useQuery({ queryKey: ['/lists'], queryFn: () => api<Lists>('/lists'), staleTime: 60_000 });
  return lists.data?.[kind].map((item) => item.name) ?? [];
}
