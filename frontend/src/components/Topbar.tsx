import { CircleHelp, LogOut, Menu, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { can, type Profile, useLogout } from '../lib/auth.ts';
import { formatToday } from '../lib/format.ts';
import { ProfileModal } from './ProfileModal.tsx';

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
  onAssistant: () => void;
}

export function Topbar({ title, profile, onMenu, onSearch, onHelp, onAssistant }: Props) {
  const logout = useLogout();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

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
        {/* No celular, os rótulos somem e ficam só os ícones; o aria-label mantém o nome do botão. */}
        <button
          type="button"
          className="button secondary topbar-search"
          onClick={onSearch}
          aria-label="Buscar (Ctrl+K)"
        >
          <Search size={15} aria-hidden="true" /> <span className="topbar-label">Buscar</span>{' '}
          <kbd>Ctrl+K</kbd>
        </button>
        {can(profile, 'assistant.use') && (
          <button
            type="button"
            className="button secondary topbar-help"
            onClick={onAssistant}
            aria-label="Assistente de IA"
            title="Assistente de IA"
          >
            <Sparkles size={16} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="button secondary topbar-help"
          onClick={onHelp}
          aria-label="Ajuda desta tela (F1)"
          title="Ajuda desta tela (F1)"
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="profile"
          onClick={() => setProfileOpen(true)}
          aria-label={`Meu perfil: ${profile.name}`}
          title="Meu perfil"
        >
          <div className="avatar" aria-hidden="true">
            {initials(profile.name)}
          </div>
          <div>
            <strong>{profile.name}</strong>
            <small>
              {profile.group.name} · {profile.company.name}
            </small>
          </div>
        </button>
        <button
          type="button"
          className="logout"
          aria-label="Sair"
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
        >
          <LogOut size={14} aria-hidden="true" /> <span className="topbar-label">Sair</span>
        </button>
      </div>
      {profileOpen && <ProfileModal profile={profile} onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
