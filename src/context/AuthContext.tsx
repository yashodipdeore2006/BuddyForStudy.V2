import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, clearAuth, getToken, setAuth } from '@/lib/api';
import type { Profile } from '@/types';

export interface AppSession { user: { id: string; email: string; name: string; role: 'user'|'admin'; authProvider: 'local'|'google'|'local_google'; profileImage?: string; }; }
interface AuthContextValue {
  session: AppSession | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email:string,password:string)=>Promise<Profile>;
  signUp: (name:string,email:string,password:string)=>Promise<Profile | { requiresVerification: true; email: string }>;
  verifyEmail: (email:string,otp:string)=>Promise<Profile>;
  signInWithGoogle: (credential:string)=>Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function profileFromUser(u:any):Profile {
  return {id:u.id,name:u.name,role:u.role,auth_provider:u.authProvider,is_active:u.isActive,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,setSession]=useState<AppSession|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);

  const applyUser = (u:any) => {
    const s:AppSession={user:{id:u.id,email:u.email,name:u.name,role:u.role,authProvider:u.authProvider,profileImage:u.profileImage}};
    setSession(s);
    setProfile(profileFromUser(u));
  };

  const hydrate = async () => {
    const token=getToken();
    if(!token){setLoading(false);return;}
    try {
      const data=await apiFetch('/api/auth/me');
      applyUser(data.user);
    } catch {
      clearAuth(); setSession(null); setProfile(null);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ void hydrate(); },[]);

  const signIn=async(email:string,password:string)=>{
    const data=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const signUp=async(name:string,email:string,password:string)=>{
    const data=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password})});
    if (data.requiresVerification) {
      return { requiresVerification: true, email: data.email };
    }
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const verifyEmail=async(email:string,otp:string)=>{
    const data=await apiFetch('/api/auth/verify-email',{method:'POST',body:JSON.stringify({email,otp})});
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const signInWithGoogle=async(credential:string)=>{
    const data=await apiFetch('/api/auth/google',{method:'POST',body:JSON.stringify({credential})});
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const signOut=async()=>{
    try{if(getToken()) await apiFetch('/api/auth/logout',{method:'POST'});}catch{}
    clearAuth();
    setSession(null);setProfile(null);
  };

  const refreshProfile=async()=>{
    const data=await apiFetch('/api/auth/me');
    applyUser(data.user);
  };

  return <AuthContext.Provider value={{session,profile,loading,signIn,signUp,verifyEmail,signInWithGoogle,signOut,refreshProfile}}>{children}</AuthContext.Provider>;
}

export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error('useAuth must be used within AuthProvider');return ctx;}
