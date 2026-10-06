import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, BookOpen, CreditCard, Megaphone, Settings, ScrollText, LogOut, Tag, ShieldCheck, ChevronRight } from "lucide-react";
import { clearAdminToken } from "@/lib/adminApi";

export function AdminGuard({children}:{children:ReactNode}) {
  const token=localStorage.getItem("bfs_admin_token");
  return token ? <>{children}</> : <NavigateToLogin/>;
}
function NavigateToLogin(){ window.location.replace("/admin/login"); return null; }

const links=[
  ["/admin","Overview",LayoutDashboard],[ "/admin/users","Users",Users],[ "/admin/courses","Courses",BookOpen],
  ["/admin/plans","Plans & Pricing",CreditCard],[ "/admin/billing","Billing & Refunds",CreditCard],
  ["/admin/communications","Communications",Megaphone],[ "/admin/coupons","Coupons",Tag],
  ["/admin/audit","Audit Log",ScrollText],[ "/admin/settings","Platform Settings",Settings]
] as const;

export default function AdminLayout({children}:{children:ReactNode}) {
 const nav=useNavigate(); const user=JSON.parse(localStorage.getItem("bfs_admin_user")||"{}");
 return <div className="min-h-screen bg-slate-100">
  <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
   <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600"><ShieldCheck className="h-5 w-5"/></div><div><p className="font-bold">BuddyForStudy</p><p className="text-[10px] uppercase tracking-widest text-slate-400">Admin Control</p></div></div>
   <nav className="flex-1 space-y-1 overflow-y-auto p-3">{links.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==="/admin"} className={({isActive})=>`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive?"bg-blue-600 text-white":"text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4"/>{label}<ChevronRight className="ml-auto h-3 w-3 opacity-50"/></NavLink>)}</nav>
   <div className="border-t border-white/10 p-3"><div className="mb-3 rounded-lg bg-white/5 p-3"><p className="truncate text-sm font-semibold">{user.name||"Administrator"}</p><p className="truncate text-xs text-slate-400">{user.email||""}</p></div><button onClick={()=>{clearAdminToken();nav("/admin/login",{replace:true})}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-300"><LogOut className="h-4 w-4"/>Sign out</button></div>
  </aside>
  <main className="lg:pl-64"><div className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</div></main>
 </div>;
}
