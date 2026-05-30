import { NavLink } from 'react-router-dom';
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
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-3 py-4 transition-transform md:static md:z-auto md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-tap flex-col justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-clinical-50 text-clinical-800'
                      : 'text-gray-700 hover:bg-gray-100',
                  )
                }
              >
                <span>{item.label}</span>
                <span className="text-[0.7rem] font-normal text-gray-400">{item.module}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
