import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from '@/components/AuthLayout';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { routes } from "@/lib/routes";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, profile, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;

  useEffect(() => {
    if (session && profile) {
      if (profile.role === 'admin') {
        navigate(routes.adminHome(), { replace: true });
      } else if (from) {
        navigate(from, { replace: true });
      } else {
        navigate(routes.home(), { replace: true });
      }
    }
  }, [session, profile, navigate, from]);

  const handleGoogle = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle(credential);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if ("requiresOtp" in result) {
        navigate(routes.verifyLogin(), { replace: true, state: { email: result.email, from } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
      setNeedsVerification(message.toLowerCase().includes('email not verified'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your learning journey"
      footer={
        <>
          Don't have an account?{' '}
          <Link to={routes.register()} className="font-semibold text-blue-600 hover:text-blue-700">
            Sign up
          </Link>

        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
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
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <Link to={routes.forgotPassword()} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Forgot password?</Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pl-10 pr-10"
              placeholder="••••••••"
              required
              autoComplete="current-password"
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

        {needsVerification && (
          <Link
            to={routes.verifyEmail()}
            state={{ email }}
            className="block rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700 hover:bg-blue-100"
          >
            Verify your email
          </Link>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-400">OR</span></div>
        </div>

        <GoogleSignInButton onCredential={handleGoogle} disabled={loading} />
      </form>
    </AuthLayout>
  );
}
