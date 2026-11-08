import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatDate, formatMoney } from '../lib/format.ts';
import { PERIODS, type PeriodKey, periodRange } from '../lib/listFilters.ts';

interface ReportInfo {
  id: string;
  group: string;
  title: string;
  description: string;
  dateLabel: string | null;
}

type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';

interface ReportResult extends ReportInfo {
  columns: { key: string; label: string; type: ColumnType }[];
  rows: Record<string, string | number | null>[];
  truncated: boolean;
  limit: number;
}

const PAGE_SIZE = 50;
const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function formatValue(value: string | number | null, type: ColumnType) {
  if (value === null) return '—';
  if (type === 'money') return formatMoney(Number(value));
  if (type === 'number') return quantity.format(Number(value));
  if (type === 'percent') return `${quantity.format(Number(value))}%`;
  if (type === 'date') return formatDate(String(value));
  return String(value);
}

// Central de relatórios: cada grupo vê só os relatórios dos módulos que pode ver. O cálculo é no servidor.
export default function ReportsPage() {
  const profile = useProfile();
  const catalog = useQuery({ queryKey: ['/reports'], queryFn: () => api<ReportInfo[]>('/reports') });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('thisMonth');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = period === 'custom' ? custom : periodRange(period);

  const term = search.trim().toLowerCase();
  const visible = (catalog.data ?? []).filter(
    (report) => !term || `${report.title} ${report.description}`.toLowerCase().includes(term),
  );
  const groups = [...new Set(visible.map((report) => report.group))];
  const current = catalog.data?.find((report) => report.id === selected) ?? null;

  return (
    <section className="reports">
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">GESTÃO DO NEGÓCIO</span>
          <h2>Relatórios</h2>
          <p>Escolha um relatório e o período. Dá para imprimir ou exportar em CSV.</p>
        </div>
      </div>

      <div className="reports-layout">
        <nav className="panel reports-catalog" aria-label="Relatórios disponíveis">
          <div className="form-grid reports-search">
            <label>
              Buscar relatório
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
          {catalog.isPending ? (
            <div className="loading">Carregando...</div>
          ) : groups.length ? (
            groups.map((group) => (
              <details key={group} open>
                <summary>{group}</summary>
                <ul>
                  {visible
                    .filter((report) => report.group === group)
                    .map((report) => (
                      <li key={report.id}>
                        <button
                          type="button"
                          aria-current={report.id === selected ? 'true' : undefined}
                          onClick={() => setSelected(report.id)}
                        >
                          {report.title}
                        </button>
                      </li>
                    ))}
                </ul>
              </details>
            ))
          ) : (
            <EmptyState text="Nenhum relatório encontrado." />
          )}
        </nav>

        <div className="reports-view">
          {current ? (
            <ReportView
              key={current.id}
              report={current}
              range={current.dateLabel ? range : { from: '', to: '' }}
              canExport={can(profile, 'reports.export')}
              filters={
                current.dateLabel && (
                  <div className="panel form-grid reports-filters">
                    <label>
                      Período ({current.dateLabel.toLowerCase()})
                      <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
                        {PERIODS.map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </label>
                    {period === 'custom' && (
                      <>
                        <label>
                          De
                          <input
                            type="date"
                            value={custom.from}
                            onChange={(event) =>
                              setCustom((value) => ({ ...value, from: event.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Até
                          <input
                            type="date"
                            value={custom.to}
                            onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )
              }
            />
          ) : (
            <div className="panel">
              <EmptyState text="Escolha um relatório na lista." />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface ViewProps {
  report: ReportInfo;
  range: { from: string; to: string };
  canExport: boolean;
  filters: React.ReactNode;
}

function ReportView({ report, range, canExport, filters }: ViewProps) {
  const [page, setPage] = useState(0);
  const params = new URLSearchParams(Object.entries(range).filter(([, value]) => value)).toString();
  const path = `/reports/${report.id}${params ? `?${params}` : ''}`;
  const result = useQuery({ queryKey: [path], queryFn: () => api<ReportResult>(path) });
  const data = result.data;
  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const periodText =
    range.from || range.to
      ? `${range.from ? formatDate(range.from) : 'início'} a ${range.to ? formatDate(range.to) : 'hoje'}`
      : 'Todo o período';

  return (
    <>
      <div className="reports-title">
        <div>
          <h3>{report.title}</h3>
          <p>{report.description}</p>
          {report.dateLabel && <p className="list-print-summary">Período: {periodText}</p>}
        </div>
        <div className="reports-actions">
          <button type="button" className="button secondary" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir
          </button>
          {canExport && (
            <a
              className="button secondary"
              href={`/api/reports/${report.id}/csv${params ? `?${params}` : ''}`}
            >
              <Download size={16} /> Exportar CSV
            </a>
          )}
        </div>
      </div>
      {filters}

      <div className="panel table-panel">
        {result.isPending ? (
          <div className="loading">Carregando...</div>
        ) : result.isError ? (
          <EmptyState text={result.error.message} />
        ) : rows.length && data ? (
          <>
            {data.truncated && (
              <p className="notice" role="status">
                O resultado passou de {data.limit} linhas e foi cortado. Escolha um período menor.
              </p>
            )}
            <div className="table-wrap">
              <table aria-label={report.title}>
                <thead>
                  <tr>
                    {data.columns.map((column) => (
                      <th key={column.key} className={column.type === 'text' ? undefined : 'numeric'}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row, index) => (
                    // Linhas de relatório não têm id próprio: a posição na página identifica a linha.
                    // biome-ignore lint/suspicious/noArrayIndexKey: ordem fixa vinda do servidor
                    <tr key={page * PAGE_SIZE + index}>
                      {data.columns.map((column) => (
                        <td key={column.key} className={column.type === 'text' ? undefined : 'numeric'}>
                          {formatValue(row[column.key] ?? null, column.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.columns.some((column) => column.type === 'money') && (
                  <tfoot>
                    <tr>
                      {data.columns.map((column, index) => (
                        <td key={column.key} className={column.type === 'text' ? undefined : 'numeric'}>
                          {column.type === 'money'
                            ? formatMoney(rows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0))
                            : index === 0
                              ? `Total (${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'})`
                              : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {pages > 1 && (
              <div className="reports-pages">
                <button
                  type="button"
                  className="button secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {page + 1} de {pages}
                </span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState text="Nenhum registro no período." />
        )}
      </div>
    </>
  );
}
