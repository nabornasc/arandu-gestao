import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ReasonModal, type ReasonRequest } from '../actions/ReasonModal.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatDate, formatMoney, todayIso } from '../lib/format.ts';
import { useAccountOptions } from './FormModal.tsx';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

export interface Advances {
  balance: number;
  rows: {
    id: number;
    kind: 'advance' | 'use';
    amount: number;
    date: string;
    notes: string | null;
    bankAccount: string | null;
    userName: string | null;
    reversedAt: string | null;
    reversalReason: string | null;
  }[];
}

export const useAdvances = (customerId: number | null) =>
  useQuery({
    queryKey: ['/customers', customerId, 'advances'],
    queryFn: () => api<Advances>(`/customers/${customerId}/advances`),
    enabled: customerId !== null,
  });

// Adiantamentos na ficha do cliente: saldo, registrar e estornar.
export function CustomerAdvances({ customerId, customerName }: { customerId: number; customerName: string }) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const advances = useAdvances(customerId);
  const [adding, setAdding] = useState(false);
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const canReverse = can(profile, 'receivables.reverse');

  return (
    <>
      <div className="panel-heading file-heading">
        <h3>Adiantamentos</h3>
        {can(profile, 'receivables.settle') && (
          <button type="button" className="button secondary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Registrar adiantamento
          </button>
        )}
      </div>
      <p>
        Saldo disponível: <strong>{formatMoney(advances.data?.balance ?? 0)}</strong>
        <span className="muted"> · usado na baixa das contas a receber deste cliente</span>
      </p>
      {advances.data?.rows.length ? (
        <div className="table-wrap">
          <table aria-label="Movimentos de adiantamento">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Detalhe</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {advances.data.rows.map((row) => (
                <tr key={row.id} className={row.reversedAt ? 'inactive' : undefined}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.kind === 'advance' ? 'Adiantamento' : 'Uso na baixa'}</td>
                  <td>{formatMoney(row.kind === 'advance' ? row.amount : -row.amount)}</td>
                  <td>
                    {row.reversedAt
                      ? `Estornado: ${row.reversalReason}`
                      : (row.notes ?? row.bankAccount ?? '—')}
                  </td>
                  <td className="actions">
                    {row.kind === 'advance' && !row.reversedAt && canReverse && (
                      <button
                        type="button"
                        onClick={() =>
                          setRequest({
                            eyebrow: 'ADIANTAMENTO',
                            title: `Estornar adiantamento de ${formatMoney(row.amount)}`,
                            description: 'A entrada sai do caixa. Só vale se o crédito ainda não foi usado.',
                            confirmLabel: 'Estornar adiantamento',
                            suggestions: ['Devolvido ao cliente', 'Lançado por engano'],
                            withPassword: true,
                            submit: (reason, password) =>
                              api(`/advances/${row.id}/reverse`, {
                                method: 'POST',
                                body: { reason, password },
                              }),
                            message: 'Adiantamento estornado.',
                          })
                        }
                      >
                        Estornar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nenhum adiantamento ainda.</p>
      )}
      {adding && (
        <AdvanceForm customerId={customerId} customerName={customerName} onClose={() => setAdding(false)} />
      )}
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
    </>
  );
}

function AdvanceForm({
  customerId,
  customerName,
  onClose,
}: {
  customerId: number;
  customerName: string;
  onClose: () => void;
}) {
  const notify = useToast();
  const client = useQueryClient();
  const accounts = useAccountOptions();
  const [form, setForm] = useState({ amount: '', date: todayIso(), bankAccountId: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: unknown) => api(`/customers/${customerId}/advances`, { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries();
      notify('Adiantamento registrado.');
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!Number(form.amount)) return setError('Informe o valor.');
    if (!form.bankAccountId) return setError('Escolha a conta em que o valor entrou.');
    setError(null);
    save.mutate({
      amount: Number(form.amount),
      date: form.date,
      bankAccountId: Number(form.bankAccountId),
      notes: form.notes,
    });
  }

  return (
    <Modal eyebrow="ADIANTAMENTO" title={`Adiantamento de ${customerName}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>
            Valor (R$)
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              data-autofocus
              value={form.amount}
              onChange={set('amount')}
            />
          </label>
          <label>
            Data
            <input name="date" type="date" value={form.date} onChange={set('date')} />
          </label>
          <label className="full-row">
            Conta em que entrou
            <select name="bankAccountId" value={form.bankAccountId} onChange={set('bankAccountId')}>
              <option value="">Escolha a conta</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} — {account.accountName}
                </option>
              ))}
            </select>
          </label>
          <label className="full-row">
            Observação
            <input name="notes" maxLength={255} value={form.notes} onChange={set('notes')} />
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
            {save.isPending ? 'Salvando...' : 'Registrar adiantamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
