import { paymentConditionSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { api } from '../lib/api.ts';
import { type PaymentConditionRow, termsLabel } from '../lib/paymentConditions.ts';
import { ListSuggestions } from './ListSuggestions.tsx';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

// Condições de pagamento da empresa. No orçamento e no pedido, a condição escolhida gera as parcelas.
// Desativar tira a condição da escolha sem mudar as parcelas dos documentos que já a usaram.
export function PaymentConditionsSettings({ readOnly }: { readOnly: boolean }) {
  const conditions = useQuery({
    queryKey: ['/payment-conditions', 'all'],
    queryFn: () => api<PaymentConditionRow[]>('/payment-conditions?all=1'),
  });
  const [editing, setEditing] = useState<PaymentConditionRow | 'new' | null>(null);

  return (
    <section className="panel" aria-labelledby="titulo-condicoes">
      <div className="panel-heading">
        <div>
          <h3 id="titulo-condicoes">Condições de pagamento</h3>
          <p>Entrada e prazos que geram as parcelas do orçamento e do pedido.</p>
        </div>
        {!readOnly && (
          <button type="button" className="button secondary" onClick={() => setEditing('new')}>
            <Plus size={14} /> Nova condição
          </button>
        )}
      </div>
      {conditions.isPending ? (
        <div className="loading">Carregando...</div>
      ) : (
        <div className="table-wrap">
          <table aria-label="Condições de pagamento">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Entrada e prazos</th>
                <th>Situação</th>
                {!readOnly && <th aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {conditions.data?.map((row) => (
                <tr key={row.id} className={row.active ? undefined : 'inactive'}>
                  <td>{row.name}</td>
                  <td>{termsLabel(row)}</td>
                  <td>
                    {row.active ? (
                      <span className="status completed">Ativa</span>
                    ) : (
                      <span className="status cancelled">Desativada</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="actions">
                      <button type="button" className="link-button" onClick={() => setEditing(row)}>
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ConditionForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

// "30/60/90" ou "30, 60, 90" viram [30, 60, 90]. Vazio é sem prazos (tudo na entrada).
const parseDays = (text: string) =>
  text
    .split(/[\s,;/]+/)
    .filter(Boolean)
    .map(Number);

function ConditionForm({ initial, onClose }: { initial: PaymentConditionRow | null; onClose: () => void }) {
  const client = useQueryClient();
  const notify = useToast();
  const formId = useId();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    downPaymentPercent: String(initial?.downPaymentPercent ?? 0),
    downPaymentMethod: initial?.downPaymentMethod ?? '',
    days: initial?.days.join('/') ?? '',
    method: initial?.method ?? '',
    active: initial?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      initial
        ? api(`/payment-conditions/${initial.id}`, { method: 'PUT', body })
        : api('/payment-conditions', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['/payment-conditions'] });
      notify(initial ? 'Condição atualizada.' : 'Condição criada.');
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: form.name,
      downPaymentPercent: Number(form.downPaymentPercent || 0),
      downPaymentMethod: form.downPaymentMethod,
      days: parseDays(form.days),
      method: form.method,
      active: form.active,
    };
    if (payload.days.some((day) => !Number.isInteger(day))) {
      return setError('Escreva os prazos em dias inteiros, separados por barra (ex.: 30/60/90).');
    }
    const parsed = paymentConditionSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    save.mutate(payload);
  }

  const set =
    (key: 'name' | 'downPaymentPercent' | 'downPaymentMethod' | 'days' | 'method') =>
    (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      eyebrow="CONDIÇÃO DE PAGAMENTO"
      title={initial ? `Editar ${initial.name}` : 'Nova condição'}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <ListSuggestions id={`${formId}-methods`} kind="payment_method" />
        <div className="form-grid">
          <label className="full-row">
            Nome
            <input name="name" data-autofocus maxLength={80} value={form.name} onChange={set('name')} />
          </label>
          <label>
            Entrada (%)
            <input
              name="downPaymentPercent"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={form.downPaymentPercent}
              onChange={set('downPaymentPercent')}
            />
          </label>
          <label>
            Forma da entrada
            <input
              name="downPaymentMethod"
              list={`${formId}-methods`}
              maxLength={40}
              value={form.downPaymentMethod}
              onChange={set('downPaymentMethod')}
            />
          </label>
          <label>
            Prazos em dias
            <input name="days" placeholder="Ex.: 30/60/90" value={form.days} onChange={set('days')} />
          </label>
          <label>
            Forma das parcelas
            <input
              name="method"
              list={`${formId}-methods`}
              maxLength={40}
              value={form.method}
              onChange={set('method')}
            />
          </label>
          <label className="checkbox full-row">
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            Ativa (aparece no orçamento e no pedido)
          </label>
        </div>
        <p className="muted">
          A entrada vence no dia do documento. Os prazos contam a partir dele: 30/60 são duas parcelas, em 30
          e em 60 dias.
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
            {save.isPending ? 'Salvando...' : 'Salvar condição'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
