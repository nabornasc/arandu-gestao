import { conditionInstallments } from '@arandue/shared/schemas';
import { Plus, Trash2 } from 'lucide-react';
import { type Dispatch, type SetStateAction, useId, useState } from 'react';
import type { OrderReceivable } from '../lib/documents.ts';
import { formatDate, formatMoney, todayIso } from '../lib/format.ts';
import { termsLabel, usePaymentConditions } from '../lib/paymentConditions.ts';

export interface InstallmentRow {
  key: number;
  dueDate: string;
  amount: string;
  method: string;
}

let rowKey = 0;
export const newInstallment = (initial?: {
  dueDate: string;
  amount: number;
  method: string | null;
}): InstallmentRow => ({
  key: ++rowKey,
  dueDate: initial?.dueDate ?? todayIso(),
  amount: initial ? String(initial.amount) : '0',
  method: initial?.method ?? '',
});

export const rowsToInstallments = (rows: InstallmentRow[]) =>
  rows.map((row) => ({ dueDate: row.dueDate, amount: Number(row.amount), method: row.method }));

export const METHODS = [
  'Pix',
  'Dinheiro',
  'Cartão de crédito',
  'Cartão de débito',
  'Boleto',
  'Transferência',
];

// Mesmo dia nos meses seguintes. Dia 31 em mês mais curto cai no último dia do mês.
function addMonths(iso: string, months: number) {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, last))).toISOString().slice(0, 10);
}

// Divide em centavos: a diferença do arredondamento fica na primeira parcela, e a soma fecha com o total.
function split(total: number, count: number, firstDate: string, method: string): InstallmentRow[] {
  const cents = Math.round(total * 100);
  const part = Math.floor(cents / count);
  return Array.from({ length: count }, (_, index) =>
    newInstallment({
      dueDate: addMonths(firstDate, index),
      amount: (index === 0 ? part + (cents - part * count) : part) / 100,
      method,
    }),
  );
}

interface Props {
  rows: InstallmentRow[];
  setRows: Dispatch<SetStateAction<InstallmentRow[]>>;
  total: number;
  // Data do documento: a entrada vence nela, e os prazos da condição contam a partir dela.
  baseDate: string;
}

export function InstallmentsEditor({ rows, setRows, total, baseDate }: Props) {
  const listId = useId();
  const conditions = usePaymentConditions();
  const [conditionId, setConditionId] = useState('');
  const condition = conditions.data?.find((row) => String(row.id) === conditionId);
  const [count, setCount] = useState('3');
  const [firstDate, setFirstDate] = useState(todayIso);
  const [method, setMethod] = useState('');
  const update = (key: number, patch: Partial<InstallmentRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const sum = rows.reduce((value, row) => value + Number(row.amount || 0), 0);
  const matches = Math.round(sum * 100) === Math.round(total * 100);
  const validCount = Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 60;

  return (
    <>
      <datalist id={listId}>
        {METHODS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <label className="full-row">
        Condição de pagamento
        <select
          name="paymentCondition"
          value={conditionId}
          onChange={(event) => {
            setConditionId(event.target.value);
            const chosen = conditions.data?.find((row) => String(row.id) === event.target.value);
            // Escolher a condição já gera as parcelas, que continuam editáveis.
            if (chosen && total > 0) {
              setRows(conditionInstallments(chosen, total, baseDate).map((row) => newInstallment(row)));
            }
          }}
        >
          <option value="">Parcelar à mão</option>
          {conditions.data?.map((row) => (
            <option key={row.id} value={row.id}>
              {`${row.name} — ${termsLabel(row)}`}
            </option>
          ))}
        </select>
      </label>
      {condition && (
        <div className="installments-generate full-row">
          <button
            type="button"
            className="button secondary"
            disabled={total <= 0}
            onClick={() =>
              setRows(conditionInstallments(condition, total, baseDate).map((row) => newInstallment(row)))
            }
          >
            Recalcular pela condição
          </button>
        </div>
      )}
      {!condition && (
        <>
          <label>
            Número de parcelas
            <input
              type="number"
              min="1"
              max="60"
              step="1"
              name="installmentCount"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <label>
            Primeiro vencimento
            <input
              type="date"
              name="installmentFirstDate"
              value={firstDate}
              onChange={(event) => setFirstDate(event.target.value)}
            />
          </label>
          <label>
            Forma de pagamento
            <input
              type="text"
              list={listId}
              maxLength={40}
              name="installmentMethod"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
          </label>
          <div className="installments-generate">
            <button
              type="button"
              className="button secondary"
              disabled={!validCount || !firstDate || total <= 0}
              onClick={() => setRows(split(total, Number(count), firstDate, method))}
            >
              Gerar parcelas
            </button>
          </div>
        </>
      )}

      {rows.map((row, index) => (
        <div key={row.key} className="order-line">
          <label>
            {`Vencimento da parcela ${index + 1}`}
            <input
              type="date"
              name={`installments.${index}.dueDate`}
              value={row.dueDate}
              onChange={(event) => update(row.key, { dueDate: event.target.value })}
            />
          </label>
          <label>
            Valor (R$)
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              name={`installments.${index}.amount`}
              value={row.amount}
              onChange={(event) => update(row.key, { amount: event.target.value })}
            />
          </label>
          <label>
            Forma
            <input
              type="text"
              list={listId}
              maxLength={40}
              name={`installments.${index}.method`}
              value={row.method}
              onChange={(event) => update(row.key, { method: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            aria-label={`Remover parcela ${index + 1}`}
            onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="full-row">
        <button
          type="button"
          className="button secondary"
          onClick={() => setRows((current) => [...current, newInstallment()])}
        >
          <Plus size={14} /> Adicionar parcela
        </button>
      </div>
      {rows.length > 0 && (
        <p className={matches ? 'full-row' : 'full-row form-error'} role="status">
          Soma das parcelas: {formatMoney(sum)} de {formatMoney(total)}
          {!matches && '. Ajuste os valores para salvar.'}
        </p>
      )}
    </>
  );
}

export function InstallmentsTable({
  installments,
}: {
  installments: { dueDate: string; amount: number; method: string | null }[];
}) {
  return (
    <div className="table-wrap full-row">
      <table className="items-table">
        <thead>
          <tr>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Forma</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {installments.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa, e as parcelas podem ser iguais.
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{formatDate(item.dueDate)}</td>
              <td>{item.method ?? '—'}</td>
              <td>{formatMoney(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RECEIVABLE_STATUS: Record<OrderReceivable['status'], string> = {
  open: 'Em aberto',
  settled: 'Recebida',
  cancelled: 'Cancelada',
};

// Contas a receber do pedido, com o que já foi pago.
export function ReceivablesTable({ receivables }: { receivables: OrderReceivable[] }) {
  return (
    <div className="table-wrap full-row">
      <table className="items-table" aria-label="Contas a receber do pedido">
        <thead>
          <tr>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Forma</th>
            <th>Valor</th>
            <th>Pago</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {receivables.map((item) => (
            <tr key={item.id}>
              <td>
                {item.position}/{receivables.length}
              </td>
              <td>{formatDate(item.dueDate)}</td>
              <td>{item.method ?? '—'}</td>
              <td>{formatMoney(item.amount)}</td>
              <td>{formatMoney(item.paidAmount)}</td>
              <td>
                {item.status === 'open' && item.paidAmount > 0 ? 'Parcial' : RECEIVABLE_STATUS[item.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
