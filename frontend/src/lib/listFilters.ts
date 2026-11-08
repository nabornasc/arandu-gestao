import type { ListPage, PAGE_SIZES } from '@arandue/shared/schemas';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { todayIso } from './format.ts';

// Filtros das telas de lista. O servidor filtra, pagina e soma os totais sobre todo o filtro.

export const PERIODS = [
  ['all', 'Todos'],
  ['yesterday', 'Ontem'],
  ['today', 'Hoje'],
  ['tomorrow', 'Amanhã'],
  ['thisWeek', 'Esta semana'],
  ['nextWeek', 'Semana que vem'],
  ['lastWeek', 'Semana passada'],
  ['thisMonth', 'Este mês'],
  ['nextMonth', 'Mês que vem'],
  ['lastMonth', 'Mês passado'],
  ['thisYear', 'Este ano'],
  ['nextYear', 'Ano que vem'],
  ['lastYear', 'Ano passado'],
  ['custom', 'Personalizado'],
] as const;
export type PeriodKey = (typeof PERIODS)[number][0];

const iso = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

// A semana vai de segunda a domingo. "Personalizado" mantém as datas digitadas.
export function periodRange(key: Exclude<PeriodKey, 'custom'>, today = todayIso()) {
  if (key === 'all') return { from: '', to: '' };
  const [year = 0, month = 1, day = 1] = today.split('-').map(Number);
  const m = month - 1;
  const days = (offset: number) => iso(year, m, day + offset);
  const week = (offset: number) => {
    const fromMonday = (new Date(Date.UTC(year, m, day)).getUTCDay() + 6) % 7;
    const monday = day - fromMonday + offset * 7;
    return { from: iso(year, m, monday), to: iso(year, m, monday + 6) };
  };
  const monthOf = (offset: number) => ({ from: iso(year, m + offset, 1), to: iso(year, m + offset + 1, 0) });
  const yearOf = (offset: number) => ({ from: iso(year + offset, 0, 1), to: iso(year + offset, 11, 31) });
  switch (key) {
    case 'yesterday':
      return { from: days(-1), to: days(-1) };
    case 'today':
      return { from: days(0), to: days(0) };
    case 'tomorrow':
      return { from: days(1), to: days(1) };
    case 'thisWeek':
      return week(0);
    case 'nextWeek':
      return week(1);
    case 'lastWeek':
      return week(-1);
    case 'thisMonth':
      return monthOf(0);
    case 'nextMonth':
      return monthOf(1);
    case 'lastMonth':
      return monthOf(-1);
    case 'thisYear':
      return yearOf(0);
    case 'nextYear':
      return yearOf(1);
    case 'lastYear':
      return yearOf(-1);
  }
}

export interface ListFilterState {
  period: PeriodKey;
  from: string;
  to: string;
  status: string;
  text: string;
}

const EMPTY: ListFilterState = { period: 'all', from: '', to: '', status: '', text: '' };

// "initial" define o que a tela mostra ao abrir e ao limpar os filtros.
export function useListFilters(initial: Partial<ListFilterState> = {}) {
  const start = { ...EMPTY, ...initial };
  const [filters, setFilters] = useState(start);
  return {
    filters,
    setFilters,
    clear: () => setFilters(start),
    active: JSON.stringify(filters) !== JSON.stringify(start),
  };
}

// Espera o usuário parar de digitar antes de consultar o servidor.
export function useDebounced<T>(value: T, delay = 300) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return current;
}

export type PageSize = (typeof PAGE_SIZES)[number];

// Lista paginada no servidor com os filtros da tela. Mudar um filtro volta para a primeira página;
// enquanto a página nova carrega, a anterior continua na tela.
export function useServerList<T>(
  endpoint: string,
  control: ReturnType<typeof useListFilters>,
  enabled = true,
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const text = useDebounced(control.filters.text.trim());
  const { from, to, status } = control.filters;

  const filterKey = JSON.stringify([from, to, status, text, pageSize]);
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) {
    setLastKey(filterKey);
    setPage(1);
  }

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (status) params.set('status', status);
  if (text) params.set('q', text);
  const search = params.toString();
  const query = useQuery({
    queryKey: [endpoint, 'page', search],
    queryFn: () => api<ListPage<T>>(`${endpoint}?${search}`),
    placeholderData: keepPreviousData,
    enabled,
  });
  return { query, page, setPage, pageSize, setPageSize };
}
