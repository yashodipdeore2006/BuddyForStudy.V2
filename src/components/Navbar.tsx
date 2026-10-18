import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GraduationCap, LayoutDashboard, BookOpen, Bookmark, LogOut, User as UserIcon, Settings, Users, BarChart3, Shield, Menu, X, Sparkles, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import NotificationMenu from '@/components/NotificationMenu';
import { classNames } from '@/lib/utils';

function readSavedTheme() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('bfs-theme') === 'dark';
  } catch {
    return false;
  }
}

export default function Navbar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(readSavedTheme);
  const isAdmin = profile?.role === 'admin';
  const settingsPath = isAdmin ? '/admin/settings' : '/settings';
  const profilePath = isAdmin ? '/admin/settings' : '/profile';

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkTheme ? 'dark' : 'light';
    try {
      window.localStorage.setItem('bfs-theme', isDarkTheme ? 'dark' : 'light');
    } catch {
      // The selected theme still works for this session when storage is unavailable.
    }
  }, [isDarkTheme]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => { await signOut(); navigate('/'); };
  const links = isAdmin
    ? [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard }, { to: '/admin/users', label: 'Users', icon: Users }, { to: '/admin/courses', label: 'Courses', icon: BookOpen }, { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 }]
    : [{ to: '/courses', label: 'Courses', icon: BookOpen }, { to: '/my-courses', label: 'My Learning', icon: GraduationCap }, { to: '/saved-courses', label: 'Saved', icon: Bookmark }, { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }];

  const themeToggle = (
    <button
      type="button"
      onClick={() => setIsDarkTheme((current) => !current)}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <nav className="bfs-shell flex h-[72px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-6 xl:gap-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="BuddyForStudy home">
            <span className="bfs-brand-mark h-11 w-11 overflow-hidden">
              <img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
            </span>
            <span className="hidden sm:block">
              <span className="bfs-brand-wordmark block text-[17px] leading-tight">Buddy<span className="brand-accent">For</span>Study</span>
              <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">Learn · Plan · Grow</span>
            </span>
          </Link>
          {profile && <div className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white p-1 md:flex">{links.map((link) => {
            const active = location.pathname === link.to || location.pathname.startsWith(link.to + '/');
            return <Link key={link.to} to={link.to} className={classNames('inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-all', active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950')}><link.icon className="h-4 w-4" />{link.label}</Link>;
          })}</div>}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {themeToggle}
          {profile ? <>
            {isAdmin && <span className="badge bg-blue-50 text-blue-700"><Shield className="h-3 w-3" />Admin</span>}
            {!isAdmin && <NotificationMenu />}
            <Link to={settingsPath} className="rounded-full p-2.5 text-slate-600 hover:bg-slate-100" aria-label="Settings"><Settings className="h-5 w-5" /></Link>
            <Link to={profilePath} className="flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1.5 hover:border-slate-200 hover:bg-slate-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-900 text-sm font-bold text-white">{profile.name.charAt(0).toUpperCase()}</span>
              <span className="max-w-28 truncate text-sm font-semibold text-slate-700">{profile.name}</span>
            </Link>
            <button onClick={handleSignOut} className="btn-ghost p-2.5" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
          </> : <>
            <Link to="/courses" className="btn-ghost">Explore</Link>
            <Link to="/login" className="btn-ghost">Sign in</Link>
            <Link to="/register" className="btn-primary"><Sparkles className="h-4 w-4" />Start learning</Link>
          </>}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {themeToggle}
          <button className="rounded-full border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-100" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </nav>
      {mobileOpen && <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 shadow-xl md:hidden"><div className="flex flex-col gap-1">
        {profile && links.map((link) => <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"><link.icon className="h-4 w-4" />{link.label}</Link>)}
        {profile ? <>
          <Link to={settingsPath} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Settings className="h-4 w-4" />Settings</Link>
          <Link to={profilePath} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><UserIcon className="h-4 w-4" />{isAdmin ? 'Admin Settings' : 'Profile'}</Link>
          <button onClick={() => { setMobileOpen(false); void handleSignOut(); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4" />Sign out</button>
        </> : <div className="grid grid-cols-2 gap-2 pt-2"><Link to="/login" onClick={() => setMobileOpen(false)} className="btn-secondary">Sign in</Link><Link to="/register" onClick={() => setMobileOpen(false)} className="btn-primary">Start learning</Link></div>}
      </div></div>}
    </header>
  );
}
