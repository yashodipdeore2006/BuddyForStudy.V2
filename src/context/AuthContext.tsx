import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, clearAuth, getToken, setAuth } from '@/lib/api';
import type { Profile } from '@/types';

export interface AppSession { user: { id: string; email: string; name: string; role: 'user'|'admin'; profileImage?: string; }; }
interface AuthContextValue {
  session: AppSession | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email:string,password:string)=>Promise<Profile>;
  signUp: (name:string,email:string,password:string)=>Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,setSession]=useState<AppSession|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);

  const hydrate = async () => {
    const token=getToken();
    if(!token){setLoading(false);return;}
    try {
      const data=await apiFetch('/api/auth/me');
      const u=data.user;
      const s:AppSession={user:{id:u.id,email:u.email,name:u.name,role:u.role,profileImage:u.profileImage}};
      setSession(s);
      setProfile({id:u.id,name:u.name,role:u.role,is_active:u.isActive,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    } catch { clearAuth(); setSession(null); setProfile(null); }
    finally { setLoading(false); }
  };
  useEffect(()=>{hydrate();},[]);

  const signIn=async(email:string,password:string)=>{
    const data=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    setAuth(data.token,data.user);
    const u=data.user; const s:AppSession={user:{id:u.id,email:u.email,name:u.name,role:u.role,profileImage:u.profileImage}};
    setSession(s); setProfile({id:u.id,name:u.name,role:u.role,is_active:u.isActive,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    return profileFromUser(u);
  };
  const signUp=async(name:string,email:string,password:string)=>{
    const data=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password})});
    setAuth(data.token,data.user);
    const u=data.user; setSession({user:{id:u.id,email:u.email,name:u.name,role:u.role,profileImage:u.profileImage}});
    const p=profileFromUser(u); setProfile(p); return p;
  };
  const signOut=async()=>{try{if(getToken()) await apiFetch('/api/auth/logout',{method:'POST'});}catch{} clearAuth();setSession(null);setProfile(null);};
  const refreshProfile=async()=>{const data=await apiFetch('/api/auth/me');const u=data.user;setSession({user:{id:u.id,email:u.email,name:u.name,role:u.role,profileImage:u.profileImage}});setProfile(profileFromUser(u));};
  return <AuthContext.Provider value={{session,profile,loading,signIn,signUp,signOut,refreshProfile}}>{children}</AuthContext.Provider>;
}
function profileFromUser(u:any):Profile{return {id:u.id,name:u.name,role:u.role,is_active:u.isActive,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}
export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error('useAuth must be used within AuthProvider');return ctx;}
