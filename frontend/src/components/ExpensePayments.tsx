import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ReasonModal, type ReasonRequest } from '../actions/ReasonModal.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatDate, formatMoney, todayIso } from '../lib/format.ts';
import { useAccountOptions } from './FormModal.tsx';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

type Row = Record<string, unknown> & { id: number };

interface ExpensePayment {
  id: number;
  paidOn: string;
  principal: number;
  interest: number;
  discount: number;
  paid: number;
  method: string | null;
  bankAccount: string | null;
  userName: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

const balanceOf = (row: Row) => Math.round((Number(row.amount) - Number(row.paidAmount ?? 0)) * 100) / 100;

// Botão "Baixas" em cada conta a pagar: pagar (total ou parcial) e ver ou estornar as baixas.
export function ExpensePaymentsButton({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Baixas
      </button>
      {open && <ExpensePaymentsModal expense={row} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExpensePaymentsModal({ expense, onClose }: { expense: Row; onClose: () => void }) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const payments = useQuery({
    queryKey: ['/expenses', expense.id, 'payments'],
    queryFn: () => api<ExpensePayment[]>(`/expenses/${expense.id}/payments`),
  });
  const balance = balanceOf(expense);
  const canPay = can(profile, 'payables.pay') && balance > 0;
  const canReverse = can(profile, 'payables.reverse');

  const ask = (payment: ExpensePayment) =>
    setRequest({
      eyebrow: 'CONTAS A PAGAR',
      title: `Estornar a baixa de ${formatDate(payment.paidOn)}`,
      description:
        'A saída some do caixa e o valor volta a ficar em aberto. A baixa fica registrada com o motivo.',
      confirmLabel: 'Estornar baixa',
      suggestions: ['Pagamento não compensado', 'Lançado por engano', 'Valor incorreto'],
      withPassword: true,
      submit: (reason, password) =>
        api(`/expense-payments/${payment.id}/reverse`, { method: 'POST', body: { reason, password } }),
      message: 'Baixa estornada.',
    });

  return (
    <Modal eyebrow="CONTAS A PAGAR" title={String(expense.description)} onClose={onClose} wide>
      <p className="stock-balance">
        Valor {formatMoney(Number(expense.amount))} · pago {formatMoney(Number(expense.paidAmount ?? 0))} ·{' '}
        <strong>em aberto {formatMoney(balance)}</strong>
      </p>
      {canPay && <PayForm expense={expense} balance={balance} />}

      <h4>Baixas</h4>
      {payments.isPending ? (
        <div className="loading">Carregando...</div>
      ) : payments.data?.length ? (
        <div className="table-wrap">
          <table aria-label="Baixas da conta">
            <thead>
              <tr>
                <th>Data</th>
                <th>Pago</th>
                <th>Juros</th>
                <th>Desconto</th>
                <th>Conta</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {payments.data.map((payment) => (
                <tr key={payment.id} className={payment.reversedAt ? 'inactive' : undefined}>
                  <td>{formatDate(payment.paidOn)}</td>
                  <td>{formatMoney(payment.paid)}</td>
                  <td>{formatMoney(payment.interest)}</td>
                  <td>{formatMoney(payment.discount)}</td>
                  <td>{payment.bankAccount ?? '—'}</td>
                  <td>
                    {payment.reversedAt ? (
                      <span title={payment.reversalReason ?? undefined}>
                        Estornada: {payment.reversalReason}
                      </span>
                    ) : canReverse ? (
                      <button type="button" className="link-button" onClick={() => ask(payment)}>
                        Estornar
                      </button>
                    ) : (
                      'Ativa'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nenhuma baixa ainda.</p>
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
    </Modal>
  );
}

function PayForm({ expense, balance }: { expense: Row; balance: number }) {
  const notify = useToast();
  const client = useQueryClient();
  const accounts = useAccountOptions();
  const [form, setForm] = useState({
    paid: String(balance),
    interest: '0',
    discount: '0',
    paidOn: todayIso(),
    bankAccountId: expense.bankAccountId ? String(expense.bankAccountId) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const pay = useMutation({
    mutationFn: (body: unknown) => api('/expenses/pay', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries();
      notify('Pagamento registrado.');
    },
    onError: (err) => setError(err.message),
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    pay.mutate({
      paidOn: form.paidOn,
      bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : null,
      items: [
        {
          expenseId: expense.id,
          paid: Number(form.paid),
          interest: Number(form.interest || 0),
          discount: Number(form.discount || 0),
        },
      ],
    });
  }

  return (
    <form className="form-grid" onSubmit={submit} noValidate aria-label="Registrar pagamento">
      <label>
        Valor pago (R$)
        <input
          name="paid"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.paid}
          onChange={set('paid')}
        />
      </label>
      <label>
        Data do pagamento
        <input name="paidOn" type="date" value={form.paidOn} onChange={set('paidOn')} />
      </label>
      <label>
        Juros (R$)
        <input
          name="interest"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.interest}
          onChange={set('interest')}
        />
      </label>
      <label>
        Desconto (R$)
        <input
          name="discount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.discount}
          onChange={set('discount')}
        />
      </label>
      <label className="full-row">
        Conta de débito
        <select name="bankAccountId" value={form.bankAccountId} onChange={set('bankAccountId')}>
          <option value="">Sem conta (não sai do caixa)</option>
          {accounts.data?.map((account) => (
            <option key={account.id} value={account.id}>
              {account.bankName} — {account.accountName}
            </option>
          ))}
        </select>
      </label>
      <p className="muted full-row">Valor menor que o saldo deixa a conta parcialmente paga.</p>
      {error && (
        <p className="form-error full-row" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions full-row">
        <button type="submit" className="button primary" disabled={pay.isPending}>
          {pay.isPending ? 'Salvando...' : 'Registrar pagamento'}
        </button>
      </div>
    </form>
  );
}

// Pagar em lote: as contas em aberto da página, com o saldo de cada uma, numa conta e data só.
export function ExpensesBatchPay({ rows }: { rows: Row[] }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const pending = rows.filter((row) => row.status === 'pending' && balanceOf(row) > 0);
  if (!can(profile, 'payables.pay') || pending.length < 2) return null;
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        Pagar em lote
      </button>
      {open && <BatchModal rows={pending} onClose={() => setOpen(false)} />}
    </>
  );
}

function BatchModal({ rows, onClose }: { rows: Row[]; onClose: () => void }) {
  const notify = useToast();
  const client = useQueryClient();
  const accounts = useAccountOptions();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [paidOn, setPaidOn] = useState(todayIso());
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const total = rows.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + balanceOf(row), 0);
  const pay = useMutation({
    mutationFn: (body: unknown) => api('/expenses/pay', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries();
      notify(`${selected.size} contas pagas.`);
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const toggle = (id: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Modal eyebrow="CONTAS A PAGAR" title="Pagar em lote" onClose={onClose} wide>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected.size) return setError('Selecione ao menos uma conta.');
          setError(null);
          pay.mutate({
            paidOn,
            bankAccountId: accountId ? Number(accountId) : null,
            items: [...selected].map((expenseId) => ({ expenseId })),
          });
        }}
        noValidate
      >
        <ul className="batch-list" aria-label="Contas em aberto">
          {rows.map((row) => (
            <li key={row.id}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                />
                {`${String(row.description)} · vence ${formatDate(String(row.expenseDate))} · ${formatMoney(balanceOf(row))}`}
              </label>
            </li>
          ))}
        </ul>
        <div className="form-grid">
          <label>
            Data do pagamento
            <input
              type="date"
              name="paidOn"
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </label>
          <label>
            Conta de débito
            <select
              name="bankAccountId"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">A conta de cada despesa</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} — {account.accountName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          Total: <strong>{formatMoney(total)}</strong>
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
          <button type="submit" className="button primary" disabled={pay.isPending}>
            {pay.isPending ? 'Salvando...' : 'Pagar selecionadas'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
