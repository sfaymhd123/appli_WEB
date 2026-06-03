import type { Role } from '@hphii/fhir-domain';

/** Claims carried by gateway JWTs. `purpose` separates access tokens from the
 *  short-lived MFA-challenge token. */
export interface JwtPayload {
  sub: string;
  role: Role;
  email: string;
  purpose?: 'access' | 'mfa';
  iat?: number;
  exp?: number;
  iss?: string;
}

/** The authenticated principal attached to the request by the JWT strategy. */
export interface AuthenticatedUser {
  sub: string;
  role: Role;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
