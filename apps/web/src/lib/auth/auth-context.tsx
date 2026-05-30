import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth-api';
import { decodeJwt } from './jwt';
import {
  AUTH_EXPIRED_EVENT,
  clearSession,
  getRefreshToken,
  setSession,
} from './token-store';
import {
  isMfaRequired,
  type AuthUser,
  type TokenResponse,
} from './auth-types';

export interface SignInResult {
  /** When true, the caller must collect a TOTP code and call `completeMfa`. */
  mfaRequired: boolean;
  /** Present only when mfaRequired is true. */
  mfaToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  /** Persist tokens to the in-memory store and derive the principal from the JWT. */
  const establishSession = useCallback((tokens: TokenResponse) => {
    const claims = decodeJwt(tokens.access_token);
    const principal: AuthUser = {
      sub: claims?.sub ?? '',
      email: claims?.email ?? '',
      role: claims?.role ?? tokens.role,
    };
    setSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      role: principal.role,
      email: principal.email,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    setUser(principal);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const result = await authApi.login(email, password);
      if (isMfaRequired(result)) {
        return { mfaRequired: true, mfaToken: result.mfa_token };
      }
      establishSession(result);
      return { mfaRequired: false };
    },
    [establishSession],
  );

  const completeMfa = useCallback(
    async (mfaToken: string, code: string): Promise<void> => {
      const tokens = await authApi.verifyMfa(mfaToken, code);
      establishSession(tokens);
    },
    [establishSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    // Best-effort server-side revocation; always clear locally regardless.
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        /* ignore — local logout below is what matters for the UI */
      }
    }
    clearSession();
    setUser(null);
  }, []);

  // The axios layer fires this when a refresh fails — force the UI to log out.
  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, signIn, completeMfa, signOut }),
    [user, signIn, completeMfa, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
