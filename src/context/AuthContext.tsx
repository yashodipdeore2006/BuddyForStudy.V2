import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, clearAuth, getToken, setAuth } from '@/lib/api';
import { syncBrowserPushSubscription, logoutBrowserPush } from '@/lib/pushNotifications';
import type { Profile } from '@/types';

export interface AppSession { user: { id: string; email: string; name: string; role: 'user'|'admin'; authProvider: 'local'|'google'|'local_google'; profileImage?: string; phoneNumber?: string; }; }
export interface RegistrationConsent {
  termsAccepted: true;
  privacyAcknowledged: true;
  marketingEmailConsent: boolean;
}
interface AuthContextValue {
  session: AppSession | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email:string,password:string)=>Promise<Profile | { requiresOtp: true; email: string; purpose: 'login_verification' }>;
  signUp: (name:string,email:string,password:string,consent:RegistrationConsent)=>Promise<Profile | { requiresVerification: true; email: string }>;
  verifyEmail: (email:string,otp:string)=>Promise<Profile>;
  verifyLogin: (email:string,otp:string)=>Promise<Profile>;
  resetPassword: (email:string,otp:string,newPassword:string)=>Promise<Profile>;
  signInWithGoogle: (credential:string)=>Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  authProvider: 'local' | 'google' | 'local_google';
  isActive: boolean;
  profileImage?: string;
  phoneNumber?: string;
  phoneNumberVerified?: boolean;
  city?: string;
  learningGoal?: string;
  profileSetupSkippedAt?: string | null;
  marketingEmailConsent?: boolean;
};
function profileFromUser(u: AuthUser):Profile {
  return {
    id:u.id,name:u.name,role:u.role,auth_provider:u.authProvider,is_active:u.isActive,
    created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    phone_number:u.phoneNumber || "",phone_number_verified:u.phoneNumberVerified === true,
    city:u.city || "",learning_goal:u.learningGoal || "",
    profile_setup_skipped_at:u.profileSetupSkippedAt || null,
    marketing_email_consent:u.marketingEmailConsent === true
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,setSession]=useState<AppSession|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);

  const applyUser = useCallback((u: AuthUser) => {
    const s:AppSession={user:{id:u.id,email:u.email,name:u.name,role:u.role,authProvider:u.authProvider,profileImage:u.profileImage,phoneNumber:u.phoneNumber}};
    setSession(s);
    setProfile(profileFromUser(u));
  }, []);

  const hydrate = useCallback(async () => {
    const token=getToken();
    if(!token){setLoading(false);return;}
    try {
      const data=await apiFetch('/api/auth/me');
      applyUser(data.user);
    } catch {
      try { await logoutBrowserPush(); } catch { /* Push cleanup is best-effort when the session is invalid. */ }
      clearAuth(); setSession(null); setProfile(null);
    } finally { setLoading(false); }
  }, [applyUser]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    const handleExpiredSession = () => {
      setSession(null);
      setProfile(null);
      void logoutBrowserPush().catch(() => {});
    };
    window.addEventListener('bfs:session-expired', handleExpiredSession);
    return () => window.removeEventListener('bfs:session-expired', handleExpiredSession);
  }, []);

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

  const signUp: AuthContextValue["signUp"] = async(name:string,email:string,password:string,consent:RegistrationConsent)=>{
    const data=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password,...consent})});
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
    try { await logoutBrowserPush(); } catch { /* Push cleanup must not prevent sign-out. */ }
    try { if (getToken()) await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* Clear local credentials even when the server is unavailable. */ }
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
