import { CircleHelp, LogOut, Menu, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { type Profile, useLogout } from '../lib/auth.ts';
import { formatToday } from '../lib/format.ts';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

interface Props {
  title: string;
  profile: Profile;
  onMenu: () => void;
  onSearch: () => void;
  onHelp: () => void;
}

export function Topbar({ title, profile, onMenu, onSearch, onHelp }: Props) {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <button type="button" className="mobile-menu" onClick={onMenu} aria-label="Abrir menu de navegação">
        <Menu size={21} />
      </button>

      <div>
        <p className="eyebrow">{formatToday()}</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar-actions">
        <button type="button" className="button secondary topbar-search" onClick={onSearch}>
          <Search size={15} aria-hidden="true" /> Buscar <kbd>Ctrl+K</kbd>
        </button>
        <button
          type="button"
          className="button secondary topbar-help"
          onClick={onHelp}
          aria-label="Ajuda desta tela (F1)"
          title="Ajuda desta tela (F1)"
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
        <div className="profile">
          <div className="avatar" aria-hidden="true">
            {initials(profile.name)}
          </div>
          <div>
            <strong>{profile.name}</strong>
            <small>
              {profile.group.name} · {profile.company.name}
            </small>
          </div>
        </div>
        <button
          type="button"
          className="logout"
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
        >
          <LogOut size={14} aria-hidden="true" /> Sair
        </button>
      </div>
    </header>
  );
}
