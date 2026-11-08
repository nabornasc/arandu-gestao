import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, ListPlus } from 'lucide-react';
import { type Dispatch, type SetStateAction, useId, useState } from 'react';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { useTemplates } from '../lib/library.ts';
import { type Line, newLine, type Product } from './ItemLines.tsx';
import { useToast } from './Toast.tsx';

// Modelos de grupo no orçamento: inserir um modelo salvo (procurando pelo nome) e salvar um grupo
// como modelo. O modelo inserido vira linhas comuns, que continuam editáveis.
export function GroupTemplates({
  lines,
  setLines,
  products,
  groupNames,
}: {
  lines: Line[];
  setLines: Dispatch<SetStateAction<Line[]>>;
  products: Product[] | undefined;
  groupNames: string[];
}) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const listId = useId();
  const templates = useTemplates();
  const [search, setSearch] = useState('');
  const canSave = can(profile, 'quotes.create');

  const save = useMutation({
    mutationFn: (body: unknown) => api('/item-templates', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['/item-templates'] });
      notify('Modelo salvo.');
    },
    onError: (error) => notify(error.message, 'error'),
  });

  const chosen = templates.data?.find((row) => row.name.toLowerCase() === search.trim().toLowerCase());

  function insert() {
    if (!chosen) return;
    const byId = new Map(products?.map((product) => [product.id, product]));
    const available = chosen.items.filter((item) => byId.has(item.productId));
    const added = available.map((item) => ({
      ...newLine({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? byId.get(item.productId)?.price ?? 0,
      }),
      groupName: chosen.name,
    }));
    // Linha vazia (a primeira de um orçamento novo) dá lugar aos itens do modelo.
    setLines((current) => [...current.filter((line) => line.productId), ...added]);
    setSearch('');
    const missing = chosen.items.length - available.length;
    notify(
      missing
        ? `Modelo inserido. ${missing} item(ns) fora do catálogo ficaram de fora.`
        : `Modelo "${chosen.name}" inserido.`,
    );
  }

  function saveGroup(name: string) {
    const items = lines
      .filter((line) => line.groupName.trim() === name && line.productId)
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      }));
    save.mutate({ name, items });
  }

  return (
    <div className="group-templates full-row">
      <datalist id={listId}>
        {templates.data?.map((row) => (
          <option key={row.id} value={row.name} />
        ))}
      </datalist>
      <label>
        Modelo de grupo
        <input
          type="search"
          name="templateSearch"
          list={listId}
          placeholder="Procure pelo nome do modelo"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <button type="button" className="button secondary" disabled={!chosen} onClick={insert}>
        <ListPlus size={14} /> Inserir modelo
      </button>
      {canSave &&
        groupNames.map((name) => (
          <button
            key={name}
            type="button"
            className="button secondary"
            disabled={save.isPending}
            onClick={() => saveGroup(name)}
          >
            <BookmarkPlus size={14} /> Criar modelo do grupo {name}
          </button>
        ))}
    </div>
  );
}
