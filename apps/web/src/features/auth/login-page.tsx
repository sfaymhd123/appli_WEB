import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { Button } from '../../components/ui/button';
import { Card, CardBody } from '../../components/ui/card';
import { useAuth } from '../../lib/auth/auth-context';

type Phase = 'credentials' | 'mfa';

interface RedirectState {
  from?: string;
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    if (err.response?.status === 401) return 'Identifiants ou code invalides.';
    if (err.code === 'ERR_NETWORK') return 'Service indisponible. Vérifiez votre connexion.';
  }
  return fallback;
}

export function LoginPage() {
  const { isAuthenticated, signIn, completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const target = (location.state as RedirectState | null)?.from ?? '/';

  const [phase, setPhase] = useState<Phase>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → bounce to the intended destination.
  if (isAuthenticated) return <Navigate to={target} replace />;

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        setPhase('mfa');
      } else {
        navigate(target, { replace: true });
      }
    } catch (err) {
      setError(messageFor(err, 'Échec de la connexion.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await completeMfa(mfaToken, code.trim());
      navigate(target, { replace: true });
    } catch (err) {
      setError(messageFor(err, 'Vérification MFA échouée.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-clinical-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-clinical-800">HPHII · DSP</h1>
          <p className="mt-1 text-sm text-gray-600">
            Dossier de Santé Partagé — Hôpital Provincial Hassan II de Settat
          </p>
        </div>

        <Card>
          <CardBody>
            {phase === 'credentials' ? (
              <form onSubmit={onSubmitCredentials} className="space-y-4" noValidate>
                <h2 className="text-lg font-semibold text-gray-900">Connexion</h2>

                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                    Adresse e-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-tap w-full rounded-lg border border-gray-300 px-3 text-base focus:border-clinical-600 focus:outline-none focus:ring-1 focus:ring-clinical-600"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                    Mot de passe
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-tap w-full rounded-lg border border-gray-300 px-3 text-base focus:border-clinical-600 focus:outline-none focus:ring-1 focus:ring-clinical-600"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <Button type="submit" fullWidth size="lg" loading={submitting}>
                  Se connecter
                </Button>
              </form>
            ) : (
              <form onSubmit={onSubmitMfa} className="space-y-4" noValidate>
                <h2 className="text-lg font-semibold text-gray-900">Vérification en deux étapes</h2>
                <p className="text-sm text-gray-600">
                  Saisissez le code à 6 chiffres de votre application d&apos;authentification.
                </p>

                <div>
                  <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">
                    Code MFA
                  </label>
                  <input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="min-h-tap w-full rounded-lg border border-gray-300 px-3 text-center text-xl tracking-[0.5em] focus:border-clinical-600 focus:outline-none focus:ring-1 focus:ring-clinical-600"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <Button type="submit" fullWidth size="lg" loading={submitting} disabled={code.length !== 6}>
                  Vérifier
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    setPhase('credentials');
                    setCode('');
                    setError(null);
                  }}
                >
                  Retour
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-gray-400">
          Prototype académique — données fictives, usage non clinique.
        </p>
      </div>
    </main>
  );
}
