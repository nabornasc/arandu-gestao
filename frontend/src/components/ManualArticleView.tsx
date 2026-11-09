import { Maximize, Maximize2, Pause, Play, X } from 'lucide-react';
import { type MouseEvent, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDate } from '../lib/format.ts';
import type { ManualArticle } from '../lib/manual.ts';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Sources({ name }: { name: string }) {
  return (
    <>
      <source src={`/manual/${name}.webm`} type="video/webm" />
      <source src={`/manual/${name}.mp4`} type="video/mp4" />
    </>
  );
}

// Vídeo ampliado: ocupa quase toda a tela, com os controles do navegador para voltar ou pausar
// e um botão de tela cheia. Esc, "x" ou clique fora fecham.
function ManualMediaZoom({ name, alt, onClose }: { name: string; alt: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    if (!prefersReducedMotion()) void videoRef.current?.play().catch(() => undefined);
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const fullscreen = () => void videoRef.current?.requestFullscreen?.().catch(() => undefined);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o equivalente de teclado é o Esc nativo do <dialog> (onCancel).
    <dialog
      ref={ref}
      className="manual-zoom"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="manual-zoom-header">
        <h3 id={titleId}>{alt}</h3>
        <button type="button" onClick={fullscreen}>
          <Maximize size={15} aria-hidden="true" /> Tela cheia
        </button>
        <button type="button" onClick={onClose} aria-label="Fechar vídeo ampliado">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <video ref={videoRef} muted loop playsInline controls aria-label={alt}>
        <Sources name={name} />
      </video>
    </dialog>
  );
}

// Vídeo curto, sem som e em loop. Com "reduzir movimento" no sistema, começa parado.
// Clicar no vídeo (ou em "Ampliar") abre a versão grande.
function ManualMedia({ name, alt, available }: { name: string; alt: string; available: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing && !zoomed) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing, zoomed]);

  if (!available) {
    return (
      <figure className="manual-media manual-media-missing">
        <figcaption>Vídeo em preparação: {alt}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="manual-media">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: o botão "Ampliar" faz o mesmo pelo teclado. */}
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        title="Clique para ampliar"
        onClick={() => setZoomed(true)}
      >
        <Sources name={name} />
      </video>
      <div className="manual-media-actions">
        <button
          type="button"
          aria-label={`Ampliar vídeo: ${alt}`}
          title="Ampliar"
          onClick={() => setZoomed(true)}
        >
          <Maximize2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={playing ? `Pausar vídeo: ${alt}` : `Tocar vídeo: ${alt}`}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        </button>
      </div>
      {zoomed && <ManualMediaZoom name={name} alt={alt} onClose={() => setZoomed(false)} />}
    </figure>
  );
}

// Corpo do artigo. Os links internos abrem na área de trabalho, sem recarregar a página.
export function ManualArticleView({
  article,
  onNavigate,
}: {
  article: ManualArticle;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('/') || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    onNavigate?.();
    navigate(href);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: só repassa o clique dos links, que já são focáveis.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Enter num link dispara o mesmo clique.
    <div className="manual-article" onClick={follow}>
      {article.blocks.map((block) =>
        block.type === 'media' ? (
          <ManualMedia key={block.id} {...block} />
        ) : (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML gerado no build a partir dos artigos do repositório, com todo o texto escapado.
          <div key={block.id} dangerouslySetInnerHTML={{ __html: block.html }} />
        ),
      )}
      {article.atualizado && (
        <p className="muted manual-updated">Atualizado em {formatDate(article.atualizado)}.</p>
      )}
    </div>
  );
}
