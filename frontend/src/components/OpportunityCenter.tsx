import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Mic, Paperclip, Square, Trash2 } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { formatCode, formatDate, formatMoney, label } from '../lib/format.ts';
import { EmptyState } from './EmptyState.tsx';
import { useToast } from './Toast.tsx';

// O CRM como ponto de partida: rastreio dos documentos, anexos e a linha do tempo de todos os setores.

type Source = 'crm' | 'quote' | 'order' | 'finance' | 'attachment';
interface Entry {
  id: string;
  at: string;
  source: Source;
  title: string;
  detail: string | null;
  userName: string | null;
  path: string | null;
  kind?: string;
  channel?: string;
}
interface TrackedOrder {
  id: number;
  number: number;
  status: string;
  total: number;
  quoteId: number | null;
  deliveryDate: string | null;
  deliveredOn: string | null;
  received: number | null;
  open: number | null;
}
interface Timeline {
  tracking: {
    quotes: { id: number; number: number; status: string; total: number }[];
    orders: TrackedOrder[];
  };
  entries: Entry[];
}
interface Attachment {
  id: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  userName: string | null;
  url: string;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const timelineKey = (id: number) => ['/opportunities', id, 'timeline'];
const attachmentsKey = (id: number) => ['/opportunities', id, 'attachments'];

const useTimeline = (id: number) =>
  useQuery({ queryKey: timelineKey(id), queryFn: () => api<Timeline>(`/opportunities/${id}/timeline`) });

// ---------- Rastreio ----------

function deliveryText(order: TrackedOrder) {
  if (order.deliveredOn) return `Entregue em ${formatDate(order.deliveredOn)}`;
  if (order.deliveryDate) return `Entrega prevista para ${formatDate(order.deliveryDate)}`;
  return 'Sem previsão de entrega';
}

export function OpportunityTracking({ id }: { id: number }) {
  const timeline = useTimeline(id);
  const tracking = timeline.data?.tracking;
  if (!tracking || (!tracking.quotes.length && !tracking.orders.length)) return null;
  return (
    <div className="panel linked-docs">
      <h3>Rastreio dos documentos</h3>
      <div className="linked-columns">
        <section aria-label="Orçamentos">
          <h4>Orçamentos</h4>
          {tracking.quotes.length ? (
            <ul>
              {tracking.quotes.map((quote) => (
                <li key={quote.id}>
                  <Link to={`/orcamentos/${quote.id}`}>{formatCode(quote.number)}</Link>
                  <span className={`status ${quote.status}`}>{label(quote.status)}</span>
                  <strong>{formatMoney(quote.total)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhum.</p>
          )}
        </section>
        <section aria-label="Pedidos">
          <h4>Pedidos</h4>
          {tracking.orders.length ? (
            <ul>
              {tracking.orders.map((order) => {
                const origin = tracking.quotes.find((quote) => quote.id === order.quoteId);
                return (
                  <li key={order.id} className="tracked-order">
                    <Link to={`/pedidos/${order.id}`}>{formatCode(order.number)}</Link>
                    <span className={`status ${order.status}`}>{label(order.status)}</span>
                    <strong>{formatMoney(order.total)}</strong>
                    <small className="muted tracked-detail">
                      {origin && `Do orçamento ${formatCode(origin.number)} · `}
                      {deliveryText(order)}
                      {order.received !== null &&
                        ` · Recebido ${formatMoney(order.received)}${order.open ? `, falta ${formatMoney(order.open)}` : ''}`}
                    </small>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Nenhum.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- Linha do tempo ----------

const FILTERS: { value: Source | 'all'; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'crm', label: 'Atendimentos' },
  { value: 'quote', label: 'Orçamentos' },
  { value: 'order', label: 'Pedidos' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'attachment', label: 'Anexos' },
];
const SOURCE_LABEL: Record<Source, string> = {
  crm: 'CRM',
  quote: 'Orçamento',
  order: 'Pedido',
  finance: 'Financeiro',
  attachment: 'Anexo',
};

export function OpportunityTimeline({ id }: { id: number }) {
  const timeline = useTimeline(id);
  const [filter, setFilter] = useState<Source | 'all'>('all');
  if (timeline.isPending) return <div className="loading">Carregando...</div>;
  if (timeline.isError) return <EmptyState text={timeline.error.message} />;
  const entries = timeline.data.entries.filter((entry) => filter === 'all' || entry.source === filter);
  return (
    <>
      <fieldset className="timeline-filters">
        <legend className="sr-only">Mostrar na linha do tempo</legend>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? 'chip active' : 'chip'}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      {entries.length ? (
        <ol className="timeline">
          {entries.map((entry) => {
            const isEvent = entry.source === 'crm' && entry.kind === 'event';
            const title = entry.source === 'crm' ? label(entry.kind) : entry.title;
            return (
              <li key={entry.id} className={isEvent ? 'timeline-event' : `timeline-${entry.source}`}>
                <strong>
                  {entry.source !== 'crm' && (
                    <span className="timeline-source">{SOURCE_LABEL[entry.source]}</span>
                  )}
                  {entry.path ? <Link to={entry.path}>{title}</Link> : title}
                </strong>
                <small className="muted">
                  {dateTime.format(new Date(entry.at))}
                  {entry.userName && ` · ${entry.userName}`}
                  {entry.source === 'crm' && !isEvent && entry.channel && ` · ${label(entry.channel)}`}
                </small>
                {entry.detail && <p>{entry.detail}</p>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">Nada registrado aqui ainda.</p>
      )}
    </>
  );
}

// ---------- Anexos ----------

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.ceil(bytes / 1024)} KB`;

// Envio direto ao armazenamento, com progresso (vídeos podem ser grandes).
function sendFile(
  target: { url: string; method: string; headers: Record<string, string> },
  file: Blob,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) =>
      event.lengthComputable && onProgress((event.loaded / event.total) * 100);
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error('O envio do arquivo falhou.'));
    request.onerror = () => reject(new Error('O envio do arquivo falhou. Verifique a conexão.'));
    request.send(file);
  });
}

// Gravação de áudio pelo microfone, no próprio navegador.
function useRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const latest = useRef(onDone);
  latest.current = onDone;
  useEffect(
    () => () => {
      for (const track of recorder.current?.stream.getTracks() ?? []) track.stop();
    },
    [],
  );

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        setRecording(false);
        const type = (media.mimeType || 'audio/webm').split(';')[0] ?? 'audio/webm';
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const stamp = new Date().toLocaleString('pt-BR').replace(/[/:]/g, '-').replace(', ', ' ');
        latest.current(new File(chunks, `Áudio ${stamp}.${extension}`, { type }));
      };
      recorder.current = media;
      media.start();
      setRecording(true);
    } catch {
      setError('Não foi possível usar o microfone. Libere o acesso nas configurações do site.');
    }
  }

  return {
    supported: typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    recording,
    error,
    start,
    stop: () => recorder.current?.stop(),
  };
}

function AttachmentView({ item }: { item: Attachment }) {
  if (item.kind === 'image')
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className="attachment-thumb">
        <img src={item.url} alt={item.name} loading="lazy" />
      </a>
    );
  if (item.kind === 'video')
    return (
      // Arquivo do usuário: não há legenda; a faixa vazia mantém o player acessível ao leitor de tela.
      <video src={item.url} controls preload="metadata" aria-label={item.name}>
        <track kind="captions" />
      </video>
    );
  if (item.kind === 'audio')
    return (
      <audio src={item.url} controls preload="metadata" aria-label={item.name}>
        <track kind="captions" />
      </audio>
    );
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className="attachment-file">
      <FileText size={28} aria-hidden="true" />
    </a>
  );
}

export function OpportunityAttachments({ id, canEdit }: { id: number; canEdit: boolean }) {
  const client = useQueryClient();
  const notify = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: attachmentsKey(id),
    queryFn: () =>
      api<{ available: boolean; maxMb: number; items: Attachment[] }>(`/opportunities/${id}/attachments`),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: attachmentsKey(id) });
    void client.invalidateQueries({ queryKey: timelineKey(id) });
  };

  async function upload(file: File) {
    setError(null);
    const maxMb = list.data?.maxMb ?? 50;
    if (file.size > maxMb * 1024 * 1024) return setError(`${file.name} passa de ${maxMb} MB.`);
    setProgress({ name: file.name, percent: 0 });
    try {
      const created = await api<{
        id: number;
        upload: { url: string; method: string; headers: Record<string, string> };
      }>(`/opportunities/${id}/attachments`, {
        method: 'POST',
        body: { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size },
      });
      await sendFile(created.upload, file, (percent) => setProgress({ name: file.name, percent }));
      await api(`/attachments/${created.id}/complete`, { method: 'POST' });
      notify('Anexo adicionado.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setProgress(null);
    }
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    for (const file of files) await upload(file);
  }

  const recorder = useRecorder((file) => void upload(file));
  const remove = useMutation({
    mutationFn: (attachmentId: number) => api(`/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('Anexo excluído.');
      refresh();
    },
    onError: (err) => setError(err.message),
  });

  const items = list.data?.items ?? [];
  const available = list.data?.available ?? true;
  return (
    <div className="panel attachments-panel">
      <div className="panel-heading">
        <div>
          <h3>Anexos</h3>
          <p>Fotos, vídeos, áudios e arquivos da negociação. Até {list.data?.maxMb ?? 50} MB por arquivo.</p>
        </div>
        {canEdit && available && (
          <div className="attachments-actions">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivos para anexar"
              onChange={choose}
            />
            <button
              type="button"
              className="button secondary"
              disabled={Boolean(progress)}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={14} /> Anexar
            </button>
            {recorder.supported && (
              <button
                type="button"
                className={recorder.recording ? 'button primary' : 'button secondary'}
                disabled={Boolean(progress)}
                aria-pressed={recorder.recording}
                onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
              >
                {recorder.recording ? <Square size={14} /> : <Mic size={14} />}
                {recorder.recording ? ' Parar e salvar' : ' Gravar áudio'}
              </button>
            )}
          </div>
        )}
      </div>
      {!available && <p className="muted">Os anexos ainda não estão disponíveis neste ambiente.</p>}
      {progress && (
        <p className="muted" role="status">
          Enviando {progress.name}: {Math.round(progress.percent)}%
          <progress max={100} value={progress.percent} aria-label="Progresso do envio" />
        </p>
      )}
      {(error ?? recorder.error) && (
        <p className="form-error" role="alert">
          {error ?? recorder.error}
        </p>
      )}
      {list.isPending ? (
        <div className="loading">Carregando...</div>
      ) : items.length ? (
        <ul className="attachments-grid" aria-label="Anexos da oportunidade">
          {items.map((item) => (
            <li key={item.id}>
              <AttachmentView item={item} />
              <div className="attachment-info">
                <a href={item.url} target="_blank" rel="noreferrer" title={item.name}>
                  {item.name}
                </a>
                <small className="muted">
                  {formatSize(item.sizeBytes)} · {dateTime.format(new Date(item.createdAt))}
                  {item.userName && ` · ${item.userName}`}
                </small>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Excluir ${item.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        available && <p className="muted">Nenhum anexo ainda.</p>
      )}
    </div>
  );
}
