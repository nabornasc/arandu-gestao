import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, X } from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api.ts';
import { formatMoney } from '../lib/format.ts';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}
interface Usage {
  spentBrl: number;
  quotaBrl: number;
  warning: boolean;
}

// O servidor não guarda a conversa: as últimas mensagens vão junto de cada pergunta.
const HISTORY = 10;

// Texto da resposta sem HTML: **negrito** vira <strong>; /ajuda/... e as telas citadas pelas consultas viram link.
function Reply({ text, onOpen }: { text: string; onOpen: (path: string) => void }) {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|(?<![\w/])\/(?:ajuda|clientes|contas-a-receber|despesas|produtos)(?:\/[a-z0-9-]+)*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith('**')) nodes.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else
      nodes.push(
        <a
          key={index}
          href={token}
          onClick={(event) => {
            event.preventDefault();
            onOpen(token);
          }}
        >
          {token}
        </a>,
      );
    last = index + token.length;
  }
  nodes.push(text.slice(last));
  return <p className="assistant-text">{nodes}</p>;
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const usage = useQuery({
    queryKey: ['/assistant/usage'],
    queryFn: () => api<Usage & { available: boolean }>('/assistant/usage'),
  });
  const [current, setCurrent] = useState<Usage | null>(null);
  const shown = current ?? usage.data ?? null;

  const closeLatest = useRef(onClose);
  closeLatest.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) =>
      event.key === 'Escape' && !document.querySelector('dialog[open]') && closeLatest.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  const ask = useMutation({
    mutationFn: (body: { message: string; history: Message[] }) =>
      api<{ reply: string; usage: Usage }>('/assistant/messages', { method: 'POST', body }),
    onSuccess: (result) => {
      setMessages((list) => [...list, { role: 'assistant', content: result.reply }]);
      setCurrent(result.usage);
    },
    onError: (err) => setError(err.message),
  });

  function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message || ask.isPending) return;
    setError(null);
    const history = messages.slice(-HISTORY);
    setMessages((list) => [...list, { role: 'user', content: message }]);
    setText('');
    ask.mutate({ message, history });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  const open = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <aside className="help-panel assistant-panel" aria-labelledby={titleId}>
      <div className="help-panel-header">
        <div>
          <span className="welcome-label">ASSISTENTE · IA</span>
          <h3 id={titleId}>Pergunte ao assistente</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar assistente">
          <X size={18} />
        </button>
      </div>
      <p className="muted assistant-note">
        Respostas geradas por inteligência artificial a partir do manual e dos dados que você já vê no
        sistema. Confira antes de agir.
      </p>

      <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 && (
          <p className="muted">
            Ex.: “Quanto faturei este mês?”, “Quais contas a receber estão vencidas?” ou “Como dou baixa numa
            conta?”
          </p>
        )}
        {messages.map((message, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a conversa só cresce no fim.
          <div key={index} className={`assistant-message ${message.role}`}>
            <span className="sr-only">{message.role === 'user' ? 'Você:' : 'Assistente:'}</span>
            {message.role === 'assistant' ? (
              <Reply text={message.content} onOpen={open} />
            ) : (
              <p className="assistant-text">{message.content}</p>
            )}
          </div>
        ))}
        {ask.isPending && <p className="muted">Pensando...</p>}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form className="assistant-form" onSubmit={send}>
        <label htmlFor={`${titleId}-input`} className="sr-only">
          Sua pergunta
        </label>
        <textarea
          id={`${titleId}-input`}
          ref={inputRef}
          rows={2}
          maxLength={2000}
          placeholder="Escreva sua pergunta"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="button primary"
          disabled={ask.isPending || !text.trim()}
          aria-label="Enviar"
        >
          <Send size={16} />
        </button>
      </form>
      {shown && (
        <p className={shown.warning ? 'assistant-usage warning' : 'assistant-usage muted'}>
          Uso do mês: {formatMoney(shown.spentBrl)} de {formatMoney(shown.quotaBrl)}
          {shown.warning && ' · perto do limite'}
        </p>
      )}
    </aside>
  );
}
