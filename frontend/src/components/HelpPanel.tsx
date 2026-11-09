import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import { articleForPath, articlePath } from '../lib/manual.ts';
import { ManualArticleView } from './ManualArticleView.tsx';

// Ajuda da tela: painel lateral que não fecha o que está aberto. Esc ou "x" fecham.
export function HelpPanel({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const article = articleForPath(pathname);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeLatest = useRef(onClose);
  closeLatest.current = onClose;

  // Foco no "x" ao abrir e de volta para onde estava (ex.: o botão "?") ao fechar.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeLatest.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <aside className="help-panel" aria-labelledby={titleId}>
      <div className="help-panel-header">
        <div>
          <span className="welcome-label">AJUDA DA TELA</span>
          <h3 id={titleId}>{article?.titulo ?? 'Esta tela ainda não tem artigo'}</h3>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar ajuda">
          <X size={18} />
        </button>
      </div>
      {article ? (
        <ManualArticleView article={article} onNavigate={onClose} />
      ) : (
        <p className="muted">Veja os outros artigos na central de ajuda.</p>
      )}
      <p className="help-panel-footer">
        {article && (
          <Link to={articlePath(article)} onClick={onClose}>
            Abrir em uma aba
          </Link>
        )}
        <Link to="/ajuda" onClick={onClose}>
          Central de ajuda
        </Link>
      </p>
    </aside>
  );
}
