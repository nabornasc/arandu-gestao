import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import type { Order } from '../lib/documents.ts';
import { formatMoney, todayIso } from '../lib/format.ts';
import { type InstallmentRow, InstallmentsEditor, rowsToInstallments } from './InstallmentsEditor.tsx';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

// Renegociar: o saldo em aberto do pedido vira novas parcelas. O total do pedido não muda.
export function RenegotiateButton({ order }: { order: Order }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const balance =
    Math.round(
      order.receivables
        .filter((title) => title.status === 'open')
        .reduce((sum, title) => sum + title.amount - title.paidAmount, 0) * 100,
    ) / 100;
  if (order.status !== 'pending' || balance <= 0 || !can(profile, 'receivables.renegotiate')) return null;
  return (
    <div className="full-row">
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        Renegociar parcelas
      </button>
      {/* No <body>: a janela tem o próprio formulário e fica fora do formulário do pedido. */}
      {open &&
        createPortal(
          <RenegotiateModal order={order} balance={balance} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </div>
  );
}

function RenegotiateModal({
  order,
  balance,
  onClose,
}: {
  order: Order;
  balance: number;
  onClose: () => void;
}) {
  const notify = useToast();
  const client = useQueryClient();
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: unknown) => api(`/orders/${order.id}/renegotiate`, { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries();
      notify('Parcelas renegociadas.');
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return setError('Informe o motivo.');
    if (!rows.length) return setError('Gere ou adicione as novas parcelas.');
    setError(null);
    save.mutate({ reason: reason.trim(), installments: rowsToInstallments(rows) });
  }

  return (
    <Modal eyebrow="CONTAS A RECEBER" title="Renegociar parcelas" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <p className="muted">
          O saldo em aberto de <strong>{formatMoney(balance)}</strong> vira as novas parcelas abaixo. Parcela
          com pagamento parcial fica quitada no valor já pago.
        </p>
        <div className="form-grid">
          <InstallmentsEditor rows={rows} setRows={setRows} total={balance} baseDate={todayIso()} />
          <label className="full-row">
            Motivo
            <input
              name="reason"
              maxLength={255}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
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
            {save.isPending ? 'Salvando...' : 'Renegociar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
