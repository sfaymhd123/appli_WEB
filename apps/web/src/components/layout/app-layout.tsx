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
    <div className="flex min-h-screen flex-col bg-gray-50">
      <OfflineBanner />
      <TopBar onToggleNav={() => setNavOpen((v) => !v)} />
      <div className="flex flex-1">
        {user && (
          <SideNav role={user.role} open={navOpen} onNavigate={() => setNavOpen(false)} />
        )}
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
