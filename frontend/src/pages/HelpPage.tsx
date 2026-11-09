import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState.tsx';
import { ManualArticleView } from '../components/ManualArticleView.tsx';
import { MODULES } from '../config/navigation.ts';
import { articlePath, articles, findArticle, moduleLabel } from '../lib/manual.ts';
import { useTab, useTabTitle } from '../workspace/tab.ts';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Central de ajuda: índice por módulo e um artigo por tarefa.
export default function HelpPage() {
  const { params } = useTab();
  const slug = params.modulo && params.artigo ? `${params.modulo}/${params.artigo}` : null;
  return slug ? <ArticlePage slug={slug} /> : <HelpIndex />;
}

function HelpIndex() {
  const [query, setQuery] = useState('');
  useTabTitle('Central de ajuda');
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const found = articles.filter((article) => {
    const text = normalize(`${article.titulo} ${article.summary}`);
    return terms.every((term) => text.includes(term));
  });
  const modules = [
    ...MODULES.map((module) => module.key as string),
    ...new Set(articles.map((article) => article.modulo)),
  ].filter((key, index, all) => all.indexOf(key) === index);

  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">AJUDA</span>
          <h2>Central de ajuda</h2>
          <p>Passo a passo das tarefas do dia a dia. Em cada tela, o botão "?" abre a ajuda dela.</p>
        </div>
      </div>
      <div className="panel">
        <label className="manual-search">
          Buscar na ajuda
          <input
            type="search"
            name="q"
            placeholder="Ex.: enviar orçamento"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {found.length ? (
          modules.map((key) => {
            const list = found.filter((article) => article.modulo === key);
            if (!list.length) return null;
            return (
              <div key={key} className="manual-group">
                <h3>{moduleLabel(key)}</h3>
                <ul className="manual-list">
                  {list.map((article) => (
                    <li key={article.slug}>
                      <Link to={articlePath(article)}>{article.titulo}</Link>
                      <small className="muted">{article.summary}</small>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        ) : (
          <EmptyState text="Nenhum artigo encontrado. Tente outras palavras." />
        )}
      </div>
    </section>
  );
}

function ArticlePage({ slug }: { slug: string }) {
  const article = findArticle(slug);
  useTabTitle(article ? `Ajuda: ${article.titulo}` : 'Ajuda');
  if (!article) return <EmptyState text="Artigo não encontrado." />;
  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">AJUDA · {moduleLabel(article.modulo).toUpperCase()}</span>
          <h2>{article.titulo}</h2>
        </div>
        <div className="document-actions">
          <Link className="button secondary" to="/ajuda">
            Central de ajuda
          </Link>
        </div>
      </div>
      <div className="panel">
        <ManualArticleView article={article} />
      </div>
    </section>
  );
}
