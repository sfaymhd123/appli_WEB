import { authClient } from './axios';
import type { LoginResult, TokenResponse } from '../auth/auth-types';

/**
 * Calls the gateway auth endpoints (all @Public). These use `authClient`, NOT
 * the authenticated `api` instance, so they never trigger the 401-refresh loop.
 */

export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await authClient.post<LoginResult>('/auth/login', { email, password });
  return data;
}

export async function verifyMfa(mfaToken: string, code: string): Promise<TokenResponse> {
  const { data } = await authClient.post<TokenResponse>('/auth/mfa/verify', {
    mfaToken,
    code,
  });
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await authClient.post('/auth/logout', { refreshToken });
}
