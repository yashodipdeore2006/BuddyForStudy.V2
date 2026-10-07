import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  LogOut,
  User as UserIcon,
  Bell,
  Settings,
  Users,
  BarChart3,
  Shield,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { classNames } from '@/lib/utils';

export default function Navbar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const studentLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/courses', label: 'Courses', icon: BookOpen },
    { to: '/my-courses', label: 'My Learning', icon: GraduationCap },
  ];

  const adminLinks = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const links = isAdmin ? adminLinks : studentLinks;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              BuddyForStudy
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {profile && links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={classNames(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100 hover:text-slate-900',
                  'text-slate-600'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          {profile ? (
            <>
              {isAdmin && (
                <span className="badge bg-blue-50 text-blue-700">
                  <Shield className="h-3 w-3" /> Admin
                </span>
              )}
              <Link
                to="/notifications"
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <Bell className="h-5 w-5" />
              </Link>
              <Link
                to="/settings"
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <Settings className="h-5 w-5" />
              </Link>
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <span>{profile.name}</span>
              </Link>
              <button onClick={handleSignOut} className="btn-ghost" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Sign In
              </Link>
              <Link to="/register" className="btn-primary">
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pb-4 pt-2">
          <div className="flex flex-col gap-1">
            {profile && links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {link.label}
              </Link>
            ))}
            {profile ? (
              <>
                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <UserIcon className="mr-2 inline h-4 w-4" /> Profile
                </Link>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleSignOut();
                  }}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <LogOut className="mr-2 inline h-4 w-4" /> Sign Out
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="btn-secondary flex-1"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="btn-primary flex-1"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
