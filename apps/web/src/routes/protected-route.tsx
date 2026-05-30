import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  allowedResourcesForRole,
  type FilteredResourceType,
  type Role,
} from '@hphii/fhir-domain';
import { useAuth } from '../lib/auth/auth-context';
import { AppLayout } from '../components/layout/app-layout';

/**
 * Layout route: blocks unauthenticated access and wraps children in the app
 * shell. Unauthenticated users are sent to /login with the attempted path so
 * they return there after signing in.
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

/**
 * Per-route authorization gate (defense in depth). Even though the nav hides
 * forbidden sections, a user typing the URL directly is redirected to the
 * dashboard unless their role's §6 filter allows the resource.
 */
export function RequireResource({
  resource,
  children,
}: {
  resource: FilteredResourceType;
  children: ReactElement;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedResourcesForRole(user.role).includes(resource)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

/**
 * Per-route authorization gate by role. Used for sections that are not driven
 * by the §6 $everything resource filter — e.g. M2 Triage (Encounter-based),
 * which nurses and physicians may use.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly Role[];
  children: ReactElement;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
