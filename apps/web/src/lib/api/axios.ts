import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { decodeJwt } from '../auth/jwt';
import {
  clearSession,
  emitAuthExpired,
  getAccessToken,
  getRefreshToken,
  setSession,
} from '../auth/token-store';
import type { TokenResponse } from '../auth/auth-types';

// VITE_* is exposed to the browser — NEVER put secrets here (CLAUDE.md §9).
const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Public client for the @Public auth endpoints (login/mfa/refresh/logout).
 * It never injects a JWT and is never subject to the refresh-on-401 retry, so
 * it cannot cause a refresh loop.
 */
export const authClient: AxiosInstance = axios.create({ baseURL });

/** Authenticated client: injects the access token and refreshes once on 401. */
export const api: AxiosInstance = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight refresh: concurrent 401s share one /auth/refresh round-trip.
let refreshPromise: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('no-refresh-token');

  const { data } = await authClient.post<TokenResponse>('/auth/refresh', {
    refreshToken,
  });
  const claims = decodeJwt(data.access_token);
  setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    role: data.role,
    email: claims?.email ?? '',
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried && getRefreshToken()) {
      original._retried = true;
      try {
        refreshPromise ??= runRefresh().finally(() => {
          refreshPromise = null;
        });
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        // Refresh failed → session is dead. Clear and notify the app shell.
        clearSession();
        emitAuthExpired();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
