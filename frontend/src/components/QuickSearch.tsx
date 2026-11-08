import { useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { navigation } from '../config/navigation.ts';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { useDebounced } from '../lib/listFilters.ts';
import { SHORTCUTS } from '../lib/shortcuts.ts';
import { Modal } from './Modal.tsx';

interface SearchResult {
  type: string;
  id: number | string;
  title: string;
  detail: string | null;
  path: string;
}

const TYPE_LABELS: Record<string, string> = {
  screen: 'Tela',
  create: 'Criar',
  customer: 'Cliente',
  supplier: 'Fornecedor',
  product: 'Produto',
  quote: 'Orçamento',
  order: 'Pedido',
  opportunity: 'Oportunidade',
};

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Busca rápida (Ctrl+K ou F2): telas e atalhos de criação na hora, cadastros e documentos pelo servidor.
export function QuickSearch({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const listId = useId();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const term = useDebounced(text.trim(), 250);

  const needle = normalize(text.trim());
  const local: SearchResult[] = needle
    ? navigation
        .filter((item) => can(profile, item.permission))
        .flatMap((item) => [
          ...(normalize(item.label).includes(needle)
            ? [
                {
                  type: 'screen',
                  id: item.path,
                  title: item.label,
                  detail: item.description,
                  path: item.path,
                },
              ]
            : []),
          ...(item.create &&
          can(profile, item.create.permission) &&
          normalize(item.create.label).includes(needle)
            ? [
                {
                  type: 'create',
                  id: item.create.path,
                  title: item.create.label,
                  detail: null,
                  path: item.create.path,
                },
              ]
            : []),
        ])
    : [];
  const remote = useQuery({
    queryKey: ['/search', term],
    queryFn: () => api<SearchResult[]>(`/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  });
  const results = [...local, ...(term.length >= 2 ? (remote.data ?? []) : [])];

  const open = (result: SearchResult | undefined) => {
    if (!result) return;
    onClose();
    navigate(result.path);
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (results.length ? (current + step + results.length) % results.length : 0));
    }
    // No campo de busca, o Esc nativo só limpa o texto: aqui ele fecha a janela.
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      open(results[active]);
    }
  }

  return (
    <Modal eyebrow="BUSCA RÁPIDA" title="Buscar" onClose={onClose}>
      <div className="form-grid quick-search">
        <label className="full-row">
          Telas, clientes, produtos, orçamentos, pedidos e oportunidades
          <input
            data-autofocus
            type="search"
            aria-controls={listId}
            value={text}
            placeholder="Ex.: Bar do Zé, #12, novo orçamento"
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>
      <ul id={listId} aria-label="Resultados" aria-live="polite" className="quick-search-results">
        {results.map((result, index) => (
          <li key={`${result.type}-${result.id}`}>
            <button
              type="button"
              className={index === active ? 'active' : undefined}
              aria-current={index === active ? 'true' : undefined}
              // Só o movimento real do ponteiro muda a seleção: a lista que muda sob o mouse parado, não.
              onMouseMove={(event) => (event.movementX || event.movementY) && setActive(index)}
              onClick={() => open(result)}
            >
              <span className="quick-search-type">{TYPE_LABELS[result.type] ?? result.type}</span>
              <strong>{result.title}</strong>
              {result.detail && <small>{result.detail}</small>}
            </button>
          </li>
        ))}
      </ul>
      {text.trim().length >= 2 && !results.length && !remote.isFetching && (
        <p className="muted">Nada encontrado.</p>
      )}
      <details className="quick-search-help">
        <summary>Atalhos de teclado</summary>
        <dl>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys}>
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Modal>
  );
}
