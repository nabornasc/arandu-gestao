import { ASSISTANT_ATTACHMENT_MAX_BYTES, type AssistantAttachment } from '@arandue/shared/schemas';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mic, MicOff, Paperclip, Send, X } from 'lucide-react';
import {
  type ChangeEvent,
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
import { useSpeech } from '../lib/speech.ts';

interface Action {
  id: string;
  summary: string;
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string;
  actions?: Action[];
}
interface Usage {
  spentBrl: number;
  quotaBrl: number;
  warning: boolean;
}

// O servidor não guarda a conversa: as últimas mensagens vão junto de cada pergunta.
const HISTORY = 10;
// Lado maior da imagem enviada: mais que isso só aumenta o custo, sem ganho de leitura.
const IMAGE_MAX_SIDE = 1568;
const READ_DOCUMENT =
  'Leia este documento e diga o que encontrou. Se tiver dados de cadastro, ofereça cadastrar.';

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(blob);
  });

// Imagem: reduzida e convertida para JPEG no navegador, para a requisição ficar pequena. PDF: até 3 MB.
async function prepareAttachment(file: File): Promise<AssistantAttachment> {
  if (file.type === 'application/pdf') {
    if (file.size > ASSISTANT_ATTACHMENT_MAX_BYTES) throw new Error('O PDF passa de 3 MB.');
    return { mediaType: 'application/pdf', name: file.name, data: await toBase64(file) };
  }
  if (!file.type.startsWith('image/')) throw new Error('Envie uma imagem ou um PDF.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Não foi possível ler a imagem.');
  if (blob.size > ASSISTANT_ATTACHMENT_MAX_BYTES) throw new Error('A imagem passa de 3 MB.');
  return { mediaType: 'image/jpeg', name: file.name, data: await toBase64(blob) };
}

// Texto da resposta sem HTML: **negrito** vira <strong>; /ajuda/... e as telas citadas viram link.
function Reply({ text, onOpen }: { text: string; onOpen: (path: string) => void }) {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|(?<![\w/])\/(?:ajuda|clientes|contas-a-receber|despesas|produtos|crm|orcamentos|pessoas)(?:\/[a-z0-9-]+)*)/g;
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

// Resumo de uma ação proposta pelo assistente. Só o clique em Confirmar grava, sem passar pela IA.
function ActionCard({ action, onOpen }: { action: Action; onOpen: (path: string) => void }) {
  const [result, setResult] = useState<{ message: string; path?: string } | null>(null);
  const resolve = useMutation({
    mutationFn: (choice: 'confirm' | 'cancel') =>
      api<{ message: string; path?: string }>(`/assistant/actions/${action.id}/${choice}`, {
        method: 'POST',
      }),
    onSuccess: setResult,
  });
  return (
    <fieldset className="assistant-action">
      <legend className="sr-only">Ação para confirmar</legend>
      <p className="assistant-action-summary">{action.summary}</p>
      {result ? (
        <p className="assistant-action-result" role="status">
          {result.message}{' '}
          {result.path && (
            <a
              href={result.path}
              onClick={(event) => {
                event.preventDefault();
                onOpen(result.path ?? '/');
              }}
            >
              Abrir
            </a>
          )}
        </p>
      ) : (
        <div className="assistant-action-buttons">
          <button
            type="button"
            className="button primary"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate('confirm')}
          >
            Confirmar
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate('cancel')}
          >
            Cancelar
          </button>
        </div>
      )}
      {resolve.isError && (
        <p className="form-error" role="alert">
          {resolve.error.message}
        </p>
      )}
    </fieldset>
  );
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<AssistantAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  // O texto ditado entra no campo da pergunta, para a pessoa conferir antes de enviar.
  const typedBefore = useRef('');
  const speech = useSpeech((spoken) => setText(`${typedBefore.current}${spoken}`));
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
    mutationFn: (body: {
      message: string;
      attachment?: AssistantAttachment;
      history: { role: Message['role']; content: string }[];
    }) =>
      api<{ reply: string; usage: Usage; actions: Action[] }>('/assistant/messages', {
        method: 'POST',
        body,
      }),
    onSuccess: (result) => {
      setMessages((list) => [...list, { role: 'assistant', content: result.reply, actions: result.actions }]);
      setCurrent(result.usage);
    },
    onError: (err) => setError(err.message),
  });

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setAttachment(await prepareAttachment(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
    }
  }

  function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim() || (attachment ? READ_DOCUMENT : '');
    if (!message || ask.isPending) return;
    setError(null);
    // O histórico vai só com o texto; o arquivo segue apenas com a pergunta atual.
    const history = messages.slice(-HISTORY).map((item) => ({
      role: item.role,
      content: item.attachmentName ? `${item.content}\n[anexo: ${item.attachmentName}]` : item.content,
    }));
    const attachmentName = attachment ? (attachment.name ?? 'arquivo') : undefined;
    setMessages((list) => [...list, { role: 'user', content: message, attachmentName }]);
    setText('');
    setAttachment(null);
    ask.mutate({ message, history, ...(attachment && { attachment }) });
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
        sistema. Nada é gravado sem o seu clique em Confirmar.
      </p>

      <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 && (
          <p className="muted">
            Ex.: “Quanto faturei este mês?”, “Cadastre a cliente Ana Souza, celular 65 99999-0000” ou anexe a
            foto de um documento para cadastrar.
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
            {message.attachmentName && (
              <p className="assistant-attachment">Anexo: {message.attachmentName}</p>
            )}
            {message.actions?.map((action) => (
              <ActionCard key={action.id} action={action} onOpen={open} />
            ))}
          </div>
        ))}
        {ask.isPending && <p className="muted">Pensando...</p>}
        <div ref={endRef} />
      </div>

      {(error ?? speech.error) && (
        <p className="form-error" role="alert">
          {error ?? speech.error}
        </p>
      )}

      {attachment && (
        <p className="assistant-attachment pending">
          Anexo: {attachment.name ?? 'arquivo'}
          <button type="button" className="link-button" onClick={() => setAttachment(null)}>
            Remover
          </button>
        </p>
      )}
      <form className="assistant-form" onSubmit={send}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label="Arquivo para o assistente"
          onChange={chooseFile}
        />
        <button
          type="button"
          className="button secondary"
          onClick={() => fileRef.current?.click()}
          disabled={ask.isPending}
          aria-label="Anexar imagem ou PDF"
          title="Anexar imagem ou PDF (ex.: documento do cliente)"
        >
          <Paperclip size={16} />
        </button>
        {speech.supported && (
          <button
            type="button"
            className={speech.listening ? 'button primary' : 'button secondary'}
            onClick={() => {
              if (speech.listening) return speech.stop();
              typedBefore.current = text.trim() ? `${text.trim()} ` : '';
              speech.start();
            }}
            disabled={ask.isPending}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? 'Parar de ouvir' : 'Falar a pergunta'}
            title={
              speech.listening
                ? 'Parar de ouvir'
                : 'Falar a pergunta (o texto aparece no campo para você conferir)'
            }
          >
            {speech.listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
        <label htmlFor={`${titleId}-input`} className="sr-only">
          Sua pergunta
        </label>
        <textarea
          id={`${titleId}-input`}
          ref={inputRef}
          rows={2}
          maxLength={2000}
          placeholder={speech.listening ? 'Ouvindo... fale a pergunta' : 'Escreva sua pergunta'}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="button primary"
          disabled={ask.isPending || (!text.trim() && !attachment)}
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
