import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { Mail, Lock, ShieldCheck, ArrowRight, Activity } from 'lucide-react';
import { Button } from '../../components/ui/button';
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
    <div className="flex min-h-screen bg-white">
      {/* Left side: Branding & Info (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-clinical-900 overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-clinical-400 via-transparent to-transparent" />
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.1" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 max-w-lg text-center">
          <div className="mb-10 inline-flex rounded-3xl bg-white p-6 shadow-2xl shadow-black/20">
            <img src="/logo-ms.webp" alt="Ministère de la Santé" className="h-24 w-auto object-contain" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white">
            HPHII <span className="font-light text-clinical-300">/</span> DSP
          </h1>
          <p className="mt-6 text-xl font-medium text-clinical-100 leading-relaxed">
            Dossier de Santé Partagé (DSP).<br />
            Système de santé connecté au service de Settat.
          </p>
          <div className="mt-12 flex justify-center gap-8">
            <Feature icon={ShieldCheck} label="Données sécurisées" />
            <Feature icon={Activity} label="Monitoring live" />
          </div>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50/50">
        <div className="w-full max-w-md space-y-10 animate-in slide-in-from-right-8 duration-700">
          <div className="text-center space-y-4">
            <img src="/logo-ms.webp" alt="Ministère de la Santé" className="mx-auto h-20 w-auto object-contain" />
            <h2 className="lg:hidden text-3xl font-extrabold text-clinical-900 tracking-tight">HPHII / DSP</h2>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h3 className="text-2xl font-bold text-gray-900">Bienvenue</h3>
            <p className="text-sm text-gray-500 font-medium">Connectez-vous à votre espace professionnel</p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-clinical-900/5 ring-1 ring-gray-100">
            {phase === 'credentials' ? (
              <form onSubmit={onSubmitCredentials} className="space-y-6">
                <div className="space-y-4">
                  <Input 
                    id="email" 
                    type="email" 
                    label="Adresse e-mail" 
                    icon={Mail} 
                    value={email}
                    onChange={(val) => setEmail(val)}
                    autoComplete="username"
                  />
                  <Input 
                    id="password" 
                    type="password" 
                    label="Mot de passe" 
                    icon={Lock} 
                    value={password}
                    onChange={(val) => setPassword(val)}
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
                    <p className="text-xs font-semibold text-red-600 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                      {error}
                    </p>
                  </div>
                )}

                <Button type="submit" fullWidth size="lg" loading={submitting} className="rounded-2xl h-12 text-base font-bold shadow-lg shadow-clinical-700/20">
                  <span className="flex items-center gap-2">
                    Accéder au portail <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </form>
            ) : (
              <form onSubmit={onSubmitMfa} className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-clinical-50 text-clinical-600 mb-4">
                    <ShieldCheck className="h-8 w-8" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900">Vérification MFA</h4>
                  <p className="text-xs text-gray-500">Saisissez le code à 6 chiffres généré par votre application.</p>
                </div>

                <div className="relative">
                  <input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="h-16 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-3 text-center text-3xl font-black tracking-[0.6em] text-clinical-900 transition-all focus:border-clinical-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinical-500/10"
                  />
                </div>

                {error && (
                  <p className="text-center text-xs font-bold text-red-600">{error}</p>
                )}

                <div className="space-y-3">
                  <Button type="submit" fullWidth size="lg" loading={submitting} disabled={code.length !== 6} className="rounded-2xl h-12">
                    Confirmer
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('credentials');
                      setCode('');
                      setError(null);
                    }}
                    className="w-full py-2 text-xs font-bold text-gray-400 hover:text-clinical-600 transition-colors uppercase tracking-wider"
                  >
                    Utiliser un autre compte
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="text-center text-[10px] text-gray-400 font-medium uppercase tracking-widest leading-loose">
            Hôpital Provincial Hassan II de Settat
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-clinical-300 ring-1 ring-white/10">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-clinical-200">{label}</span>
    </div>
  );
}

function Input({ id, type, label, icon: Icon, value, onChange, autoComplete }: { 
  id: string; 
  type: string; 
  label: string; 
  icon: any;
  value: string;
  onChange: (val: string) => void;
  autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
        {label}
      </label>
      <div className="relative group">
        <div className={`absolute inset-y-0 left-0 flex items-center pl-4 transition-colors ${focused ? 'text-clinical-600' : 'text-gray-400'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          required
          className="h-12 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 pl-12 pr-4 text-sm font-medium text-gray-900 transition-all focus:border-clinical-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinical-500/10"
        />
      </div>
    </div>
  );
}

