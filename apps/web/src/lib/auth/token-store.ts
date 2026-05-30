import type { Role } from '@hphii/fhir-domain';

/**
 * In-memory token store (CLAUDE.md §9 PHI/secret safety).
 *
 * Tokens are deliberately NOT persisted to localStorage/sessionStorage — that
 * keeps them out of reach of XSS and disk. The trade-off is that a full page
 * reload requires re-authentication, which is acceptable for this PoC and the
 * safer default. The axios layer reads these synchronously on every request.
 */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  role: Role;
  email: string;
  /** Epoch ms when the access token expires (advisory; gateway is authority). */
  expiresAt: number;
}

let session: AuthSession | null = null;

export function getSession(): AuthSession | null {
  return session;
}

export function setSession(next: AuthSession): void {
  session = next;
}

export function clearSession(): void {
  session = null;
}

export function getAccessToken(): string | null {
  return session?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return session?.refreshToken ?? null;
}

/** Event name dispatched on window when a refresh fails and the user is logged out. */
export const AUTH_EXPIRED_EVENT = 'hphii:auth-expired';

export function emitAuthExpired(): void {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
