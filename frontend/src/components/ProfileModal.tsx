import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { can, type Profile } from '../lib/auth.ts';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

interface TelegramLink {
  available: boolean;
  linked: boolean;
  botUsername: string | null;
}

interface TelegramCode {
  code: string;
  expiresAt: string;
  botUsername: string | null;
}

// Janela "Meu perfil", aberta pelo nome no alto da tela.
export function ProfileModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  return (
    <Modal eyebrow="MEU PERFIL" title={profile.name} onClose={onClose}>
      <dl className="profile-details">
        <dt>E-mail</dt>
        <dd>{profile.email}</dd>
        <dt>Grupo de acesso</dt>
        <dd>{profile.group.name}</dd>
        <dt>Empresa</dt>
        <dd>{profile.company.name}</dd>
      </dl>
      {can(profile, 'assistant.use') && <TelegramSection />}
    </Modal>
  );
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function TelegramSection() {
  const client = useQueryClient();
  const notify = useToast();
  const [code, setCode] = useState<TelegramCode | null>(null);
  const link = useQuery({
    queryKey: ['/telegram/link'],
    queryFn: () => api<TelegramLink>('/telegram/link'),
    // Com o código na tela, confere a cada 3 segundos se o vínculo já foi feito no Telegram.
    refetchInterval: (query) => (code && !query.state.data?.linked ? 3000 : false),
  });
  const generate = useMutation({
    mutationFn: () => api<TelegramCode>('/telegram/link', { method: 'POST' }),
    onSuccess: setCode,
    onError: (error) => notify(error.message, 'error'),
  });
  const unlink = useMutation({
    mutationFn: () => api('/telegram/link', { method: 'DELETE' }),
    onSuccess: () => {
      setCode(null);
      void client.invalidateQueries({ queryKey: ['/telegram/link'] });
      notify('Telegram desvinculado.');
    },
    onError: (error) => notify(error.message, 'error'),
  });

  const username = code?.botUsername ?? link.data?.botUsername ?? null;

  return (
    <section className="profile-telegram" aria-labelledby="titulo-telegram">
      <h3 id="titulo-telegram">
        <Send size={16} aria-hidden="true" /> Telegram
      </h3>
      {link.isPending ? (
        <div className="loading">Carregando...</div>
      ) : link.isError ? (
        <p className="form-error">{link.error.message}</p>
      ) : !link.data.available ? (
        <p className="muted">O bot do Telegram ainda não foi configurado neste sistema.</p>
      ) : link.data.linked ? (
        <>
          <p>
            <span className="status completed">Vinculado</span> Converse com o assistente pelo Telegram
            {username ? ` em @${username}` : ''}.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={unlink.isPending}
            onClick={() => unlink.mutate()}
          >
            Desvincular
          </button>
        </>
      ) : code ? (
        <>
          <p>
            Código válido até {time(code.expiresAt)}: <strong className="telegram-code">{code.code}</strong>
          </p>
          {username && (
            <p>
              <a
                className="button primary"
                href={`https://t.me/${username}?start=${code.code}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir o Telegram e vincular
              </a>
            </p>
          )}
          <p className="muted">
            Ou mande ao bot{username ? ` @${username}` : ''}: <code>/vincular {code.code}</code>. Esta janela
            atualiza sozinha quando o vínculo for feito.
          </p>
        </>
      ) : (
        <>
          <p className="muted">
            Use o assistente pelo Telegram, com as mesmas permissões que você tem aqui. As mensagens são
            processadas por inteligência artificial.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            Gerar código
          </button>
        </>
      )}
    </section>
  );
}
