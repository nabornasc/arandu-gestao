import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.ts';
import { formatMoney } from '../lib/format.ts';
import { EmptyState } from './EmptyState.tsx';
import { useToast } from './Toast.tsx';

interface AssistantReport {
  month: string;
  quotaBrl: number;
  maxQuotaBrl: number;
  spentBrl: number;
  questions: number;
  warning: boolean;
  byDay: { day: string; brl: number; questions: number }[];
  byUser: { name: string; brl: number; questions: number }[];
}

const thisMonth = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

// Consumo do assistente de IA no mês, por dia e por usuário, e a cota mensal da empresa.
export function AssistantSettings({ readOnly }: { readOnly: boolean }) {
  const [month, setMonth] = useState(thisMonth);
  const report = useQuery({
    queryKey: ['/assistant/report', month],
    queryFn: () => api<AssistantReport>(`/assistant/report?month=${month}`),
  });

  return (
    <section className="panel" aria-labelledby="titulo-assistente">
      <div className="panel-heading">
        <div>
          <h3 id="titulo-assistente">Assistente de IA</h3>
          <p>Quanto o assistente custou no mês e o limite mensal da empresa.</p>
        </div>
        <label className="assistant-month">
          Mês
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(event) => event.target.value && setMonth(event.target.value)}
          />
        </label>
      </div>
      {report.isPending ? (
        <div className="loading">Carregando...</div>
      ) : report.isError ? (
        <EmptyState text={report.error.message} />
      ) : (
        <ReportView data={report.data} readOnly={readOnly} current={month === thisMonth()} />
      )}
    </section>
  );
}

function ReportView({
  data,
  readOnly,
  current,
}: {
  data: AssistantReport;
  readOnly: boolean;
  current: boolean;
}) {
  const used = data.quotaBrl > 0 ? data.spentBrl / data.quotaBrl : data.spentBrl > 0 ? 1 : 0;
  const max = Math.max(...data.byDay.map((row) => row.brl), 0.01);
  return (
    <>
      <div className="result-line mei-limit">
        <span>
          {data.questions} {data.questions === 1 ? 'pergunta' : 'perguntas'} no mês
        </span>
        <strong className={data.warning ? 'negative' : undefined}>
          {formatMoney(data.spentBrl)} de {formatMoney(data.quotaBrl)}
          {data.quotaBrl > 0 && ` · ${Math.round(used * 100)}%`}
        </strong>
        <meter min={0} max={1} low={0.6} high={0.8} optimum={0} value={Math.min(used, 1)}>
          {Math.round(used * 100)}%
        </meter>
      </div>

      <ol className="bar-chart assistant-days" aria-label="Custo do assistente por dia">
        {data.byDay.map((row) => {
          const day = Number(row.day.slice(8));
          return (
            <li key={row.day} title={`Dia ${day}: ${formatMoney(row.brl)} · ${row.questions} perguntas`}>
              <span
                className="bar"
                style={{ height: row.brl > 0 ? `${Math.max(2, (row.brl / max) * 100)}%` : 0 }}
              />
              <span className="bar-label">{day === 1 || day % 5 === 0 ? day : ''}</span>
              <span className="sr-only">
                Dia {day}: {formatMoney(row.brl)}, {row.questions} perguntas
              </span>
            </li>
          );
        })}
      </ol>

      {data.byUser.length ? (
        <div className="table-wrap">
          <table aria-label="Consumo por usuário">
            <thead>
              <tr>
                <th>Usuário</th>
                <th className="number">Perguntas</th>
                <th className="number">Custo</th>
              </tr>
            </thead>
            <tbody>
              {data.byUser.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td className="number">{row.questions}</td>
                  <td className="number">{formatMoney(row.brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Ninguém usou o assistente neste mês." />
      )}

      {current && <QuotaForm quota={data.quotaBrl} max={data.maxQuotaBrl} readOnly={readOnly} />}
    </>
  );
}

function QuotaForm({ quota, max, readOnly }: { quota: number; max: number; readOnly: boolean }) {
  const client = useQueryClient();
  const notify = useToast();
  const [value, setValue] = useState(String(quota));
  const save = useMutation({
    mutationFn: (quotaBrl: number) => api('/assistant/quota', { method: 'PUT', body: { quotaBrl } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['/assistant/report'] });
      void client.invalidateQueries({ queryKey: ['/assistant/usage'] });
      notify('Limite do assistente atualizado.');
    },
    onError: (error: Error) => notify(error.message, 'error'),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(Number(value.replace(',', '.')));
  }

  return (
    <form className="assistant-quota" onSubmit={submit}>
      <label>
        Limite mensal (R$)
        <input
          className="assistant-quota-input"
          type="number"
          min={0}
          max={max}
          step="0.01"
          value={value}
          disabled={readOnly}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p className="muted assistant-quota-note">
        Até {formatMoney(max)} por mês. Ao chegar no limite, o assistente para até o mês seguinte. Zero
        desliga o assistente para todos.
      </p>
      {!readOnly && (
        <button
          type="submit"
          className="button secondary"
          disabled={save.isPending || value === '' || Number(value) === quota}
        >
          Salvar limite
        </button>
      )}
    </form>
  );
}
