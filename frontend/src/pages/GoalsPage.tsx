import { goalsSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { GoalProgress } from '../components/GoalProgress.tsx';
import { useToast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatMoney, todayIso } from '../lib/format.ts';
import { type Goals, projection } from '../lib/goals.ts';

export default function GoalsPage() {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const goals = useQuery({ queryKey: ['/goals', month], queryFn: () => api<Goals>(`/goals?month=${month}`) });

  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">GESTÃO</span>
          <h2>Metas de venda</h2>
          <p>Meta do mês para a empresa e para cada vendedor, com o que já foi vendido.</p>
        </div>
        <label className="goals-month">
          Mês
          <input
            type="month"
            name="month"
            value={month}
            onChange={(event) => event.target.value && setMonth(event.target.value)}
          />
        </label>
      </div>
      {goals.isPending ? (
        <div className="loading">Carregando...</div>
      ) : goals.isError ? (
        <EmptyState text={goals.error.message} />
      ) : (
        <GoalsForm key={month} goals={goals.data} />
      )}
    </section>
  );
}

const toText = (value: number | null) => (value === null ? '' : String(value));
const toAmount = (text: string) => (text.trim() === '' ? null : Number(text));

function GoalsForm({ goals }: { goals: Goals }) {
  const profile = useProfile();
  const client = useQueryClient();
  const notify = useToast();
  const canEdit = can(profile, 'settings.update');
  const [company, setCompany] = useState(toText(goals.company.target));
  const [sellers, setSellers] = useState(
    () => new Map(goals.sellers.map((row) => [row.userId, toText(row.target)])),
  );
  const [error, setError] = useState<string | null>(null);
  const forecast = projection(goals.month, goals.company.achieved);

  const save = useMutation({
    mutationFn: (body: unknown) => api<Goals>('/goals', { method: 'PUT', body }),
    onSuccess: (data) => {
      client.setQueryData(['/goals', goals.month], data);
      void client.invalidateQueries({ queryKey: ['/dashboard'] });
      notify('Metas salvas.');
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      month: goals.month,
      company: toAmount(company),
      sellers: goals.sellers.map((row) => ({
        userId: row.userId,
        amount: toAmount(sellers.get(row.userId) ?? ''),
      })),
    };
    const parsed = goalsSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os valores.');
    setError(null);
    save.mutate(payload);
  }

  return (
    <div className="goals">
      <section className="panel" aria-label="Andamento">
        <h3>Andamento</h3>
        <GoalProgress label="Empresa" row={goals.company} />
        {forecast !== null && (
          <p className="muted">
            No ritmo atual, o mês fecha em <strong>{formatMoney(forecast)}</strong>
            {goals.company.target ? ` (${Math.round((forecast / goals.company.target) * 100)}% da meta)` : ''}
            .
          </p>
        )}
        {goals.sellers.map((row) => (
          <GoalProgress key={row.userId} label={row.name} row={row} />
        ))}
      </section>

      <form className="panel form-grid" onSubmit={submit} noValidate aria-label="Definir metas">
        <h3 className="full-row">Metas do mês (R$)</h3>
        <label className="full-row">
          Empresa
          <input
            name="company"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Sem meta"
            disabled={!canEdit}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
        {goals.sellers.map((row) => (
          <label key={row.userId}>
            {row.name}
            <input
              name={`seller-${row.userId}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Sem meta"
              disabled={!canEdit}
              value={sellers.get(row.userId) ?? ''}
              onChange={(event) =>
                setSellers((current) => new Map(current).set(row.userId, event.target.value))
              }
            />
          </label>
        ))}
        {error && (
          <p className="form-error full-row" role="alert">
            {error}
          </p>
        )}
        {canEdit ? (
          <div className="modal-actions full-row">
            <button type="submit" className="button primary" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar metas'}
            </button>
          </div>
        ) : (
          <p className="muted full-row">Só quem altera as configurações da empresa define as metas.</p>
        )}
      </form>
    </div>
  );
}
