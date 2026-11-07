import { STOCK_ADJUSTMENT_KINDS, stockAdjustmentSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatCode, formatDateTime, label } from '../lib/format.ts';
import { EmptyState } from './EmptyState.tsx';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

interface Movement {
  id: number;
  kind: string;
  quantity: number;
  balance: number;
  reason: string | null;
  createdAt: string;
  userName: string | null;
  orderNumber: number | null;
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const formatQuantity = (value: number) => quantityFormat.format(value);
const signed = (value: number) => (value > 0 ? `+${formatQuantity(value)}` : formatQuantity(value));

const KIND_LABELS: Record<(typeof STOCK_ADJUSTMENT_KINDS)[number], string> = {
  in: 'Entrada',
  out: 'Saída',
  count: 'Contagem (saldo passa a ser a quantidade)',
};

type Row = Record<string, unknown> & { id: number };

// Botão "Estoque" na lista de produtos: só para itens que controlam estoque.
export function StockButton({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  if (row.type !== 'product' || row.stock === null || row.stock === undefined) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Estoque
      </button>
      {open && <StockPanel product={row} onClose={() => setOpen(false)} />}
    </>
  );
}

// Ajuste com motivo e extrato do produto.
function StockPanel({ product, onClose }: { product: Row; onClose: () => void }) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const formId = useId();
  const canAdjust = can(profile, 'products.adjust');
  const [form, setForm] = useState({ kind: 'in', quantity: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const movements = useQuery({
    queryKey: ['/products', product.id, 'stock-movements'],
    queryFn: () => api<Movement[]>(`/products/${product.id}/stock-movements`),
  });
  const balance = movements.data?.[0]?.balance ?? Number(product.stock);
  const unit = String(product.unit ?? 'UN');

  const adjust = useMutation({
    mutationFn: (body: unknown) => api(`/products/${product.id}/stock-adjustments`, { method: 'POST', body }),
    onSuccess: () => {
      setForm({ kind: 'in', quantity: '', reason: '' });
      void client.invalidateQueries();
      notify('Estoque ajustado.');
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = { kind: form.kind, quantity: Number(form.quantity), reason: form.reason };
    const parsed = stockAdjustmentSchema.safeParse(payload);
    if (!parsed.success || form.quantity === '') {
      return setError(parsed.success ? 'Informe a quantidade.' : (parsed.error.issues[0]?.message ?? ''));
    }
    setError(null);
    adjust.mutate(payload);
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal eyebrow="ESTOQUE" title={String(product.name)} onClose={onClose} wide>
      <p className="stock-balance">
        Saldo atual: <strong>{`${formatQuantity(balance)} ${unit}`}</strong>
        {product.minStock !== null && product.minStock !== undefined && (
          <span> · mínimo {`${formatQuantity(Number(product.minStock))} ${unit}`}</span>
        )}
      </p>

      {canAdjust && (
        <form id={formId} className="form-grid" onSubmit={submit} noValidate>
          <label>
            Tipo de ajuste
            <select name="kind" value={form.kind} onChange={set('kind')}>
              {STOCK_ADJUSTMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade ({unit})
            <input
              name="quantity"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.quantity}
              onChange={set('quantity')}
            />
          </label>
          <label className="full-row">
            Motivo
            <input
              name="reason"
              maxLength={255}
              placeholder="Ex.: compra do fornecedor, quebra, contagem do mês"
              value={form.reason}
              onChange={set('reason')}
            />
          </label>
          {error && (
            <p className="form-error full-row" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions full-row">
            <button type="submit" className="button primary" disabled={adjust.isPending}>
              {adjust.isPending ? 'Salvando...' : 'Ajustar estoque'}
            </button>
          </div>
        </form>
      )}

      <h4>Extrato</h4>
      {movements.isPending ? (
        <div className="loading">Carregando...</div>
      ) : movements.data?.length ? (
        <div className="table-wrap">
          <table aria-label={`Extrato do estoque: ${String(product.name)}`}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Saldo</th>
                <th>Motivo</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movements.data.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.createdAt)}</td>
                  <td>{label(movement.kind)}</td>
                  <td className={movement.quantity < 0 ? 'negative' : 'positive'}>
                    {signed(movement.quantity)}
                  </td>
                  <td>{formatQuantity(movement.balance)}</td>
                  <td>
                    {movement.reason ?? '—'}
                    {movement.orderNumber !== null &&
                    !movement.reason?.includes(formatCode(movement.orderNumber))
                      ? ` · Pedido ${formatCode(movement.orderNumber)}`
                      : ''}
                  </td>
                  <td>{movement.userName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Nenhuma movimentação registrada." />
      )}
    </Modal>
  );
}
