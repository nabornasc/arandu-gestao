import { ChevronRight } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { NavLink } from 'react-router';
import { MODULES, modulePath, navigation } from '../config/navigation.ts';
import { can, type Profile } from '../lib/auth.ts';

interface Props {
  profile: Profile;
  open: boolean;
  onClose: () => void;
}

// Mesmo ponto de quebra do CSS em que o menu vira gaveta.
const mobile = window.matchMedia('(max-width: 650px)');
const subscribe = (onChange: () => void) => {
  mobile.addEventListener('change', onChange);
  return () => mobile.removeEventListener('change', onChange);
};

export function Sidebar({ profile, open, onClose }: Props) {
  const items = navigation.filter((item) => can(profile, item.permission));
  const isMobile = useSyncExternalStore(subscribe, () => mobile.matches);
  return (
    <>
      {open && <div className="mobile-backdrop" onClick={onClose} aria-hidden="true" />}
      {/* Gaveta fechada fica fora da tela: inert tira os links do Tab e dos leitores de tela. */}
      <aside className={`sidebar ${open ? 'open' : ''}`} inert={isMobile && !open}>
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <strong>arandu gestão</strong>
            <small>Gestão que gera futuro</small>
          </div>
        </div>

        <nav aria-label="Menu principal">
          {MODULES.map((module) => {
            const inModule = items.filter((item) => item.module === module.key);
            if (!inModule.length) return null;
            return (
              <div key={module.key} className="nav-module">
                {module.page ? (
                  <NavLink
                    to={modulePath(module.key)}
                    onClick={onClose}
                    className={({ isActive }) => (isActive ? 'nav-label active' : 'nav-label')}
                  >
                    {module.label}
                  </NavLink>
                ) : (
                  <span className="nav-label">{module.label}</span>
                )}
                {inModule.map(({ path, label, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={path === '/'}
                    onClick={onClose}
                    className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={18} aria-hidden="true" />
                        <span>{label}</span>
                        {isActive && <ChevronRight size={16} className="nav-chevron" aria-hidden="true" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/ajuda" className="help-icon" aria-label="Central de ajuda" title="Central de ajuda">
            ?
          </NavLink>
          <div>
            <strong>{profile.company.name}</strong>
            <small>Organize seu negócio com calma.</small>
          </div>
        </div>
      </aside>
    </>
  );
}
