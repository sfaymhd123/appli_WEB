import type { Role } from '@hphii/fhir-domain';

/** Mirror of the gateway AuthService TokenResponse (apps/gateway auth.service). */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  role: Role;
}

/** Returned by /auth/login when the account has MFA enabled. */
export interface MfaRequiredResponse {
  mfa_required: true;
  mfa_token: string;
}

export type LoginResult = TokenResponse | MfaRequiredResponse;

export function isMfaRequired(result: LoginResult): result is MfaRequiredResponse {
  return (result as MfaRequiredResponse).mfa_required === true;
}

/** The authenticated principal the UI renders from (decoded from the JWT). */
export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
}
