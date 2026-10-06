import { useEffect,useState } from "react";
import { Users,BookOpen,CreditCard,IndianRupee,RefreshCcw,UserCheck,AlertTriangle,Activity } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

export default function AdminControlCenter(){
 const [data,setData]=useState<any>(null); const [error,setError]=useState("");
 useEffect(()=>{adminFetch("/api/admin/overview").then(setData).catch(e=>setError(e.message));},[]);
 if(error)return <div className="card p-6 text-red-600">{error}</div>;
 if(!data)return <div className="flex min-h-[60vh] items-center justify-center"><RefreshCcw className="animate-spin text-blue-600"/></div>;
 const s=data.stats;
 const cards=[[Users,"Users",s.users,s.activeUsers+" active"],[BookOpen,"Courses",s.courses,s.published+" published"],[CreditCard,"Subscribers",s.subscribers,"active plans"],[IndianRupee,"Revenue",`₹${Number(s.revenue).toLocaleString("en-IN")}`,"recorded payments"],[UserCheck,"Enrollments",s.enrollments,"total"],[AlertTriangle,"Refund Queue",s.pendingRefunds,"pending review"],[Activity,"Notifications",s.unread,"unread"]]; 
 return <div className="mx-auto max-w-7xl">
  <div><p className="text-sm font-semibold text-blue-600">COMMAND CENTER</p><h1 className="mt-1 text-3xl font-bold">Platform Overview</h1><p className="mt-2 text-slate-500">Operate BuddyForStudy from one secure control surface.</p></div>
  <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([Icon,label,value,sub]:any)=><div className="card p-5" key={label as string}><div className="flex items-center justify-between"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Icon className="h-5 w-5"/></div><span className="text-xs text-slate-400">{sub}</span></div><p className="mt-4 text-2xl font-bold">{value}</p><p className="text-sm text-slate-500">{label}</p></div>)}</div>
  <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="card p-6"><h2 className="font-semibold">Recent Users</h2><div className="mt-4 space-y-3">{data.recentUsers.map((u:any)=><div className="flex items-center gap-3" key={u._id}><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-semibold">{u.name?.[0]?.toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{u.name}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div><span className={`badge ${u.isActive?"bg-green-50 text-green-700":"bg-red-50 text-red-700"}`}>{u.isActive?"Active":"Disabled"}</span></div>)}</div></section>
  <section className="card p-6"><h2 className="font-semibold">Recent Payments</h2><div className="mt-4 space-y-3">{data.recentPayments.map((p:any)=><div className="flex items-center gap-3" key={p._id}><CreditCard className="h-4 w-4 text-slate-400"/><div className="flex-1"><p className="text-sm font-medium">{p.user?.name||"Unknown user"}</p><p className="text-xs text-slate-500">{p.status} · {p.provider}</p></div><b className="text-sm">₹{Number(p.amount).toLocaleString("en-IN")}</b></div>)}</div></section></div>
 </div>;
}
