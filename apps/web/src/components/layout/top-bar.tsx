import { RoleLabels } from '@hphii/fhir-domain';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useAuth } from '../../lib/auth/auth-context';
import { useOnlineStatus } from '../../lib/hooks/use-online-status';
import { cn } from '../../lib/utils/cn';

export interface TopBarProps {
  onToggleNav: () => void;
}

export function TopBar({ onToggleNav }: TopBarProps) {
  const { user, signOut } = useAuth();
  const online = useOnlineStatus();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Afficher le menu"
          className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 md:hidden"
        >
          ☰
        </button>
        <div className="leading-tight">
          <span className="block text-base font-bold text-clinical-800">HPHII · DSP</span>
          <span className="hidden text-xs text-gray-500 sm:block">
            Dossier de Santé Partagé
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-1.5 text-xs font-medium text-gray-600"
          title={online ? 'Connecté au réseau' : 'Hors ligne — cache local'}
        >
          <span
            aria-hidden
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              online ? 'bg-green-500' : 'bg-amber-500',
            )}
          />
          <span className="hidden sm:inline">{online ? 'En ligne' : 'Hors ligne'}</span>
        </span>

        {user && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="max-w-[12rem] truncate text-sm text-gray-700">{user.email}</span>
            <Badge tone="clinical">{RoleLabels[user.role]}</Badge>
          </div>
        )}

        <Button variant="secondary" size="sm" onClick={() => void signOut()}>
          Déconnexion
        </Button>
      </div>
    </header>
  );
}
