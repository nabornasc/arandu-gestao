import type { ListKey } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';

type Saved = Record<string, string[]>;
const KEY = ['/preferences/columns'];

// Colunas escondidas da lista, guardadas por usuário. A tela mostra a mudança na hora e grava em seguida.
export function useListColumns(list: ListKey) {
  const client = useQueryClient();
  const saved = useQuery({
    queryKey: KEY,
    queryFn: () => api<Saved>('/preferences/columns'),
    staleTime: Infinity,
  });
  const hidden = new Set(saved.data?.[list] ?? []);

  const save = useMutation({
    mutationFn: (next: string[]) =>
      api(`/preferences/columns/${list}`, { method: 'PUT', body: { hidden: next } }),
    onMutate: (next) => {
      const previous = client.getQueryData<Saved>(KEY);
      client.setQueryData<Saved>(KEY, { ...previous, [list]: next });
      return { previous };
    },
    onError: (_error, _next, context) => client.setQueryData(KEY, context?.previous),
  });

  return {
    isVisible: (key: string) => !hidden.has(key),
    toggle: (key: string) =>
      save.mutate(hidden.has(key) ? [...hidden].filter((item) => item !== key) : [...hidden, key]),
    reset: () => save.mutate([]),
    hiddenCount: hidden.size,
  };
}

export type ListColumns = ReturnType<typeof useListColumns>;
