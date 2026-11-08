import { purchaseSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ReasonModal, type ReasonRequest } from '../actions/ReasonModal.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { Modal } from '../components/Modal.tsx';
import { useToast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatCode, formatDate, formatMoney, label, todayIso } from '../lib/format.ts';

interface PurchaseRow {
  id: number;
  number: number;
  supplierId: number | null;
  supplierName: string | null;
  purchaseDate: string;
  dueDate: string;
  status: 'draft' | 'received' | 'cancelled';
  freight: number;
  total: number;
  notes: string | null;
  expenseId: number | null;
  items?: number;
}
type PurchaseDetail = Omit<PurchaseRow, 'items'> & { items: PurchaseItem[] };
interface PurchaseItem {
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}
interface ProductOption {
  id: number;
  name: string;
  type: string;
  stock: number | null;
  cost: number | null;
}

export default function PurchasesPage() {
  const profile = useProfile();
  const list = useQuery({ queryKey: ['/purchases'], queryFn: () => api<PurchaseRow[]>('/purchases') });
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [confirm, setConfirm] = useState<PurchaseRow | null>(null);
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const notify = useToast();
  const client = useQueryClient();
  const canCreate = can(profile, 'purchases.create');

  const cancel = (row: PurchaseRow) =>
    setRequest({
      eyebrow: 'COMPRAS',
      title: `Cancelar a compra ${formatCode(row.number)}`,
      description:
        row.status === 'received'
          ? 'O estoque recebido volta e a conta a pagar é apagada. O custo médio do produto não muda.'
          : undefined,
      confirmLabel: 'Cancelar compra',
      suggestions: ['Mercadoria veio errada', 'Fornecedor não entregou', 'Lançada por engano'],
      submit: (reason) => api(`/purchases/${row.id}/cancel`, { method: 'POST', body: { reason } }),
      message: `Compra ${formatCode(row.number)} cancelada.`,
    });

  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">CADASTROS</span>
          <h2>Compras</h2>
          <p>Ao receber a compra, o estoque entra, o custo médio é atualizado e a conta a pagar é criada.</p>
        </div>
        {canCreate && (
          <button type="button" className="button primary" onClick={() => setOpen('new')}>
            <Plus size={17} /> Nova compra
          </button>
        )}
      </div>

      <div className="panel table-panel">
        {list.isPending ? (
          <div className="loading">Carregando...</div>
        ) : list.isError ? (
          <EmptyState text={list.error.message} />
        ) : list.data.length ? (
          <div className="table-wrap">
            <table aria-label="Compras">
              <thead>
                <tr>
                  <th>Compra</th>
                  <th>Fornecedor</th>
                  <th>Data</th>
                  <th>Vencimento</th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className="link-cell" onClick={() => setOpen(row.id)}>
                        {formatCode(row.number)}
                      </button>
                    </td>
                    <td>{row.supplierName ?? '—'}</td>
                    <td>{formatDate(row.purchaseDate)}</td>
                    <td>{formatDate(row.dueDate)}</td>
                    <td>{row.items}</td>
                    <td>
                      <span className={`status ${row.status === 'received' ? 'completed' : row.status}`}>
                        {label(row.status)}
                      </span>
                    </td>
                    <td>
                      <strong>{formatMoney(row.total)}</strong>
                    </td>
                    <td className="actions">
                      {row.status === 'draft' && can(profile, 'purchases.receive') && (
                        <button type="button" onClick={() => setConfirm(row)}>
                          Receber
                        </button>
                      )}
                      {row.status !== 'cancelled' && can(profile, 'purchases.cancel') && (
                        <button type="button" onClick={() => cancel(row)}>
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            text="Nenhuma compra ainda."
            action={canCreate ? 'Lançar a primeira compra' : undefined}
            onClick={() => setOpen('new')}
          />
        )}
      </div>

      {open !== null && <PurchaseModal id={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
      {confirm && <ReceiveModal purchase={confirm} onClose={() => setConfirm(null)} />}
      {request && (
        <ReasonModal
          request={request}
          onClose={() => setRequest(null)}
          onDone={() => {
            setRequest(null);
            void client.invalidateQueries();
            notify(request.message);
          }}
        />
      )}
    </section>
  );
}

function ReceiveModal({ purchase, onClose }: { purchase: PurchaseRow; onClose: () => void }) {
  const notify = useToast();
  const client = useQueryClient();
  const receive = useMutation({
    mutationFn: () => api(`/purchases/${purchase.id}/receive`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries();
      notify(`Compra ${formatCode(purchase.number)} recebida.`);
      onClose();
    },
    onError: (error) => notify(error.message, 'error'),
  });
  return (
    <Modal eyebrow="COMPRAS" title={`Receber a compra ${formatCode(purchase.number)}`} onClose={onClose}>
      <p>
        O estoque dos itens entra agora, o custo médio dos produtos é atualizado e é criada uma conta a pagar
        de <strong>{formatMoney(purchase.total)}</strong> com vencimento em {formatDate(purchase.dueDate)}.
      </p>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Voltar
        </button>
        <button
          type="button"
          className="button primary"
          disabled={receive.isPending}
          onClick={() => receive.mutate()}
        >
          {receive.isPending ? 'Recebendo...' : 'Receber compra'}
        </button>
      </div>
    </Modal>
  );
}

interface Line {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
}
let lineKey = 0;
const newLine = (item?: PurchaseItem): Line => ({
  key: ++lineKey,
  productId: item ? String(item.productId) : '',
  quantity: item ? String(item.quantity) : '1',
  unitCost: item ? String(item.unitCost) : '0',
});

function PurchaseModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['/purchases', id],
    queryFn: () => api<PurchaseDetail>(`/purchases/${id}`),
    enabled: id !== null,
  });
  if (id !== null && detail.isPending) {
    return (
      <Modal eyebrow="COMPRAS" title="Compra" onClose={onClose}>
        <div className="loading">Carregando...</div>
      </Modal>
    );
  }
  return <PurchaseForm purchase={id === null ? null : (detail.data ?? null)} onClose={onClose} />;
}

function PurchaseForm({ purchase, onClose }: { purchase: PurchaseDetail | null; onClose: () => void }) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const editable = purchase
    ? purchase.status === 'draft' && can(profile, 'purchases.update')
    : can(profile, 'purchases.create');
  const suppliers = useQuery({
    queryKey: ['/people', 'supplier', ''],
    queryFn: () => api<{ id: number; name: string }[]>('/people?role=supplier'),
  });
  const products = useQuery({ queryKey: ['/products'], queryFn: () => api<ProductOption[]>('/products') });
  const stocked = products.data?.filter((row) => row.type === 'product' && row.stock !== null) ?? [];
  const [form, setForm] = useState({
    supplierId: purchase?.supplierId ? String(purchase.supplierId) : '',
    purchaseDate: purchase?.purchaseDate ?? todayIso(),
    dueDate: purchase?.dueDate ?? todayIso(),
    freight: String(purchase?.freight ?? 0),
    notes: purchase?.notes ?? '',
  });
  const [lines, setLines] = useState<Line[]>(() => (purchase ? purchase.items.map(newLine) : [newLine()]));
  const [error, setError] = useState<string | null>(null);
  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );
  const total = Math.round((subtotal + Number(form.freight || 0)) * 100) / 100;

  const save = useMutation({
    mutationFn: (body: unknown) =>
      purchase
        ? api(`/purchases/${purchase.id}`, { method: 'PUT', body })
        : api('/purchases', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['/purchases'] });
      notify(purchase ? 'Compra salva.' : 'Compra lançada como rascunho.');
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      supplierId: Number(form.supplierId),
      purchaseDate: form.purchaseDate,
      dueDate: form.dueDate,
      freight: Number(form.freight || 0),
      notes: form.notes,
      items: lines
        .filter((line) => line.productId)
        .map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
    };
    if (!form.supplierId) return setError('Escolha o fornecedor.');
    const parsed = purchaseSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    save.mutate(payload);
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <Modal
      eyebrow="COMPRAS"
      title={purchase ? `Compra ${formatCode(purchase.number)} · ${label(purchase.status)}` : 'Nova compra'}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} noValidate>
        <fieldset className="form-grid" disabled={!editable}>
          <label className="full-row">
            Fornecedor
            <select name="supplierId" value={form.supplierId} onChange={set('supplierId')}>
              <option value="">Escolha o fornecedor</option>
              {suppliers.data?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data da compra
            <input type="date" name="purchaseDate" value={form.purchaseDate} onChange={set('purchaseDate')} />
          </label>
          <label>
            Vencimento da conta a pagar
            <input type="date" name="dueDate" value={form.dueDate} onChange={set('dueDate')} />
          </label>
          {lines.map((line, index) => (
            <div key={line.key} className="order-line">
              <label>
                {`Item ${index + 1}`}
                <select
                  name={`items.${index}.productId`}
                  value={line.productId}
                  onChange={(event) => {
                    const product = stocked.find((row) => String(row.id) === event.target.value);
                    updateLine(line.key, {
                      productId: event.target.value,
                      unitCost: String(product?.cost ?? 0),
                    });
                  }}
                >
                  <option value="">Selecione</option>
                  {stocked.map((row) => (
                    <option key={row.id} value={row.id}>
                      {`${row.name} (estoque: ${row.stock})`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qtd.
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  name={`items.${index}.quantity`}
                  value={line.quantity}
                  onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                />
              </label>
              <label>
                Custo unitário (R$)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  name={`items.${index}.unitCost`}
                  value={line.unitCost}
                  onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="button secondary"
                aria-label={`Remover item ${index + 1}`}
                disabled={lines.length <= 1}
                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="full-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => setLines((current) => [...current, newLine()])}
            >
              <Plus size={14} /> Adicionar item
            </button>
          </div>
          <label>
            Frete (R$)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              name="freight"
              value={form.freight}
              onChange={set('freight')}
            />
          </label>
          <label>
            Observações
            <input type="text" name="notes" maxLength={500} value={form.notes} onChange={set('notes')} />
          </label>
        </fieldset>
        <p className="purchase-total">
          Total da compra: <strong>{formatMoney(total)}</strong>
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {editable ? 'Cancelar' : 'Fechar'}
          </button>
          {editable && (
            <button type="submit" className="button primary" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar rascunho'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
