import { PAGE_SIZES } from '@arandue/shared/schemas';
import { Printer } from 'lucide-react';
import { formatDate, formatMoney } from '../lib/format.ts';
import {
  type PageSize,
  PERIODS,
  type PeriodKey,
  periodRange,
  type useListFilters,
} from '../lib/listFilters.ts';

const periodLabel = (key: PeriodKey) => PERIODS.find(([value]) => value === key)?.[1] ?? '';

interface FiltersProps {
  control: ReturnType<typeof useListFilters>;
  dateLabel: string;
  textLabel: string;
  statuses?: readonly (readonly [string, string])[];
}

export function ListFilters({ control, dateLabel, textLabel, statuses }: FiltersProps) {
  const { filters, setFilters, clear, active } = control;
  const update = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));
  const statusName = statuses?.find(([value]) => value === filters.status)?.[1];
  const summary = [
    filters.from || filters.to
      ? `${dateLabel}: ${filters.from ? formatDate(filters.from) : 'início'} a ${filters.to ? formatDate(filters.to) : 'hoje em diante'}`
      : null,
    filters.period !== 'custom' && filters.period !== 'all' ? periodLabel(filters.period) : null,
    statusName ? `Status: ${statusName}` : null,
    filters.text ? `${textLabel}: ${filters.text}` : null,
  ].filter(Boolean);

  return (
    <>
      <details className="list-filters panel" open>
        <summary>Filtros</summary>
        <div className="form-grid list-filters-grid">
          <label>
            {dateLabel}
            <select
              name="period"
              value={filters.period}
              onChange={(event) => {
                const period = event.target.value as PeriodKey;
                update(period === 'custom' ? { period } : { period, ...periodRange(period) });
              }}
            >
              {PERIODS.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              name="from"
              value={filters.from}
              onChange={(event) => update({ period: 'custom', from: event.target.value })}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              name="to"
              value={filters.to}
              onChange={(event) => update({ period: 'custom', to: event.target.value })}
            />
          </label>
          {statuses && (
            <label>
              Status
              <select
                name="status"
                value={filters.status}
                onChange={(event) => update({ status: event.target.value })}
              >
                <option value="">Todos</option>
                {statuses.map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {textLabel}
            <input
              type="search"
              name="search"
              maxLength={120}
              value={filters.text}
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <div className="list-filters-clear">
            <button type="button" className="button secondary" disabled={!active} onClick={clear}>
              Limpar filtros
            </button>
          </div>
        </div>
      </details>
      {/* Na impressão, o formulário some e fica só o resumo do que foi aplicado. */}
      {summary.length > 0 && <p className="list-print-summary">{summary.join(' · ')}</p>}
    </>
  );
}

interface TotalsProps {
  // Registros de todo o filtro, não só da página.
  count: number;
  totals: { label: string; value: number }[];
}

export function ListTotals({ count, totals }: TotalsProps) {
  return (
    <div className="list-totals">
      <dl>
        <div>
          <dt>Registros</dt>
          <dd>{count}</dd>
        </div>
        {totals.map((total) => (
          <div key={total.label}>
            <dt>{total.label}</dt>
            <dd>{formatMoney(total.value)}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="button secondary list-print" onClick={() => window.print()}>
        <Printer size={15} /> Imprimir página
      </button>
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageSize: PageSize;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="pagination-range">{`${first}–${last} de ${total}`}</span>
      <label>
        Por página
        <select
          name="pageSize"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="pagination-pages">
        <button
          type="button"
          className="button secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <span>{`Página ${page} de ${pages}`}</span>
        <button
          type="button"
          className="button secondary"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}
