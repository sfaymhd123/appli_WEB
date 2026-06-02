import { Menu, LogOut, Wifi, WifiOff } from 'lucide-react';
import { RoleLabels } from '@hphii/fhir-domain';
import { useAuth } from '../../lib/auth/auth-context';
import { useOnlineStatus } from '../../lib/hooks/use-online-status';

export interface TopBarProps {
  onToggleNav: () => void;
}

export function TopBar({ onToggleNav }: TopBarProps) {
  const { user, signOut } = useAuth();
  const online = useOnlineStatus();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Afficher le menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        
        <div className="flex items-center gap-4">
          <div className="hidden h-10 w-auto lg:block">
            <img 
              src="/logo-ms.webp" 
              alt="MS"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="hidden h-8 w-px bg-gray-100 lg:block" />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-clinical-800">
              HPHII <span className="mx-1 opacity-40">/</span> DSP
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-gray-400 sm:block">
              Hassan II de Settat
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            online ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}
          title={online ? 'Connecté au réseau' : 'Hors ligne — cache local'}
        >
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          <span className="hidden sm:inline">{online ? 'En ligne' : 'Hors ligne'}</span>
        </div>

        {user && (
          <div className="hidden items-center gap-3 sm:flex">
            <div className="text-right">
              <p className="max-w-[12rem] truncate text-xs font-semibold text-gray-900">
                {user.email}
              </p>
              <p className="text-[10px] font-medium text-gray-400">{RoleLabels[user.role]}</p>
            </div>
            <div className="h-8 w-px bg-gray-100" aria-hidden />
          </div>
        )}

        <button
          onClick={() => void signOut()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          title="Déconnexion"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}
