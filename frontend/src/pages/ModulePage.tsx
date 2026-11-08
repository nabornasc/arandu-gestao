import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState.tsx';
import { MODULES, type ModuleKey, type NavItem, navigation, SALES_FLOW } from '../config/navigation.ts';
import { can, useProfile } from '../lib/auth.ts';
import { useTab } from '../workspace/tab.ts';

// Página de entrada de um módulo: um bloco por tela, com o atalho de criação quando o grupo pode criar.
export default function ModulePage() {
  const profile = useProfile();
  const { path } = useTab();
  const key = path.split('/').pop() as ModuleKey;
  const module = MODULES.find((item) => item.key === key);
  const items = navigation.filter((item) => item.module === key && can(profile, item.permission));
  const flow =
    key === 'vendas' ? SALES_FLOW.map((step) => navigation.find((item) => item.path === step)) : [];
  const visibleFlow = flow.filter((item): item is NavItem => !!item && can(profile, item.permission));

  return (
    <section className="module-page">
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">MÓDULO</span>
          <h2>{module?.label ?? 'Módulo'}</h2>
          <p>Escolha por onde começar.</p>
        </div>
      </div>

      {visibleFlow.length > 1 && (
        <ol className="panel module-flow" aria-label="Fluxo da venda">
          {visibleFlow.map((item, index) => (
            <li key={item.path}>
              <Link to={item.path}>
                <item.icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
              {index < visibleFlow.length - 1 && (
                <ArrowRight size={18} aria-hidden="true" className="module-flow-arrow" />
              )}
            </li>
          ))}
        </ol>
      )}

      {items.length ? (
        <div className="module-grid">
          {items.map((item) => (
            <article key={item.path} className="panel module-card">
              <div className="module-card-head">
                <span className="module-card-icon" aria-hidden="true">
                  <item.icon size={20} />
                </span>
                <h3>
                  <Link to={item.path}>{item.label}</Link>
                </h3>
              </div>
              <p>{item.description}</p>
              {item.create && can(profile, item.create.permission) && (
                <Link className="button secondary" to={item.create.path}>
                  <Plus size={16} aria-hidden="true" /> {item.create.label}
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState text="Seu grupo de acesso não inclui telas deste módulo." />
        </div>
      )}
    </section>
  );
}
