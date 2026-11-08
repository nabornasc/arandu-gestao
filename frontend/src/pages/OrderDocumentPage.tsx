import { orderCreateSchema, orderUpdateSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { ActionMenu } from '../actions/ActionMenu.tsx';
import { orderActions } from '../actions/registry.ts';
import {
  CustomerSelect,
  DiscountField,
  ItemsTable,
  Totals,
  useDiscount,
} from '../components/DocumentParts.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { useAccountOptions } from '../components/FormModal.tsx';
import { HistoryPanel } from '../components/HistoryPanel.tsx';
import {
  type InstallmentRow,
  InstallmentsEditor,
  ReceivablesTable,
  rowsToInstallments,
} from '../components/InstallmentsEditor.tsx';
import {
  ItemLines,
  type Line,
  linesSubtotal,
  linesToItems,
  newLine,
  type Product,
} from '../components/ItemLines.tsx';
import { OrderPayments } from '../components/OrderPayments.tsx';
import { useToast } from '../components/Toast.tsx';
import { TracePanel } from '../components/TracePanel.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { type Order, useOrder } from '../lib/documents.ts';
import { formatCode, formatDate, label, todayIso } from '../lib/format.ts';
import { useTab, useTabDirty, useTabTitle } from '../workspace/tab.ts';

// Tela do pedido. Novo: itens, pagamento e conta. Existente: itens fixos (já baixaram o estoque);
// cliente, data, desconto e observações editáveis; status muda pelo menu de ações.
export default function OrderDocumentPage() {
  const { params } = useTab();
  const id = params.id ? Number(params.id) : null;
  const order = useOrder(id);
  useTabTitle(id === null ? 'Novo pedido' : order.data ? `Pedido ${formatCode(order.data.number)}` : null);

  if (id !== null && order.isPending) return <div className="loading">Carregando pedido...</div>;
  if (order.isError) return <EmptyState text={order.error.message} />;
  return <OrderEditor key={order.data?.id ?? 'novo'} order={order.data ?? null} />;
}

function OrderEditor({ order }: { order: Order | null }) {
  const profile = useProfile();
  const tab = useTab();
  const notify = useToast();
  const client = useQueryClient();
  const formId = useId();
  const products = useQuery({
    queryKey: ['/products'],
    queryFn: () => api<Product[]>('/products'),
    enabled: !order,
  });
  const accounts = useAccountOptions(!order);
  const canSettle = can(profile, 'receivables.settle');
  const editable = order
    ? order.status !== 'cancelled' && can(profile, 'orders.update')
    : can(profile, 'orders.create');

  const [customerId, setCustomerId] = useState(
    order?.customerId ? String(order.customerId) : (tab.params.customerId ?? ''),
  );
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? todayIso());
  const discount = useDiscount(order?.discount ?? 0);
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order?.deliveryDate ?? '');
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [bankAccountId, setBankAccountId] = useState('');
  const [lines, setLines] = useState<Line[]>(() =>
    order ? order.items.map((item) => newLine(item)) : [newLine()],
  );
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const subtotal = linesSubtotal(lines);
  const discountValue = discount.value(subtotal);
  const newTotal = Math.max(0, Math.round((subtotal - discountValue) * 100) / 100);

  const header = {
    customerId: customerId ? Number(customerId) : null,
    orderDate,
    discount: discountValue,
    notes,
    deliveryDate: deliveryDate || null,
  };
  const payload = order
    ? header
    : {
        ...header,
        status,
        bankAccountId: status === 'paid' && bankAccountId ? Number(bankAccountId) : null,
        items: linesToItems(lines),
        installments: status === 'pending' ? rowsToInstallments(installments) : [],
      };
  const [baseline, setBaseline] = useState(() => JSON.stringify(payload));
  useTabDirty(editable && JSON.stringify(payload) !== baseline);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      order
        ? api<Order>(`/orders/${order.id}`, { method: 'PUT', body })
        : api<Order>('/orders', { method: 'POST', body }),
    onSuccess: (saved) => {
      setBaseline(JSON.stringify(payload));
      void client.invalidateQueries();
      notify(order ? 'Pedido salvo.' : `Pedido ${formatCode(saved.number)} criado. O estoque foi baixado.`);
      if (!order) tab.replaceWith(`/pedidos/${saved.id}`);
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    // No pedido existente, só os campos alterados: mexer no desconto de um pedido já recebido
    // exige a permissão de baixa, e editar só a observação não deve exigi-la.
    const saved = JSON.parse(baseline) as Record<string, unknown>;
    const body = order
      ? Object.fromEntries(
          Object.entries(payload).filter(
            ([key, value]) => JSON.stringify(value) !== JSON.stringify(saved[key]),
          ),
        )
      : payload;
    const parsed = (order ? orderUpdateSchema : orderCreateSchema).safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    save.mutate(body);
  }

  const title = order ? `Pedido ${formatCode(order.number)}` : 'Novo pedido';

  return (
    <section className="document">
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">PEDIDO</span>
          <h2>
            {title} {order && <span className={`status ${order.status}`}>{label(order.status)}</span>}
          </h2>
          <p>
            {order
              ? 'Itens já baixaram o estoque. Recebimento, conclusão e cancelamento ficam no menu de ações.'
              : 'Escolha os itens; ao criar, o estoque é baixado.'}
          </p>
        </div>
        <div className="document-actions">
          {editable && (
            <button type="submit" form={formId} className="button primary" disabled={save.isPending}>
              <Save size={16} /> {save.isPending ? 'Salvando...' : order ? 'Salvar' : 'Criar pedido'}
            </button>
          )}
          {order && (
            <ActionMenu
              actions={orderActions}
              record={order}
              label={`pedido ${title}`}
              exclude={['order.open']}
            />
          )}
        </div>
      </div>

      {order && (
        <div className="section-tabs" role="tablist" aria-label="Seções do pedido">
          <button
            type="button"
            role="tab"
            aria-selected={!showHistory}
            className={showHistory ? undefined : 'active'}
            onClick={() => setShowHistory(false)}
          >
            Documento
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showHistory}
            className={showHistory ? 'active' : undefined}
            onClick={() => setShowHistory(true)}
          >
            Histórico
          </button>
        </div>
      )}

      <form id={formId} className="panel" onSubmit={submit} noValidate hidden={showHistory}>
        <div className="form-grid">
          <CustomerSelect
            value={customerId}
            onChange={setCustomerId}
            disabled={!editable}
            emptyLabel="Não informado (venda avulsa)"
          />
          <label>
            Data da venda
            <input
              name="orderDate"
              type="date"
              required
              disabled={!editable}
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </label>
          <label>
            Previsão de entrega
            <input
              name="deliveryDate"
              type="date"
              disabled={!editable}
              value={deliveryDate}
              onChange={(event) => setDeliveryDate(event.target.value)}
            />
            {order?.deliveredOn && (
              <small className="muted">Entregue em {formatDate(order.deliveredOn)}</small>
            )}
          </label>

          {order ? (
            <ItemsTable items={order.items} />
          ) : (
            <ItemLines lines={lines} setLines={setLines} products={products.data} />
          )}

          <DiscountField control={discount} subtotal={subtotal} disabled={!editable} />
          {!order && (
            <label>
              Status
              <select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as 'pending' | 'paid')}
              >
                <option value="pending">Pendente (a receber)</option>
                {canSettle && <option value="paid">Pago (entra no caixa)</option>}
              </select>
            </label>
          )}
          {!order && status === 'paid' && (
            <label>
              Conta de recebimento
              <select
                name="bankAccountId"
                value={bankAccountId}
                onChange={(event) => setBankAccountId(event.target.value)}
              >
                <option value="">Conta padrão</option>
                {accounts.data?.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bankName} — {account.accountName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!order && status === 'pending' && (
            <details className="full-row document-more">
              <summary>Parcelas</summary>
              <div className="form-grid">
                <InstallmentsEditor
                  rows={installments}
                  setRows={setInstallments}
                  total={newTotal}
                  baseDate={orderDate}
                />
              </div>
            </details>
          )}
          {order && <ReceivablesTable receivables={order.receivables} />}
          <label className="full-row">
            Observações
            <input
              type="text"
              maxLength={500}
              placeholder="Ex.: entregar até sexta-feira"
              name="notes"
              disabled={!editable}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        <Totals
          subtotal={linesSubtotal(lines)}
          discount={discountValue}
          freight={order?.freight}
          otherCharges={order?.otherCharges}
          label="Total do pedido"
        />

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {order && <OrderPayments order={order} />}
      {order && !showHistory && <TracePanel type="order" id={order.id} />}
      {order && showHistory && <HistoryPanel type="order" id={order.id} />}
    </section>
  );
}
