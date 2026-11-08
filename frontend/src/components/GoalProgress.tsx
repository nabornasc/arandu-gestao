import { formatMoney } from '../lib/format.ts';
import { type GoalRow, progressOf } from '../lib/goals.ts';

// Barra da meta: vendido de quanto, em %. Sem meta, só o vendido.
export function GoalProgress({ label, row }: { label: string; row: GoalRow }) {
  const progress = progressOf(row);
  return (
    <div className="goal-progress">
      <div className="goal-progress-text">
        <strong>{label}</strong>
        <span>
          {formatMoney(row.achieved)}
          {row.target !== null && ` de ${formatMoney(row.target)} · ${Math.round((progress ?? 0) * 100)}%`}
        </span>
      </div>
      {progress !== null ? (
        <meter
          min={0}
          max={1}
          value={Math.min(progress, 1)}
          aria-label={`${label}: ${Math.round(progress * 100)}% da meta`}
        />
      ) : (
        <small className="muted">Sem meta para o mês.</small>
      )}
    </div>
  );
}
