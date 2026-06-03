import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowRight, Activity, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { completePasswordReset } from '../../lib/api/auth-api';
import { useToast } from '../../components/ui/toast';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await completePasswordReset(token, password);
      setSuccess(true);
      toast('Mot de passe réinitialisé avec succès.', 'success');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lien invalide ou expiré.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-4">
          <p className="text-sm font-bold text-red-600 uppercase tracking-widest">Erreur</p>
          <h1 className="text-2xl font-black text-gray-900">Lien de réinitialisation manquant</h1>
          <Button onClick={() => navigate('/login')}>Retour à la connexion</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center p-12 bg-clinical-900">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/login-bg.jpg" 
            alt="Medical background" 
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-clinical-900/90 via-clinical-900/60 to-clinical-900/30" />
          <div className="absolute inset-0 backdrop-blur-[1px]" />
        </div>

        <div className="relative z-10 max-w-lg text-center space-y-8">
          <div className="inline-flex rounded-3xl bg-white p-6">
            <Activity className="h-12 w-12 text-clinical-600" />
          </div>
          <h1 className="text-4xl font-black text-white">Sécurité du compte</h1>
          <p className="text-lg text-clinical-100 font-medium">
            Choisissez un mot de passe robuste pour protéger l'accès aux données de santé de vos patients.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50/50">
        <div className="w-full max-w-md space-y-8">
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-clinical-900/5 ring-1 ring-gray-100">
            {success ? (
              <div className="text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Terminé</h3>
                  <p className="text-sm text-gray-500 font-medium">Votre mot de passe a été mis à jour.</p>
                </div>
                <Button fullWidth onClick={() => navigate('/login')}>
                  Se connecter
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Nouveau mot de passe</h3>
                  <p className="text-sm text-gray-500 font-medium">Réinitialisation de votre accès HPHII / DSP</p>
                </div>

                <div className="space-y-4">
                  <Input
                    id="password"
                    type="password"
                    label="Nouveau mot de passe"
                    icon={Lock}
                    value={password}
                    onChange={setPassword}
                  />
                  <Input
                    id="confirm"
                    type="password"
                    label="Confirmer le mot de passe"
                    icon={Lock}
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                  />
                </div>

                {error && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl ring-1 ring-red-100">
                    {error}
                  </p>
                )}

                <Button type="submit" fullWidth size="lg" loading={submitting}>
                  Mettre à jour <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ id, type, label, icon: Icon, value, onChange }: any) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
        {label}
      </label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-clinical-600 transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="h-12 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 pl-12 pr-4 text-sm font-medium text-gray-900 transition-all focus:border-clinical-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinical-500/10"
        />
      </div>
    </div>
  );
}
