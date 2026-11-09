import { inventorySchema } from '@arandue/shared/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatDate, todayIso } from '../lib/format.ts';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

type Row = Record<string, unknown> & { id: number };

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Botão "Inventário" na lista de produtos: só para quem ajusta estoque e só se há produto com estoque.
export function InventoryButton({ rows }: { rows: Row[] }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const stocked = rows.filter(
    (row) => row.type === 'product' && row.stock !== null && row.stock !== undefined,
  );
  if (!can(profile, 'products.adjust') || !stocked.length) return null;
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        Inventário
      </button>
      {open && <InventoryPanel products={stocked} onClose={() => setOpen(false)} />}
    </>
  );
}

// Contagem de vários produtos de uma vez. Campo vazio = não contado; só as diferenças viram ajuste.
function InventoryPanel({ products, onClose }: { products: Row[]; onClose: () => void }) {
  const notify = useToast();
  const client = useQueryClient();
  const [reason, setReason] = useState(`Inventário de ${formatDate(todayIso())}`);
  const [filter, setFilter] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const counted = products.filter((row) => (counts[row.id] ?? '') !== '');
  const differences = counted.filter((row) => Number(counts[row.id]) !== Number(row.stock));
  const needle = fold(filter.trim());
  const visible = needle
    ? products.filter((row) => fold(`${row.name} ${row.code ?? ''}`).includes(needle))
    : products;

  const save = useMutation({
    mutationFn: (body: unknown) =>
      api<{ adjusted: number; unchanged: number }>('/products/inventory', { method: 'POST', body }),
    onSuccess: (result) => {
      void client.invalidateQueries();
      notify(
        result.adjusted === 1
          ? 'Inventário registrado: 1 produto ajustado.'
          : `Inventário registrado: ${result.adjusted} produtos ajustados.`,
      );
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      reason,
      items: counted.map((row) => ({ productId: row.id, counted: Number(counts[row.id]) })),
    };
    const parsed = inventorySchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    save.mutate(parsed.data);
  }

  return (
    <Modal eyebrow="ESTOQUE" title="Inventário" onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="inventory">
        <p className="muted">
          Digite a quantidade contada na prateleira. Produto sem contagem fica como está; cada diferença vira
          uma contagem no extrato, com o motivo abaixo.
        </p>
        <div className="form-grid">
          <label>
            Motivo
            <input name="reason" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            Filtrar produtos
            <input
              name="filter"
              type="search"
              placeholder="Nome ou código"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table aria-label="Contagem do inventário">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Saldo atual</th>
                <th>Contado</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const value = counts[row.id] ?? '';
                const diff = value === '' ? null : Number(value) - Number(row.stock);
                const unit = String(row.unit ?? 'UN');
                return (
                  <tr key={row.id}>
                    <td>
                      {String(row.name)}
                      {row.code ? <small className="muted cell-note">{String(row.code)}</small> : null}
                    </td>
                    <td>{`${quantityFormat.format(Number(row.stock))} ${unit}`}</td>
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className="inventory-count"
                        aria-label={`Contado: ${String(row.name)}`}
                        value={value}
                        onChange={(e) => setCounts((current) => ({ ...current, [row.id]: e.target.value }))}
                      />
                    </td>
                    <td className={diff ? (diff > 0 ? 'positive' : 'negative') : 'muted'}>
                      {diff === null
                        ? '—'
                        : diff > 0
                          ? `+${quantityFormat.format(diff)}`
                          : quantityFormat.format(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p role="status" className="muted">
          {`${counted.length} contado(s), ${differences.length} com diferença.`}
        </p>
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
            {save.isPending ? 'Salvando...' : 'Registrar inventário'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
