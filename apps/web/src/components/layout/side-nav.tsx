import { NavLink } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import type { Role } from '@hphii/fhir-domain';
import { visibleNavItems } from '../../lib/nav/nav-config';
import { cn } from '../../lib/utils/cn';

export interface SideNavProps {
  role: Role;
  /** Mobile drawer open state (ignored on md+ where the nav is persistent). */
  open: boolean;
  onNavigate: () => void;
}

export function SideNav({ role, open, onNavigate }: SideNavProps) {
  const items = visibleNavItems(role);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-gray-900/40 md:hidden"
          onClick={onNavigate}
          aria-hidden
        />
      )}

      <nav
        aria-label="Navigation principale"
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-clinical-800/50 bg-clinical-900 px-4 py-8 transition-transform md:sticky md:top-16 md:z-auto md:h-[calc(100vh-4rem)] md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-8 px-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-clinical-400">
            Navigation Système
          </p>
        </div>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300',
                    isActive
                      ? 'bg-clinical-700 text-white shadow-lg shadow-black/20 ring-1 ring-white/10'
                      : 'text-clinical-200 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <NavIcon iconName={item.icon} className={cn(
                  "h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110",
                  "opacity-70 group-hover:opacity-100"
                )} />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        
        <div className="mt-12 px-3">
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-[10px] font-bold text-clinical-400 uppercase tracking-wider">Hôpital Provincial</p>
            <p className="mt-1 text-xs font-medium text-white">Hassan II Settat</p>
          </div>
        </div>
      </nav>
    </>
  );
}

function NavIcon({ iconName, className }: { iconName: string; className?: string }) {
  const Icon = (LucideIcons as any)[iconName] as LucideIcons.LucideIcon;
  if (!Icon) return <LucideIcons.Circle className={className} />;
  return <Icon className={className} />;
}
