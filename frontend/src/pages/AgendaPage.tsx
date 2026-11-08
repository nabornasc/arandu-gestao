import { AGENDA_KINDS, type AgendaKind, agendaEventSchema } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../components/EmptyState.tsx';
import { Modal } from '../components/Modal.tsx';
import { useToast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatMoney, todayIso } from '../lib/format.ts';

interface AgendaItem {
  id: string;
  kind: AgendaKind;
  date: string;
  time: string | null;
  title: string;
  detail: string | null;
  amount: number | null;
  path: string | null;
  eventId: number | null;
  done: boolean;
  notes: string | null;
}

type View = 'day' | 'week' | 'month' | 'list';

const VIEWS: [View, string][] = [
  ['day', 'Dia'],
  ['week', 'Semana'],
  ['month', 'Mês'],
  ['list', 'Lista'],
];

const KIND_LABELS: Record<AgendaKind, string> = {
  task: 'Tarefas',
  opportunity: 'Próximas ações do CRM',
  quote: 'Validade de orçamentos',
  receivable: 'Contas a receber',
  payable: 'Contas a pagar',
};

const HIDDEN_KEY = 'arandue:agenda:ocultos';
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

// Datas como texto AAAA-MM-DD, calculadas em UTC para não depender do fuso do navegador.
const parseDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => toIso(new Date(parseDay(iso).getTime() + days * 86_400_000));
const mondayOf = (iso: string) => addDays(iso, -((parseDay(iso).getUTCDay() + 6) % 7));
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, months: number) => {
  const date = parseDay(monthStart(iso));
  date.setUTCMonth(date.getUTCMonth() + months);
  return toIso(date);
};
const lastOfMonth = (iso: string) => addDays(addMonths(iso, 1), -1);

// Só a primeira letra em maiúscula: "Sábado, 7 de novembro", sem mexer no "de".
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const longDate = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

// Período buscado e título de cada visão.
function rangeOf(view: View, anchor: string) {
  if (view === 'day')
    return { from: anchor, to: anchor, title: capitalize(longDate.format(parseDay(anchor))) };
  if (view === 'week') {
    const from = mondayOf(anchor);
    const to = addDays(from, 6);
    return { from, to, title: `${shortDate.format(parseDay(from))} a ${shortDate.format(parseDay(to))}` };
  }
  if (view === 'month') {
    // A grade do mês começa na segunda-feira da primeira semana e vai até o domingo da última.
    const from = mondayOf(monthStart(anchor));
    const to = addDays(mondayOf(lastOfMonth(anchor)), 6);
    return { from, to, title: capitalize(monthName.format(parseDay(monthStart(anchor)))) };
  }
  const to = addDays(anchor, 29);
  return { from: anchor, to, title: `Próximos 30 dias a partir de ${shortDate.format(parseDay(anchor))}` };
}

function step(view: View, anchor: string, direction: 1 | -1) {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  if (view === 'month') return addMonths(anchor, direction);
  return addDays(anchor, 30 * direction);
}

function readHidden(): AgendaKind[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as AgendaKind[];
  } catch {
    return [];
  }
}

// Agenda: tarefas lançadas à mão e prazos que vêm dos documentos (próximas ações, validades e vencimentos).
export default function AgendaPage() {
  const profile = useProfile();
  const navigate = useNavigate();
  const today = todayIso();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(today);
  const [hidden, setHidden] = useState<AgendaKind[]>(readHidden);
  const [editing, setEditing] = useState<AgendaItem | 'new' | null>(null);
  const range = rangeOf(view, anchor);
  const path = `/agenda?from=${range.from}&to=${range.to}`;
  const agenda = useQuery({ queryKey: [path], queryFn: () => api<AgendaItem[]>(path) });
  const items = (agenda.data ?? []).filter((item) => !hidden.includes(item.kind));

  const toggleKind = (kind: AgendaKind) => {
    const next = hidden.includes(kind) ? hidden.filter((item) => item !== kind) : [...hidden, kind];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento: o filtro só não é lembrado.
    }
  };

  const open = (item: AgendaItem) => {
    if (item.kind === 'task') setEditing(item);
    else if (item.path) navigate(item.path);
  };

  return (
    <section className="agenda">
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">ROTINA</span>
          <h2>Agenda</h2>
          <p>Tarefas, próximas ações, validades e vencimentos em um só lugar.</p>
        </div>
        {can(profile, 'agenda.create') && (
          <button type="button" className="button primary" onClick={() => setEditing('new')}>
            <Plus size={17} /> Nova tarefa
          </button>
        )}
      </div>

      <div className="panel agenda-toolbar">
        <fieldset className="view-switch">
          <legend className="sr-only">Visão</legend>
          {VIEWS.map(([value, text]) => (
            <button
              key={value}
              type="button"
              className={`chip${view === value ? ' active' : ''}`}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {text}
            </button>
          ))}
        </fieldset>
        <div className="agenda-nav">
          <button
            type="button"
            className="button secondary"
            aria-label="Anterior"
            onClick={() => setAnchor(step(view, anchor, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="button secondary" onClick={() => setAnchor(today)}>
            Hoje
          </button>
          <button
            type="button"
            className="button secondary"
            aria-label="Próximo"
            onClick={() => setAnchor(step(view, anchor, 1))}
          >
            <ChevronRight size={18} />
          </button>
          <strong className="agenda-period" aria-live="polite">
            {range.title}
          </strong>
        </div>
        <fieldset className="agenda-kinds">
          <legend className="sr-only">Mostrar</legend>
          {AGENDA_KINDS.map((kind) => (
            <label key={kind} className={`checkbox agenda-kind ${kind}`}>
              <input type="checkbox" checked={!hidden.includes(kind)} onChange={() => toggleKind(kind)} />
              {KIND_LABELS[kind]}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="panel">
        {agenda.isPending ? (
          <div className="loading">Carregando...</div>
        ) : agenda.isError ? (
          <EmptyState text={agenda.error.message} />
        ) : view === 'month' ? (
          <MonthGrid
            anchor={anchor}
            from={range.from}
            to={range.to}
            items={items}
            today={today}
            onOpen={open}
          />
        ) : view === 'week' ? (
          <DayColumns from={range.from} days={7} items={items} today={today} onOpen={open} />
        ) : (
          <DayList
            items={items}
            onOpen={open}
            empty={view === 'day' ? 'Nada marcado para este dia.' : 'Nada nos próximos 30 dias.'}
          />
        )}
      </div>

      {editing && (
        <TaskModal
          item={editing === 'new' ? null : editing}
          defaultDate={view === 'day' ? anchor : today}
          canEdit={can(profile, 'agenda.update')}
          canDelete={can(profile, 'agenda.delete')}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

interface ItemProps {
  item: AgendaItem;
  onOpen: (item: AgendaItem) => void;
  compact?: boolean;
}

function AgendaEntry({ item, onOpen, compact }: ItemProps) {
  return (
    <button
      type="button"
      className={`agenda-item ${item.kind}${item.done ? ' done' : ''}`}
      onClick={() => onOpen(item)}
    >
      <span className="agenda-item-title">
        {item.time && <time>{item.time} </time>}
        {item.title}
      </span>
      {!compact && (item.detail || item.amount !== null) && (
        <small>
          {[item.detail, item.amount !== null ? formatMoney(item.amount) : null].filter(Boolean).join(' · ')}
        </small>
      )}
    </button>
  );
}

function DayList({
  items,
  onOpen,
  empty,
}: {
  items: AgendaItem[];
  onOpen: ItemProps['onOpen'];
  empty: string;
}) {
  if (!items.length) return <EmptyState text={empty} />;
  const days = [...new Set(items.map((item) => item.date))];
  return (
    <div className="agenda-list">
      {days.map((day) => (
        <section key={day} aria-label={capitalize(longDate.format(parseDay(day)))}>
          <h3>{capitalize(longDate.format(parseDay(day)))}</h3>
          <ul>
            {items
              .filter((item) => item.date === day)
              .map((item) => (
                <li key={item.id}>
                  <AgendaEntry item={item} onOpen={onOpen} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DayColumns({
  from,
  days,
  items,
  today,
  onOpen,
}: {
  from: string;
  days: number;
  items: AgendaItem[];
  today: string;
  onOpen: ItemProps['onOpen'];
}) {
  const dates = Array.from({ length: days }, (_, index) => addDays(from, index));
  return (
    <div className="agenda-week">
      {dates.map((day, index) => (
        <section
          key={day}
          className={day === today ? 'today' : undefined}
          aria-label={capitalize(longDate.format(parseDay(day)))}
        >
          <h3>
            {WEEKDAYS[index]} <span>{shortDate.format(parseDay(day))}</span>
          </h3>
          <ul>
            {items
              .filter((item) => item.date === day)
              .map((item) => (
                <li key={item.id}>
                  <AgendaEntry item={item} onOpen={onOpen} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const MONTH_LIMIT = 3;

function MonthGrid({
  anchor,
  from,
  to,
  items,
  today,
  onOpen,
}: {
  anchor: string;
  from: string;
  to: string;
  items: AgendaItem[];
  today: string;
  onOpen: ItemProps['onOpen'];
}) {
  const total = Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;
  const dates = Array.from({ length: total }, (_, index) => addDays(from, index));
  const month = anchor.slice(0, 7);
  return (
    <div className="agenda-month">
      {WEEKDAYS.map((day) => (
        <div key={day} aria-hidden="true" className="agenda-month-head">
          {day}
        </div>
      ))}
      {dates.map((day) => {
        const ofDay = items.filter((item) => item.date === day);
        const classes = [day.slice(0, 7) !== month ? 'other' : '', day === today ? 'today' : ''].filter(
          Boolean,
        );
        return (
          <section
            key={day}
            className={classes.join(' ') || undefined}
            aria-label={capitalize(longDate.format(parseDay(day)))}
          >
            <span className="agenda-day-number">{Number(day.slice(8))}</span>
            {ofDay.slice(0, MONTH_LIMIT).map((item) => (
              <AgendaEntry key={item.id} item={item} onOpen={onOpen} compact />
            ))}
            {ofDay.length > MONTH_LIMIT && <small>+{ofDay.length - MONTH_LIMIT} itens</small>}
          </section>
        );
      })}
    </div>
  );
}

interface TaskModalProps {
  item: AgendaItem | null;
  defaultDate: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
}

function TaskModal({ item, defaultDate, canEdit, canDelete, onClose }: TaskModalProps) {
  const client = useQueryClient();
  const notify = useToast();
  const readOnly = item !== null && !canEdit;
  const [form, setForm] = useState({
    title: item?.title ?? '',
    date: item?.date ?? defaultDate,
    time: item?.time ?? '',
    notes: item?.notes ?? '',
    done: item?.done ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const done = (message: string) => {
    void client.invalidateQueries();
    notify(message);
    onClose();
  };
  const save = useMutation({
    mutationFn: (body: unknown) =>
      item
        ? api(`/agenda/events/${item.eventId}`, { method: 'PUT', body })
        : api('/agenda/events', { method: 'POST', body }),
    onSuccess: () => done(item ? 'Tarefa atualizada.' : 'Tarefa criada.'),
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/agenda/events/${item?.eventId}`, { method: 'DELETE' }),
    onSuccess: () => done('Tarefa excluída.'),
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = { ...form, time: form.time || null, notes: form.notes || null };
    const parsed = agendaEventSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    save.mutate(payload);
  }

  const set = (key: 'title' | 'date' | 'time' | 'notes') => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal eyebrow="AGENDA" title={item ? 'Tarefa' : 'Nova tarefa'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="full-row">
            Título
            <input
              name="title"
              maxLength={160}
              value={form.title}
              disabled={readOnly}
              onChange={set('title')}
            />
          </label>
          <label>
            Data
            <input name="date" type="date" value={form.date} disabled={readOnly} onChange={set('date')} />
          </label>
          <label>
            Hora (opcional)
            <input name="time" type="time" value={form.time} disabled={readOnly} onChange={set('time')} />
          </label>
          <label className="full-row">
            Observações
            <textarea
              name="notes"
              maxLength={500}
              rows={3}
              value={form.notes}
              disabled={readOnly}
              onChange={set('notes')}
            />
          </label>
          {item && (
            <label className="checkbox full-row">
              <input
                type="checkbox"
                name="done"
                checked={form.done}
                disabled={readOnly}
                onChange={(event) => setForm((current) => ({ ...current, done: event.target.checked }))}
              />
              Concluída
            </label>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {item && canDelete && (
            <button
              type="button"
              className="button secondary danger-text"
              disabled={remove.isPending}
              onClick={() => window.confirm('Excluir esta tarefa?') && remove.mutate()}
            >
              Excluir
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar
          </button>
          {!readOnly && (
            <button type="submit" className="button primary" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
