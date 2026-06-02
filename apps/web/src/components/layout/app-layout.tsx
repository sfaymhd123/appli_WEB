import { useState, type ReactNode } from 'react';
import { OfflineBanner } from '../ui/offline-banner';
import { TopBar } from './top-bar';
import { SideNav } from './side-nav';
import { useAuth } from '../../lib/auth/auth-context';

/** App shell: offline banner + top bar + role-aware side nav + content area. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-50/50">
      {/* Ambient background decoration */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-clinical-500/5 blur-[120px]" />
        <div className="absolute -right-[10%] bottom-[10%] h-[30%] w-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#0f766e 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
      </div>

      <OfflineBanner />
      <TopBar onToggleNav={() => setNavOpen((v) => !v)} />
      <div className="relative z-10 flex flex-1">
        {user && (
          <SideNav role={user.role} open={navOpen} onNavigate={() => setNavOpen(false)} />
        )}
        <main className="flex-1 overflow-x-hidden pb-12 pt-8 px-4 md:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
