import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from '@/components/AuthLayout';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { routes } from "@/lib/routes";

export default function Register() {
  const navigate = useNavigate();
  const { session, profile, signUp, signInWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [marketingEmailConsent, setMarketingEmailConsent] = useState(false);

  useEffect(() => {
    if (session && profile) {
      if (profile.role === 'admin') {
        navigate(routes.adminHome(), { replace: true });
      } else {
        navigate(routes.home(), { replace: true });
      }
    }
  }, [session, profile, navigate]);

  const handleGoogle = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle(credential, {
        termsAccepted: true,
        privacyAcknowledged: true,
        marketingEmailConsent
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters long'); return; }
    setLoading(true);
    try {
      const result = await signUp(name, email, password, {
        termsAccepted: true,
        privacyAcknowledged: true,
        marketingEmailConsent
      });
      if ("requiresVerification" in result) {
        navigate(routes.verifyEmail(), { state: { email: result.email } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your learning journey today — it's free"
      footer={
        <>
          Already have an account?{' '}
          <Link to={routes.login()} className="font-semibold text-blue-600 hover:text-blue-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field pl-10"
              placeholder="John Doe"
              required
              autoComplete="name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field pl-10"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pl-10 pr-10"
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="register-confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="register-confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field pl-10"
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              checked={marketingEmailConsent}
              onChange={(event) => setMarketingEmailConsent(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
            />
            <span>Send me optional product news, learning tips, and offers by email. This is optional, and I can unsubscribe or change this preference later.</span>
          </label>
          <p className="text-center text-xs leading-5 text-slate-500">
            By continuing, you agree to our <Link to="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold text-violet-700 underline underline-offset-2">Terms of Service</Link> and acknowledge our <Link to="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-violet-700 underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <div className="relative py-0.5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-400">OR</span></div>
        </div>

        <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />

      </form>
    </AuthLayout>
  );
}
