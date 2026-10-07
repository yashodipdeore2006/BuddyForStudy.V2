import type { ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, BookOpen, CreditCard, Megaphone, Settings, ScrollText, LogOut, Tag, ShieldCheck, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AdminGuard({children}:{children:ReactNode}) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>;
  }

  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "admin") return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

const links=[
  ["/admin","Overview",LayoutDashboard],[ "/admin/users","Users",Users],[ "/admin/courses","Courses",BookOpen],
  ["/admin/plans","Plans & Pricing",CreditCard],[ "/admin/billing","Billing & Refunds",CreditCard],
  ["/admin/communications","Communications",Megaphone],[ "/admin/coupons","Coupons",Tag],
  ["/admin/audit","Audit Log",ScrollText],[ "/admin/settings","Platform Settings",Settings]
] as const;

export default function AdminLayout({children}:{children:ReactNode}) {
 const nav=useNavigate();
 const { session, signOut } = useAuth();

 const handleSignOut = async () => {
   await signOut();
   nav("/login", { replace: true });
 };

 return <div className="min-h-screen bg-slate-100">
  <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
   <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600"><ShieldCheck className="h-5 w-5"/></div><div><p className="font-bold">BuddyForStudy</p><p className="text-[10px] uppercase tracking-widest text-slate-400">Admin Control</p></div></div>
   <nav className="flex-1 space-y-1 overflow-y-auto p-3">{links.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==="/admin"} className={({isActive})=>`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive?"bg-blue-600 text-white":"text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4"/>{label}<ChevronRight className="ml-auto h-3 w-3 opacity-50"/></NavLink>)}</nav>
   <div className="border-t border-white/10 p-3"><div className="mb-3 rounded-lg bg-white/5 p-3"><p className="truncate text-sm font-semibold">{session?.user.name||"Administrator"}</p><p className="truncate text-xs text-slate-400">{session?.user.email||""}</p></div><button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-300"><LogOut className="h-4 w-4"/>Sign out</button></div>
  </aside>
  <main className="lg:pl-64"><div className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</div></main>
 </div>;
}
