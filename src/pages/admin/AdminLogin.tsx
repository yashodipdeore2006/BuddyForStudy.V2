import { FormEvent, useState } from "react";
import { ShieldCheck, Mail, Lock, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res=await fetch(`${API_URL}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const data=await res.json();
      if(!res.ok || !data.success) throw new Error(data.message || "Invalid admin credentials");
      if(data.data?.user?.role!=="admin") throw new Error("This account does not have administrator access.");
      localStorage.setItem("bfs_admin_token",data.data.token); localStorage.setItem("bfs_admin_user",JSON.stringify(data.data.user)); navigate("/admin",{replace:true});
    } catch(e){setError(e instanceof Error?e.message:"Admin login failed");} finally{setLoading(false);}
  }
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white"><ShieldCheck/></div>
      <h1 className="mt-5 text-center text-2xl font-bold text-slate-900">BuddyForStudy Admin</h1>
      <p className="mt-2 text-center text-sm text-slate-500">Secure platform control center</p>
      {error&&<div className="mt-5 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4"/>{error}</div>}
      <div className="mt-6 space-y-4">
        <div><label className="mb-1 block text-sm font-medium">Admin email</label><div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className="input-field pl-10" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div></div>
        <div><label className="mb-1 block text-sm font-medium">Password</label><div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className="input-field pl-10" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></div></div>
        <button disabled={loading} className="btn-primary w-full">{loading?"Authenticating…":"Sign in as Admin"}</button>
      </div>
    </form>
  </div>;
}
