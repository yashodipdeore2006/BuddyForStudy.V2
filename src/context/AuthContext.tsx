import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, clearAuth, getToken, setAuth } from '@/lib/api';
import { syncBrowserPushSubscription, logoutBrowserPush } from '@/lib/pushNotifications';
import type { Profile } from '@/types';

export interface AppSession { user: { id: string; email: string; name: string; role: 'user'|'admin'; authProvider: 'local'|'google'|'local_google'; profileImage?: string; }; }
interface AuthContextValue {
  session: AppSession | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email:string,password:string)=>Promise<Profile | { requiresOtp: true; email: string; purpose: 'login_verification' }>;
  signUp: (name:string,email:string,password:string)=>Promise<Profile | { requiresVerification: true; email: string }>;
  verifyEmail: (email:string,otp:string)=>Promise<Profile>;
  verifyLogin: (email:string,otp:string)=>Promise<Profile>;
  resetPassword: (email:string,otp:string,newPassword:string)=>Promise<Profile>;
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
      try { await logoutBrowserPush(); } catch {}
      clearAuth(); setSession(null); setProfile(null);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ void hydrate(); },[]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch("/api/notifications/preferences");
        if (!cancelled && data.preferences?.pushEnabled === true) {
          await syncBrowserPushSubscription();
        }
      } catch {
        // Browser push subscription restoration must never block normal app usage.
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  const signIn: AuthContextValue["signIn"] = async(email:string,password:string)=>{
    const data=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    if (data.requiresOtp === true) {
      return {
        requiresOtp: true,
        email: String(data.email || email),
        purpose: "login_verification" as const,
      };
    }
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const verifyLogin=async(email:string,otp:string)=>{
    const data=await apiFetch('/api/auth/verify-login',{method:'POST',body:JSON.stringify({email,otp})});
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const resetPassword=async(email:string,otp:string,newPassword:string)=>{
    const data=await apiFetch('/api/auth/reset-password',{method:'POST',body:JSON.stringify({email,otp,newPassword})});
    setAuth(data.token,data.user);
    applyUser(data.user);
    return profileFromUser(data.user);
  };

  const signUp: AuthContextValue["signUp"] = async(name:string,email:string,password:string)=>{
    const data=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password})});
    if (data.requiresVerification === true) {
      return {
        requiresVerification: true,
        email: String(data.email || email),
      };
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
    try { await logoutBrowserPush(); } catch {}
    try{if(getToken()) await apiFetch('/api/auth/logout',{method:'POST'});}catch{}
    clearAuth();
    setSession(null);setProfile(null);
  };

  const refreshProfile=async()=>{
    const data=await apiFetch('/api/auth/me');
    applyUser(data.user);
  };

  return <AuthContext.Provider value={{session,profile,loading,signIn,signUp,verifyEmail,verifyLogin,resetPassword,signInWithGoogle,signOut,refreshProfile}}>{children}</AuthContext.Provider>;
}

export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error('useAuth must be used within AuthProvider');return ctx;}
