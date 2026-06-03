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
      {/* Ambient background decoration with custom image */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img 
          src="/login-bg.jpg" 
          alt="" 
          className="h-full w-full object-cover opacity-[0.20]"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/40 via-transparent to-gray-50/40" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#0f766e 0.5px, transparent 0.5px)', backgroundSize: '32px 32px' }} />
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
