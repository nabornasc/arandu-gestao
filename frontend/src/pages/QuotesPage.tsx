import { QUOTE_STATUSES } from '@arandue/shared/schemas';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ActionMenu } from '../actions/ActionMenu.tsx';
import { quoteActions } from '../actions/registry.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { ListFilters, ListTotals, Pagination } from '../components/ListFilters.tsx';
import { can, useProfile } from '../lib/auth.ts';
import type { Quote } from '../lib/documents.ts';
import { formatCode, formatDate, formatMoney, label } from '../lib/format.ts';
import { useListFilters, useServerList } from '../lib/listFilters.ts';

const STATUSES = QUOTE_STATUSES.map((status) => [status, label(status)] as const);

export default function QuotesPage() {
  const profile = useProfile();
  const navigate = useNavigate();
  const canCreate = can(profile, 'quotes.create');
  const control = useListFilters();
  const list = useServerList<Quote>('/quotes', control);
  const data = list.query.data;
  const visible = data?.rows ?? [];
  // Sem nenhum orçamento e sem filtro, a tela mostra só o convite para criar o primeiro.
  const hasAny = control.active || (data?.total ?? 0) > 0;

  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">VENDAS</span>
          <h2>Orçamentos</h2>
          <p>Monte a proposta, envie ao cliente e, aprovada, transforme em pedido.</p>
        </div>
        {canCreate && (
          <button type="button" className="button primary" onClick={() => navigate('/orcamentos/novo')}>
            <Plus size={17} /> Novo orçamento
          </button>
        )}
      </div>

      {hasAny && (
        <ListFilters
          control={control}
          dateLabel="Data do orçamento"
          textLabel="Cliente ou número"
          statuses={STATUSES}
        />
      )}

      <div className="panel table-panel">
        {list.query.isPending ? (
          <div className="loading">Carregando orçamentos...</div>
        ) : list.query.isError ? (
          <EmptyState text={list.query.error.message} />
        ) : visible.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Orçamento</th>
                  <th>Cliente</th>
                  <th>Validade</th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visible.map((quote) => {
                  const code = formatCode(quote.number);
                  const summary = quote.items
                    .map((item) => `${item.quantity}x ${item.productName}`)
                    .join(', ');
                  return (
                    <tr key={quote.id}>
                      <td>
                        <button
                          type="button"
                          className="link-cell"
                          onClick={() => navigate(`/orcamentos/${quote.id}`)}
                        >
                          {code}
                        </button>
                      </td>
                      <td>{quote.customerName ?? 'Cliente não informado'}</td>
                      <td>{formatDate(quote.validUntil)}</td>
                      <td title={summary} className="truncate">
                        {summary}
                      </td>
                      <td>
                        <span className={`status ${quote.status}`}>{label(quote.status)}</span>
                        {quote.orderNumber !== null && (
                          <small className="muted"> · pedido {formatCode(quote.orderNumber)}</small>
                        )}
                      </td>
                      <td>
                        <strong>{formatMoney(quote.total)}</strong>
                      </td>
                      <td className="actions">
                        <ActionMenu actions={quoteActions} record={quote} label={`orçamento ${code}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            text={hasAny ? 'Nenhum registro com esses filtros.' : 'Nenhum orçamento ainda.'}
            action={canCreate && !hasAny ? 'Criar primeiro orçamento' : undefined}
            onClick={() => navigate('/orcamentos/novo')}
          />
        )}
      </div>

      {data && hasAny && (
        <>
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={data.total}
            onPage={list.setPage}
            onPageSize={list.setPageSize}
          />
          <ListTotals count={data.total} totals={[{ label: 'Valor total', value: data.totals.value ?? 0 }]} />
        </>
      )}
    </section>
  );
}
