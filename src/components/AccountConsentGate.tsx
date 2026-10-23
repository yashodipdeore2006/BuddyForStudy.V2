import { useEffect, useState } from "react";
import { AlertCircle, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type ConsentStatus = {
  requiresLegalAcceptance?: boolean;
  requiresProfileCompletion?: boolean;
  policies?: {
    termsVersion?: string;
    privacyVersion?: string;
    termsPublished?: boolean;
    privacyPublished?: boolean;
    termsUrl?: string;
    privacyUrl?: string;
  };
  user?: {
    name?: string;
    email?: string;
    authProvider?: string;
    phoneNumber?: string;
    city?: string;
    learningGoal?: string;
    marketingEmailConsent?: boolean;
  };
};
type GateState = { userId: string; status: ConsentStatus; loading: boolean; error: string };

function isValidPhone(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+?[1-9]\d{7,14}$/.test(normalized);
}

export default function AccountConsentGate() {
  const { session, loading: authLoading, signOut, refreshProfile } = useAuth();
  const [gate, setGate] = useState<GateState | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [marketingEmailConsent, setMarketingEmailConsent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [city, setCity] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const userId = session?.user.id;
    if (authLoading) return;
    if (!userId) {
      setGate(null);
      return;
    }

    let active = true;
    setGate({ userId, status: {}, loading: true, error: "" });
    void apiFetch<{ status?: ConsentStatus }>("/api/consent/status")
      .then((data) => {
        if (!active) return;
        if (!data.status) throw new Error("The consent-status response was incomplete. Please retry.");
        const status = data.status;
        setGate({ userId, status, loading: false, error: "" });
        setMarketingEmailConsent(status.user?.marketingEmailConsent === true);
        setPhoneNumber(status.user?.phoneNumber || "");
        setCity(status.user?.city || "");
        setLearningGoal(status.user?.learningGoal || "");
        setTermsAccepted(false);
        setPrivacyAcknowledged(false);
      })
      .catch((error) => {
        if (active) setGate({
          userId, status: {}, loading: false,
          error: error instanceof Error ? error.message : "Unable to verify account consent status."
        });
      });
    return () => { active = false; };
  }, [session?.user.id, authLoading, retryKey]);

  const currentGate = gate && session && gate.userId === session.user.id ? gate : null;
  const status = currentGate?.status || null;
  const requiresLegal = status?.requiresLegalAcceptance === true;
  const requiresProfile = !requiresLegal && status?.requiresProfileCompletion === true;
  const loadingStatus = currentGate?.loading === true;
  const statusError = currentGate?.error || "";

  async function saveLegalAcceptance(event: React.FormEvent) {
    event.preventDefault();
    if (!termsAccepted || !privacyAcknowledged || saving) return;
    setSaving(true);
    setGate((current) => current ? { ...current, error: "" } : current);
    try {
      const data = await apiFetch<{ status?: ConsentStatus }>("/api/consent/accept", {
        method: "POST",
        body: JSON.stringify({ termsAccepted: true, privacyAcknowledged: true, marketingEmailConsent })
      });
      const nextStatus = data.status;
      if (!nextStatus) throw new Error("The consent response was incomplete. Please retry.");
      setGate((current) => current ? { ...current, status: nextStatus, error: "" } : current);
      window.dispatchEvent(new Event("bfs:account-consent-settled"));
      void refreshProfile().catch(() => {});
    } catch (error) {
      setGate((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : "Unable to save your legal acknowledgements."
      } : current);
    } finally {
      setSaving(false);
    }
  }

  async function saveGoogleProfile(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !isValidPhone(phoneNumber)) return;
    setSaving(true);
    setGate((current) => current ? { ...current, error: "" } : current);
    try {
      const data = await apiFetch<{ status?: ConsentStatus }>("/api/consent/profile/complete", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, city, learningGoal })
      });
      const nextStatus = data.status;
      if (!nextStatus) throw new Error("The profile response was incomplete. Please retry.");
      setGate((current) => current ? { ...current, status: nextStatus, error: "" } : current);
      window.dispatchEvent(new Event("bfs:account-consent-settled"));
      void refreshProfile().catch(() => {});
    } catch (error) {
      setGate((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : "Unable to save your profile details."
      } : current);
    } finally {
      setSaving(false);
    }
  }

  async function skipGoogleProfile() {
    if (saving) return;
    setSaving(true);
    setGate((current) => current ? { ...current, error: "" } : current);
    try {
      const data = await apiFetch<{ status?: ConsentStatus }>("/api/consent/profile/skip", { method: "POST", body: JSON.stringify({}) });
      const nextStatus = data.status;
      if (!nextStatus) throw new Error("The profile response was incomplete. Please retry.");
      setGate((current) => current ? { ...current, status: nextStatus, error: "" } : current);
      window.dispatchEvent(new Event("bfs:account-consent-settled"));
    } catch (error) {
      setGate((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : "Unable to skip profile setup."
      } : current);
    } finally {
      setSaving(false);
    }
  }

  if (!session || (!loadingStatus && !requiresLegal && !requiresProfile && !statusError)) return null;

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-consent-title"
        className="my-auto max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:p-7"
      >
        {loadingStatus ? (
          <div role="status" className="flex flex-col items-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-violet-700" />
            <p className="mt-4 text-sm font-semibold">Checking account privacy settings…</p>
          </div>
        ) : statusError ? (
          <>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><AlertCircle size={23} /></div>
            <h2 id="account-consent-title" className="mt-4 text-xl font-extrabold">Unable to verify your account setup</h2>
            <p role="alert" className="mt-2 text-sm leading-6 text-slate-600">{statusError}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={() => setRetryKey((value) => value + 1)}>Retry</button>
              <button type="button" className="btn-secondary" onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        ) : requiresLegal ? (
          <form onSubmit={saveLegalAcceptance}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ShieldCheck size={23} /></div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[.16em] text-violet-700">Account privacy</p>
            <h2 id="account-consent-title" className="mt-1 text-2xl font-extrabold tracking-tight">Review your agreements</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Before continuing, please review the current Terms of Service and Privacy Policy. We record the version you accepted so a later policy update can be presented clearly.</p>
            {!(status?.policies?.termsPublished && status?.policies?.privacyPublished) && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">The platform’s built-in policy version is being used for any policy not yet published by an administrator. Ask the platform administrator to publish reviewed legal documents before production launch.</p>
            )}

            <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-4">
              <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                <input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet-700" />
                <span>I agree to the <a href={status?.policies?.termsUrl || "/legal/terms-of-service"} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 underline underline-offset-2">Terms of Service</a> <span className="block text-xs text-slate-500">Version: {status?.policies?.termsVersion || "current"}</span></span>
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                <input type="checkbox" required checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet-700" />
                <span>I have read and acknowledge the <a href={status?.policies?.privacyUrl || "/legal/privacy-policy"} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 underline underline-offset-2">Privacy Policy</a> <span className="block text-xs text-slate-500">Version: {status?.policies?.privacyVersion || "current"}</span></span>
              </label>
              <label className="flex items-start gap-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
                <input type="checkbox" checked={marketingEmailConsent} onChange={(event) => setMarketingEmailConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet-700" />
                <span>Send me optional BuddyForStudy product news, learning tips, and offers by email. This is optional and can be withdrawn later.</span>
              </label>
            </div>

            {currentGate?.error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{currentGate.error}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => void signOut()} className="text-sm font-semibold text-slate-500 underline underline-offset-4">Sign out instead</button>
              <button type="submit" disabled={saving || !termsAccepted || !privacyAcknowledged} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Agree and continue"}</button>
            </div>
          </form>
        ) : requiresProfile ? (
          <form onSubmit={saveGoogleProfile}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><UserRound size={23} /></div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[.16em] text-violet-700">Optional profile setup</p>
            <h2 id="account-consent-title" className="mt-1 text-2xl font-extrabold tracking-tight">Add your contact details</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Google provided your verified email and basic profile details. Your phone number is not automatically imported from Google; enter it here yourself if you’d like to add it to BuddyForStudy.</p>
            <label className="mt-5 block text-sm font-semibold text-slate-700">Contact number
              <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" required maxLength={32} className="input-field mt-1.5" placeholder="+91 98765 43210" />
              <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Used only as contact information for your account at this time. It is not verified for SMS or account recovery.</span>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">City <span className="font-normal text-slate-400">(optional)</span>
              <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} autoComplete="address-level2" className="input-field mt-1.5" placeholder="Your city" />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">What are you learning? <span className="font-normal text-slate-400">(optional)</span>
              <input value={learningGoal} onChange={(event) => setLearningGoal(event.target.value)} maxLength={240} className="input-field mt-1.5" placeholder="e.g. Backend development, data analytics" />
            </label>
            {currentGate?.error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{currentGate.error}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => void skipGoogleProfile()} disabled={saving} className="min-h-10 text-sm font-semibold text-slate-500 underline underline-offset-4 disabled:opacity-50">Skip for now</button>
              <button type="submit" disabled={saving || !isValidPhone(phoneNumber)} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save details and continue"}</button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
