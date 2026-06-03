import type { Role } from '@hphii/fhir-domain';

/**
 * Persistent token store (localStorage).
 *
 * Persisting to localStorage allows the session to survive page reloads.
 * While slightly less secure than in-memory for production (XSS risk),
 * it is the expected behavior for most web applications.
 */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  role: Role;
  email: string;
  /** Epoch ms when the access token expires (advisory; gateway is authority). */
  expiresAt: number;
}

const STORAGE_KEY = 'hphii:auth-session';

let session: AuthSession | null = null;

// Initialize from storage
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    session = JSON.parse(saved);
  }
} catch {
  // Ignore malformed storage
}

export function getSession(): AuthSession | null {
  return session;
}

export function setSession(next: AuthSession): void {
  session = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearSession(): void {
  session = null;
  localStorage.removeItem(STORAGE_KEY);
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
