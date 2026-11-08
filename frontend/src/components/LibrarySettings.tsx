import { textSnippetSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.ts';
import type { ItemTemplate, TextSnippet } from '../lib/library.ts';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

function useSaved(key: string, onDone?: () => void) {
  const client = useQueryClient();
  const notify = useToast();
  return (message: string) => ({
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [key] });
      notify(message);
      onDone?.();
    },
    onError: (error: Error) => notify(error.message, 'error'),
  });
}

// Biblioteca do orçamento: textos prontos (cláusulas) e modelos de grupo de itens. Os orçamentos
// copiam o conteúdo ao inserir; mudar aqui não altera orçamentos antigos.
export function LibrarySettings({ readOnly }: { readOnly: boolean }) {
  return (
    <section className="panel" aria-labelledby="titulo-biblioteca">
      <div className="panel-heading">
        <div>
          <h3 id="titulo-biblioteca">Biblioteca do orçamento</h3>
          <p>
            Textos e modelos de grupo para inserir no orçamento. Mudar aqui não altera orçamentos antigos.
          </p>
        </div>
      </div>
      <SnippetsTable readOnly={readOnly} />
      <TemplatesTable readOnly={readOnly} />
    </section>
  );
}

function SnippetsTable({ readOnly }: { readOnly: boolean }) {
  const snippets = useQuery({
    queryKey: ['/text-snippets', 'all'],
    queryFn: () => api<TextSnippet[]>('/text-snippets?all=1'),
  });
  const [editing, setEditing] = useState<TextSnippet | 'new' | null>(null);
  return (
    <>
      <div className="library-heading">
        <h4>Textos e cláusulas</h4>
        {!readOnly && (
          <button type="button" className="button secondary" onClick={() => setEditing('new')}>
            <Plus size={14} /> Novo texto
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table aria-label="Textos e cláusulas">
          <thead>
            <tr>
              <th>Título</th>
              <th>Texto</th>
              <th>Situação</th>
              {!readOnly && <th aria-label="Ações" />}
            </tr>
          </thead>
          <tbody>
            {snippets.data?.map((row) => (
              <tr key={row.id}>
                <td>{row.title}</td>
                <td className="truncate" title={row.body}>
                  {row.body}
                </td>
                <td>
                  <span className={`status ${row.active ? 'completed' : 'cancelled'}`}>
                    {row.active ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                {!readOnly && (
                  <td className="actions">
                    <button type="button" className="link-button" onClick={() => setEditing(row)}>
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {snippets.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nenhum texto ainda. Ex.: garantia, prazo de entrega, forma de montagem.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <SnippetForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function SnippetForm({ initial, onClose }: { initial: TextSnippet | null; onClose: () => void }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    active: initial?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const saved = useSaved('/text-snippets', onClose);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      initial
        ? api(`/text-snippets/${initial.id}`, { method: 'PUT', body })
        : api('/text-snippets', { method: 'POST', body }),
    ...saved(initial ? 'Texto atualizado.' : 'Texto criado.'),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = textSnippetSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    save.mutate(parsed.data);
  }

  return (
    <Modal eyebrow="BIBLIOTECA" title={initial ? `Editar ${initial.title}` : 'Novo texto'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="full-row">
            Título
            <input
              name="title"
              data-autofocus
              maxLength={80}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label className="full-row">
            Texto
            <textarea
              name="body"
              rows={6}
              maxLength={2000}
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            />
          </label>
          <label className="checkbox full-row">
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            Ativo (aparece no orçamento)
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={save.isPending}>
            {save.isPending ? 'Salvando...' : 'Salvar texto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TemplatesTable({ readOnly }: { readOnly: boolean }) {
  const templates = useQuery({
    queryKey: ['/item-templates', 'all'],
    queryFn: () => api<ItemTemplate[]>('/item-templates?all=1'),
  });
  const products = useQuery({
    queryKey: ['/products'],
    queryFn: () => api<{ id: number; name: string }[]>('/products'),
  });
  const names = new Map(products.data?.map((row) => [row.id, row.name]));
  const saved = useSaved('/item-templates');
  const update = useMutation({
    mutationFn: (row: ItemTemplate) => api(`/item-templates/${row.id}`, { method: 'PUT', body: row }),
    ...saved('Modelo atualizado.'),
  });
  return (
    <>
      <div className="library-heading">
        <h4>Modelos de grupo</h4>
      </div>
      <p className="muted">No orçamento, use "Criar modelo do grupo" para criar um modelo.</p>
      <div className="table-wrap">
        <table aria-label="Modelos de grupo">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Itens</th>
              <th>Situação</th>
              {!readOnly && <th aria-label="Ações" />}
            </tr>
          </thead>
          <tbody>
            {templates.data?.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>
                  {row.items
                    .map((item) => `${item.quantity}x ${names.get(item.productId) ?? 'produto removido'}`)
                    .join(', ')}
                </td>
                <td>
                  <span className={`status ${row.active ? 'completed' : 'cancelled'}`}>
                    {row.active ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                {!readOnly && (
                  <td className="actions">
                    <button
                      type="button"
                      className="link-button"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ ...row, active: !row.active })}
                    >
                      {row.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {templates.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nenhum modelo ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
