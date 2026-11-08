import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';

export interface PaymentConditionRow {
  id: number;
  name: string;
  downPaymentPercent: number;
  downPaymentMethod: string | null;
  days: number[];
  method: string | null;
  active: boolean;
}

// "Entrada 50% (PIX) + 30 dias (Boleto)" ou "30/60/90 dias (Boleto)".
export const termsLabel = (row: Omit<PaymentConditionRow, 'id' | 'name' | 'active'>) =>
  [
    row.downPaymentPercent > 0
      ? `Entrada ${row.downPaymentPercent.toLocaleString('pt-BR')}%${row.downPaymentMethod ? ` (${row.downPaymentMethod})` : ''}`
      : null,
    row.days.length ? `${row.days.join('/')} dias${row.method ? ` (${row.method})` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' + ');

// Condições ativas, para escolher no orçamento e no pedido.
export const usePaymentConditions = () =>
  useQuery({
    queryKey: ['/payment-conditions'],
    queryFn: () => api<PaymentConditionRow[]>('/payment-conditions'),
  });
