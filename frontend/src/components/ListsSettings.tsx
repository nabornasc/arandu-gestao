import { LIST_KINDS, type ListKind, listItemSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { api } from '../lib/api.ts';
import type { ListItem, Lists } from '../lib/lists.ts';
import { useToast } from './Toast.tsx';

const KIND_LABELS: Record<ListKind, { title: string; help: string }> = {
  payment_method: { title: 'Formas de pagamento', help: 'Sugeridas no cadastro de clientes.' },
  payment_terms: {
    title: 'Prazos no cadastro do cliente',
    help: 'Texto sugerido no cadastro de clientes. As parcelas dos documentos usam as condições de pagamento acima.',
  },
  opportunity_source: { title: 'Origens da oportunidade', help: 'De onde o cliente chegou, no CRM.' },
  lost_reason: { title: 'Motivos de perda', help: 'Sugeridos ao marcar uma oportunidade como perdida.' },
  customer_category: { title: 'Categorias de cliente', help: 'Sugeridas no cadastro de clientes.' },
  contact_role: { title: 'Cargos de contato', help: 'Sugeridos nos contatos de clientes e fornecedores.' },
  financial_category: {
    title: 'Categorias financeiras',
    help: 'Usadas em contas a pagar e movimentações.',
  },
  product_group: { title: 'Grupos de produto', help: 'Usados no cadastro e no resumo do espelho interno.' },
};

// Listas da empresa: os formulários sugerem estes valores e aceitam digitar outro. Desativar tira o
// valor das sugestões sem mudar os registros que já o usam.
export function ListsSettings({ readOnly }: { readOnly: boolean }) {
  const lists = useQuery({ queryKey: ['/lists', 'all'], queryFn: () => api<Lists>('/lists?all=1') });
  const [kind, setKind] = useState<ListKind>('payment_method');
  const kindId = useId();
  const items = lists.data?.[kind] ?? [];

  return (
    <section className="panel lists-settings" aria-labelledby="titulo-listas">
      <div className="panel-heading">
        <div>
          <h3 id="titulo-listas">Listas</h3>
          <p>Valores sugeridos nos formulários. O campo continua aceitando digitar outro valor.</p>
        </div>
      </div>
      {/* Rótulo ligado por id, sem envolver o select: o nome acessível fica só "Lista", sem o texto das
          opções (senão "Categorias de cliente" responde por "Cliente" em outras telas abertas). */}
      <div className="lists-kind">
        <label htmlFor={kindId}>Lista</label>
        <select
          id={kindId}
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ListKind)}
        >
          {LIST_KINDS.map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option].title}
            </option>
          ))}
        </select>
      </div>
      <p className="muted">{KIND_LABELS[kind].help}</p>

      {lists.isPending ? (
        <div className="loading">Carregando...</div>
      ) : (
        <ul className="list-items" aria-label={KIND_LABELS[kind].title}>
          {items.map((item) => (
            <ListItemRow key={item.id} item={item} readOnly={readOnly} />
          ))}
          {!items.length && <li className="muted">Nenhum valor nesta lista.</li>}
        </ul>
      )}
      {!readOnly && <NewItemForm kind={kind} />}
    </section>
  );
}

function useSave() {
  const client = useQueryClient();
  const notify = useToast();
  return (message: string) => ({
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['/lists'] });
      notify(message);
    },
    onError: (error: Error) => notify(error.message, 'error'),
  });
}

function ListItemRow({ item, readOnly }: { item: ListItem; readOnly: boolean }) {
  const [name, setName] = useState(item.name);
  const saved = useSave();
  const update = useMutation({
    mutationFn: (body: { name: string; active: boolean }) =>
      api(`/lists/${item.id}`, { method: 'PUT', body }),
    ...saved('Lista atualizada.'),
  });
  const changed = name.trim() !== item.name;

  return (
    <li className={item.active ? undefined : 'inactive'}>
      <input
        aria-label={`Nome: ${item.name}`}
        value={name}
        maxLength={80}
        disabled={readOnly}
        onChange={(event) => setName(event.target.value)}
      />
      {!item.active && <span className="status cancelled">Desativado</span>}
      {!readOnly && (
        <span className="list-item-actions">
          {changed && (
            <button
              type="button"
              className="button secondary"
              disabled={update.isPending || !name.trim()}
              onClick={() => update.mutate({ name: name.trim(), active: item.active })}
            >
              Salvar
            </button>
          )}
          <button
            type="button"
            className="link-button"
            disabled={update.isPending}
            onClick={() => update.mutate({ name: item.name, active: !item.active })}
          >
            {item.active ? 'Desativar' : 'Reativar'}
          </button>
        </span>
      )}
    </li>
  );
}

function NewItemForm({ kind }: { kind: ListKind }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saved = useSave();
  const create = useMutation({
    mutationFn: (body: unknown) => api('/lists', { method: 'POST', body }),
    ...saved('Valor adicionado.'),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = listItemSchema.safeParse({ kind, name });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique o nome.');
    setError(null);
    create.mutate(parsed.data, { onSuccess: () => setName('') });
  }

  return (
    <form className="list-new" onSubmit={submit} noValidate>
      <input
        aria-label="Novo valor"
        placeholder="Novo valor"
        maxLength={80}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="button secondary" disabled={create.isPending}>
        <Plus size={16} /> Adicionar
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
