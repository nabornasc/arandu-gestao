import { ORDER_STATUSES } from '@arandue/shared/schemas';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ActionMenu } from '../actions/ActionMenu.tsx';
import { orderActions } from '../actions/registry.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { ListFilters, ListTotals, Pagination } from '../components/ListFilters.tsx';
import { can, useProfile } from '../lib/auth.ts';
import type { Order } from '../lib/documents.ts';
import { formatCode, formatDate, formatMoney, label, todayIso } from '../lib/format.ts';
import { useListFilters, useServerList } from '../lib/listFilters.ts';

const STATUSES = ORDER_STATUSES.map((status) => [status, label(status)] as const);

export default function OrdersPage() {
  const profile = useProfile();
  const navigate = useNavigate();
  const canCreate = can(profile, 'orders.create');
  const control = useListFilters();
  const list = useServerList<Order>('/orders', control);
  const data = list.query.data;
  const visible = data?.rows ?? [];
  const hasAny = control.active || (data?.total ?? 0) > 0;

  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">VENDAS</span>
          <h2>Vendas e pedidos</h2>
          <p>Registre cada venda e acompanhe o recebimento e o estoque.</p>
        </div>
        {canCreate && (
          <button type="button" className="button primary" onClick={() => navigate('/pedidos/novo')}>
            <Plus size={17} /> Novo pedido
          </button>
        )}
      </div>

      {hasAny && (
        <ListFilters
          control={control}
          dateLabel="Data do pedido"
          textLabel="Cliente ou número"
          statuses={STATUSES}
        />
      )}

      <div className="panel table-panel">
        {list.query.isPending ? (
          <div className="loading">Carregando pedidos...</div>
        ) : list.query.isError ? (
          <EmptyState text={list.query.error.message} />
        ) : visible.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => {
                  const code = formatCode(order.number);
                  const summary = order.items
                    .map((item) => `${item.quantity}x ${item.productName}`)
                    .join(', ');
                  return (
                    <tr key={order.id}>
                      <td>
                        <button
                          type="button"
                          className="link-cell"
                          onClick={() => navigate(`/pedidos/${order.id}`)}
                        >
                          {code}
                        </button>
                      </td>
                      <td>
                        {order.customerName ?? 'Cliente não informado'}
                        {order.customerOrderNumber && (
                          <small className="muted cell-note">OC {order.customerOrderNumber}</small>
                        )}
                      </td>
                      <td>{formatDate(order.orderDate)}</td>
                      <td title={summary} className="truncate">
                        {summary}
                      </td>
                      <td>
                        <span className={`status ${order.status}`}>{label(order.status)}</span>
                        {order.status === 'pending' &&
                          order.receivables.some((item) => item.paidAmount > 0) && (
                            <small className="muted"> · parcial</small>
                          )}
                        <DeliveryNote order={order} />
                      </td>
                      <td>
                        <strong>{formatMoney(order.total)}</strong>
                      </td>
                      <td className="actions">
                        <ActionMenu actions={orderActions} record={order} label={`pedido ${code}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            text={hasAny ? 'Nenhum registro com esses filtros.' : 'Nenhum pedido cadastrado ainda.'}
            action={canCreate && !hasAny ? 'Criar primeiro pedido' : undefined}
            onClick={() => navigate('/pedidos/novo')}
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
          <ListTotals
            count={data.total}
            totals={[
              { label: 'Valor total', value: data.totals.value ?? 0 },
              { label: 'Em aberto', value: data.totals.pending ?? 0 },
            ]}
          />
        </>
      )}
    </section>
  );
}

// Situação da entrega ao lado do status: entregue, atrasada ou com a data prevista.
function DeliveryNote({ order }: { order: Order }) {
  if (order.status === 'cancelled') return null;
  if (order.deliveredOn) return <small className="muted"> · entregue</small>;
  if (!order.deliveryDate) return null;
  const late = order.deliveryDate < todayIso();
  return (
    <small className={late ? 'negative' : 'muted'}>
      {late ? ' · entrega atrasada' : ` · entrega ${formatDate(order.deliveryDate)}`}
    </small>
  );
}
