import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { routes } from '@/lib/routes';
import { requestAuthPrompt } from '@/lib/authPrompt';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireEnrollment?: boolean;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading || session) return;
    requestAuthPrompt({
      from: location,
      title: "Sign in to access your learning space",
      description: "Create a free account or sign in to continue to this protected page. You will return here after authentication.",
    });
  }, [loading, session, location.pathname, location.search, location.hash]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
          Sign in is required to access this page.
        </div>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
          Your requested destination is preserved. Sign in or create a free account to continue.
        </p>
        <Link to={routes.explore()} className="btn-primary mt-6">Explore courses</Link>
      </div>
    );
  }

  if (profile?.role === 'admin' && !requireAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (requireAdmin && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
