import { Pause, Play } from 'lucide-react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDate } from '../lib/format.ts';
import type { ManualArticle } from '../lib/manual.ts';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Vídeo curto, sem som e em loop. Com "reduzir movimento" no sistema, começa parado.
function ManualMedia({ name, alt, available }: { name: string; alt: string; available: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing]);

  if (!available) {
    return (
      <figure className="manual-media manual-media-missing">
        <figcaption>Vídeo em preparação: {alt}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="manual-media">
      <video ref={ref} muted loop playsInline preload="metadata" aria-label={alt}>
        <source src={`/manual/${name}.webm`} type="video/webm" />
        <source src={`/manual/${name}.mp4`} type="video/mp4" />
      </video>
      <button
        type="button"
        className="manual-media-toggle"
        aria-label={playing ? `Pausar vídeo: ${alt}` : `Tocar vídeo: ${alt}`}
        onClick={() => setPlaying((value) => !value)}
      >
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
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
