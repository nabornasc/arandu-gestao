import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import type { Customer, DocumentItem } from '../lib/documents.ts';
import { formatMoney } from '../lib/format.ts';
import { useSnippets } from '../lib/library.ts';
import { QuickCustomerButton } from './QuickCreate.tsx';

// Peças comuns às telas de orçamento e pedido.

export function CustomerSelect({
  value,
  onChange,
  disabled,
  emptyLabel = 'Não informado',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  // Só pessoas com o papel de cliente (cadastro único).
  const customers = useQuery({
    queryKey: ['/people', 'customer', ''],
    queryFn: () => api<Customer[]>('/people?role=customer'),
  });
  return (
    <div className="customer-field">
      <label>
        Cliente
        <select
          name="customerId"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      {/* Cadastro rápido: o cliente novo já fica escolhido. */}
      {!disabled && <QuickCustomerButton onCreated={(id) => onChange(String(id))} />}
    </div>
  );
}

export function ItemsTable({ items }: { items: DocumentItem[] }) {
  return (
    <div className="table-wrap full-row">
      <table className="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qtd.</th>
            <th>Preço</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.productName}
                {(item.groupName || item.width) && (
                  <small className="item-details">
                    {[
                      item.groupName,
                      item.width ? `${item.width} × ${item.length} ${item.measureUnit ?? 'm'}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                )}
              </td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.unitPrice)}</td>
              <td>{formatMoney(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Totals({
  subtotal,
  discount,
  freight = 0,
  otherCharges = 0,
  label,
}: {
  subtotal: number;
  discount: number;
  freight?: number;
  otherCharges?: number;
  label: string;
}) {
  return (
    <div className="order-summary-box">
      <div>
        <span>Subtotal:</span> <strong>{formatMoney(subtotal)}</strong>
      </div>
      {discount > 0 && (
        <div>
          <span>Desconto:</span> <strong>− {formatMoney(discount)}</strong>
        </div>
      )}
      {freight > 0 && (
        <div>
          <span>Frete:</span> <strong>{formatMoney(freight)}</strong>
        </div>
      )}
      {otherCharges > 0 && (
        <div>
          <span>Outras despesas:</span> <strong>{formatMoney(otherCharges)}</strong>
        </div>
      )}
      <div className="order-total-highlight">
        <span>{label}:</span>{' '}
        <strong>{formatMoney(Math.max(0, subtotal - discount + freight + otherCharges))}</strong>
      </div>
    </div>
  );
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Desconto em R$ ou em %. O documento guarda sempre o valor em R$; em %, ele é recalculado
// sobre o subtotal enquanto os itens mudam. Ao reabrir, o desconto aparece em R$.
export function useDiscount(initial: number) {
  const [mode, setMode] = useState<'value' | 'percent'>('value');
  const [input, setInput] = useState(String(initial));
  const value = (subtotal: number) => {
    const typed = Number(input || 0);
    return mode === 'percent' ? round2((subtotal * typed) / 100) : typed;
  };
  return { mode, setMode, input, setInput, value };
}

export function DiscountField({
  control,
  subtotal,
  disabled,
}: {
  control: ReturnType<typeof useDiscount>;
  subtotal: number;
  disabled?: boolean;
}) {
  const { mode, setMode, input, setInput, value } = control;
  return (
    <div className="discount-field">
      <label>
        {mode === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max={mode === 'percent' ? 100 : undefined}
          step="0.01"
          name="discount"
          disabled={disabled}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>
      <label>
        Em
        <select
          name="discountMode"
          aria-label="Tipo de desconto"
          disabled={disabled}
          value={mode}
          onChange={(event) => {
            const next = event.target.value as 'value' | 'percent';
            // Troca a unidade mantendo o mesmo desconto.
            const current = value(subtotal);
            setInput(
              next === 'percent'
                ? String(subtotal ? round2((current / subtotal) * 100) : 0)
                : String(current),
            );
            setMode(next);
          }}
        >
          <option value="value">R$</option>
          <option value="percent">%</option>
        </select>
      </label>
      {mode === 'percent' && <small className="muted">{`= ${formatMoney(value(subtotal))}`}</small>}
    </div>
  );
}

const DAY = 86_400_000;
const isoToUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

// Validade em dias e data andam juntas: digitar um muda o outro. Conta a partir do dia do documento.
export function ValidityFields({
  baseDate,
  validUntil,
  onChange,
  disabled,
}: {
  baseDate: string;
  validUntil: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const days = validUntil ? String(Math.round((isoToUtc(validUntil) - isoToUtc(baseDate)) / DAY)) : '';
  return (
    <div className="validity-fields">
      <label>
        Validade (dias)
        <input
          name="validDays"
          type="number"
          inputMode="numeric"
          min="0"
          max="3650"
          step="1"
          disabled={disabled}
          value={days}
          onChange={(event) => {
            const typed = event.target.value;
            if (typed === '') return onChange('');
            const count = Math.min(3650, Math.max(0, Math.trunc(Number(typed))));
            onChange(new Date(isoToUtc(baseDate) + count * DAY).toISOString().slice(0, 10));
          }}
        />
      </label>
      <label>
        Válido até
        <input
          name="validUntil"
          type="date"
          disabled={disabled}
          value={validUntil}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

// Junta o texto da biblioteca ao que já foi escrito, separado por uma linha em branco.
export const appendText = (current: string, addition: string) =>
  current.trim() ? `${current.trimEnd()}\n\n${addition}` : addition;

// Escolher um texto da biblioteca o acrescenta às cláusulas do orçamento.
export function SnippetPicker({ onInsert }: { onInsert: (body: string) => void }) {
  const snippets = useSnippets();
  if (!snippets.data?.length) return null;
  return (
    <label className="full-row">
      Inserir texto da biblioteca
      <select
        name="snippet"
        value=""
        onChange={(event) => {
          const chosen = snippets.data?.find((row) => String(row.id) === event.target.value);
          if (chosen) onInsert(chosen.body);
        }}
      >
        <option value="">Escolha um texto para acrescentar</option>
        {snippets.data.map((row) => (
          <option key={row.id} value={row.id}>
            {row.title}
          </option>
        ))}
      </select>
    </label>
  );
}
