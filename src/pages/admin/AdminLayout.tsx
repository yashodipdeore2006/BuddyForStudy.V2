import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CreditCard,
  Megaphone,
  Settings,
  ScrollText,
  LogOut,
  Tag,
  ShieldCheck,
  ChevronRight,
  Activity,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminFetch } from "@/lib/adminApi";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "admin") return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

const links = [
  ["/admin", "Overview", LayoutDashboard],
  ["/admin/users", "Users", Users],
  ["/admin/courses", "Courses", BookOpen],
  ["/admin/analytics", "Analytics", Activity],
  ["/admin/plans", "Plans & Pricing", CreditCard],
  ["/admin/billing", "Billing & Refunds", CreditCard],
  ["/admin/communications", "Communications", Megaphone],
  ["/admin/coupons", "Coupons", Tag],
  ["/admin/audit", "Audit Log", ScrollText],
  ["/admin/settings", "Platform Settings", Settings],
] as const;

function navClass(isActive: boolean) {
  return (
    "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold transition-colors " +
    (isActive
      ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
      : "text-slate-600 hover:bg-white hover:text-slate-950")
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { session, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void adminFetch("/api/admin/roles")
      .then(() => { if (!cancelled) setCanManageRoles(true); })
      .catch(() => { if (!cancelled) setCanManageRoles(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  const handleSignOut = async () => {
    await signOut();
    nav("/login", { replace: true });
  };

  const visibleLinks = canManageRoles ? [...links, ["/admin/roles", "Administrator Roles", ShieldCheck] as const] : links;

  const navigation = (
    <nav aria-label="Admin navigation" className="space-y-1 p-3">
      {visibleLinks.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/admin"}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => navClass(isActive)}
        >
          <Icon className="h-4 w-4" />
          {label}
          <ChevronRight className="ml-auto h-3 w-3 opacity-50" />
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f1f4f7]">
      <div className="sticky top-0 z-50 border-b border-slate-200 bg-white text-slate-950 lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <NavLink to="/admin" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold">BuddyForStudy</p>
              <p className="text-[9px] uppercase tracking-widest text-slate-400">Admin</p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label={mobileOpen ? "Close admin navigation" : "Open admin navigation"}
            aria-expanded={mobileOpen}
            aria-controls="admin-mobile-navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div
            id="admin-mobile-navigation"
            className="max-h-[calc(100vh-56px)] overflow-y-auto border-t border-slate-200 bg-white"
          >
            {navigation}
            <div className="border-t border-slate-200 p-3">
              <NavLink
                to="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              >
                <ExternalLink className="h-4 w-4" />
                View site
              </NavLink>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-1 flex w-full items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white text-slate-950 lg:flex">
        <NavLink
          to="/admin"
          className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 transition-colors hover:bg-slate-50"
          aria-label="Admin home"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold">BuddyForStudy</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Admin Control</p>
          </div>
        </NavLink>

        <div className="flex-1 overflow-y-auto">{navigation}</div>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-3 rounded-2xl bg-slate-50 p-3">
            <p className="truncate text-sm font-semibold">{session?.user.name || "Administrator"}</p>
            <p className="truncate text-xs text-slate-400">{session?.user.email || ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NavLink
              to="/"
              className="flex items-center justify-center gap-1 rounded-full px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              <ExternalLink className="h-3 w-3" />
              Site
            </NavLink>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 rounded-full px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="lg:pl-64">
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
