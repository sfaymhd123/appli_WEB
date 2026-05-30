import type { Role } from '@hphii/fhir-domain';

export interface JwtClaims {
  sub: string;
  email: string;
  role: Role;
  exp?: number;
  iat?: number;
}

/**
 * Decode a JWT payload **without verifying the signature** — used only to read
 * display claims (email/role) on the client. The gateway is the sole authority
 * that verifies tokens; never trust these claims for authorization decisions.
 */
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}
