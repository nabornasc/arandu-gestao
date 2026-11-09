import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { MONEY_COLUMNS, type ResourceConfig } from '../config/resources.ts';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatDate, formatMoney, label } from '../lib/format.ts';
import { useListFilters, useServerList } from '../lib/listFilters.ts';
import { EmptyState } from './EmptyState.tsx';
import { FormModal } from './FormModal.tsx';
import { ListFilters, ListTotals, Pagination } from './ListFilters.tsx';
import { useToast } from './Toast.tsx';

type Row = Record<string, unknown> & { id: number };

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_COLUMNS.has(key)) return formatMoney(Number(value));
  if (key.toLowerCase().endsWith('date')) return formatDate(String(value));
  return label(String(value));
}

// Ação extra em cada linha, para telas com mais do que editar e excluir (ex.: estoque do produto).
export type RowExtra = ComponentType<{ row: Row }>;

// Ação sobre as linhas visíveis, ao lado dos filtros (ex.: pagar em lote).
export type ListToolbar = ComponentType<{ rows: Row[] }>;

export function ResourcePage({
  config,
  RowExtra,
  Toolbar,
}: {
  config: ResourceConfig;
  RowExtra?: RowExtra;
  Toolbar?: ListToolbar;
}) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const [copying, setCopying] = useState<Row | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const allowed = {
    create: can(profile, `${config.area}.create`),
    update: can(profile, `${config.area}.update`),
    delete: can(profile, `${config.area}.delete`),
  };

  // Telas com filtros (despesas, movimentações) paginam no servidor; as demais trazem tudo de uma vez.
  const listConfig = config.list;
  const control = useListFilters();
  const paged = useServerList<Row>(config.endpoint, control, Boolean(listConfig));
  const plain = useQuery({
    queryKey: [config.endpoint],
    queryFn: () => api<Row[]>(config.endpoint),
    enabled: !listConfig,
  });
  const list = listConfig ? paged.query : plain;
  const pageData = paged.query.data;
  const visible: Row[] = (listConfig ? pageData?.rows : plain.data) ?? [];
  const hasAny = control.active || (listConfig ? (pageData?.total ?? 0) : visible.length) > 0;

  // Alterar um registro pode mexer em outras telas (ex.: despesa paga cria movimentação),
  // então invalidamos tudo; só a tela visível é buscada de novo.
  const onChanged = (message: string) => {
    void client.invalidateQueries();
    notify(message);
  };

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? api(`${config.endpoint}/${editing.id}`, { method: 'PUT', body: payload })
        : api(config.endpoint, { method: 'POST', body: payload }),
    onSuccess: () => {
      setModalOpen(false);
      onChanged(editing ? 'Registro atualizado com sucesso.' : 'Registro criado com sucesso.');
    },
    onError: (error) => notify(error.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`${config.endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => onChanged('Registro excluído com sucesso.'),
    onError: (error) => notify(error.message, 'error'),
  });

  const openForm = (row: Row | null) => {
    setEditing(row);
    setCopying(null);
    setModalOpen(true);
  };
  const openCopy = (row: Row) => {
    setEditing(null);
    setCopying(config.copy ? (config.copy(row) as Row) : null);
    setModalOpen(true);
  };

  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">GESTÃO DO NEGÓCIO</span>
          <h2>{config.title}</h2>
          <p>Cadastre e acompanhe informações essenciais da sua rotina.</p>
        </div>
        {allowed.create ? (
          <button type="button" className="button primary" onClick={() => openForm(null)}>
            <Plus size={17} /> Novo registro
          </button>
        ) : (
          <span className="read-only-note">Somente leitura</span>
        )}
      </div>

      {listConfig && hasAny && (
        <ListFilters
          control={control}
          dateLabel={listConfig.dateLabel}
          textLabel={listConfig.textLabel}
          statuses={listConfig.statuses}
        />
      )}

      {Toolbar && (
        <div className="list-toolbar">
          <Toolbar rows={visible} />
        </div>
      )}

      <div className="panel table-panel">
        {list.isPending ? (
          <div className="loading">Carregando dados...</div>
        ) : list.isError ? (
          <EmptyState text={list.error.message} />
        ) : visible.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {config.columns.map(([key, title]) => (
                    <th key={key}>{title}</th>
                  ))}
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const locked = config.isLocked?.(row) ?? false;
                  return (
                    <tr key={row.id}>
                      {config.columns.map(([key]) => {
                        const badge = config.badge?.(key, row);
                        return (
                          <td key={key}>
                            {formatCell(key, row[key])}
                            {badge && <span className="status pending cell-badge">{badge}</span>}
                          </td>
                        );
                      })}
                      <td className="actions">
                        {locked ? (
                          <span title="Gerada automaticamente por um pedido ou despesa">
                            <Lock size={14} aria-label="Automática" />
                          </span>
                        ) : (
                          <>
                            {RowExtra && <RowExtra row={row} />}
                            {config.copy && allowed.create && (
                              <button
                                type="button"
                                title="Copiar para um cadastro novo"
                                aria-label="Copiar"
                                onClick={() => openCopy(row)}
                              >
                                <Copy size={15} />
                              </button>
                            )}
                            {allowed.update && (
                              <button type="button" onClick={() => openForm(row)}>
                                Editar
                              </button>
                            )}
                            {allowed.delete && (
                              <button
                                type="button"
                                className="delete"
                                title="Excluir registro"
                                aria-label="Excluir registro"
                                disabled={remove.isPending}
                                onClick={() =>
                                  window.confirm('Excluir este registro?') && remove.mutate(row.id)
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            text={
              hasAny
                ? 'Nenhum registro com esses filtros.'
                : 'Ainda não há registros cadastrados nesta seção.'
            }
            action={allowed.create && !hasAny ? 'Adicionar primeiro' : undefined}
            onClick={() => openForm(null)}
          />
        )}
      </div>

      {listConfig && pageData && hasAny && (
        <>
          <Pagination
            page={paged.page}
            pageSize={paged.pageSize}
            total={pageData.total}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
          />
          <ListTotals count={pageData.total} totals={listConfig.totals(pageData.totals)} />
        </>
      )}

      {modalOpen && (
        <FormModal
          config={config}
          initial={editing}
          prefill={copying}
          title={copying ? 'Copiar registro' : undefined}
          saving={save.isPending}
          onClose={() => setModalOpen(false)}
          onSubmit={(payload) => save.mutate(payload)}
        />
      )}
    </section>
  );
}
