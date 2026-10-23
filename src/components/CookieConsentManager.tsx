import { useCallback, useEffect, useRef, useState } from "react";
import { Cookie, Settings2, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type CookiePreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};
type StoredChoice = {
  version: string;
  preferences: CookiePreferences;
  updatedAt: string;
};

const CONSENT_VERSION = "cookie-choice-v1";
const STORAGE_KEY = "bfs-cookie-consent-v1";
const DEFAULT_PREFERENCES: CookiePreferences = { necessary: true, analytics: false, marketing: false };

function normalize(value: unknown): CookiePreferences | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.analytics !== "boolean" || typeof item.marketing !== "boolean") return null;
  return { necessary: true, analytics: item.analytics, marketing: item.marketing };
}

function readChoice(): StoredChoice | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const preferences = normalize(parsed.preferences);
    if (parsed.version !== CONSENT_VERSION || !preferences) return null;
    return {
      version: CONSENT_VERSION,
      preferences,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return null;
  }
}

export default function CookieConsentManager() {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const syncedForUser = useRef<string | null>(null);

  useEffect(() => {
    const choice = readChoice();
    if (choice) {
      setPreferences(choice.preferences);
      setVisible(false);
    } else {
      setPreferences(DEFAULT_PREFERENCES);
      setVisible(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const openSettings = () => {
      const choice = readChoice();
      setPreferences(choice?.preferences || DEFAULT_PREFERENCES);
      setCustomizing(true);
      setVisible(true);
    };
    window.addEventListener("bfs:open-cookie-settings", openSettings);
    return () => window.removeEventListener("bfs:open-cookie-settings", openSettings);
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!ready || !userId || syncedForUser.current === userId) return;
    syncedForUser.current = userId;
    let active = true;

    void apiFetch<{ preferences?: unknown; version?: string; updatedAt?: string }>("/api/consent/cookies")
      .then(async (data) => {
        if (!active) return;
        const serverPreferences = normalize(data.preferences);
        if (serverPreferences) {
          const choice: StoredChoice = {
            version: CONSENT_VERSION,
            preferences: serverPreferences,
            updatedAt: data.updatedAt || new Date().toISOString()
          };
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch { /* The server copy remains saved. */ }
          setPreferences(serverPreferences);
          setVisible(false);
          return;
        }

        // A visitor may have chosen cookie settings before signing in. Preserve
        // that explicit choice on their account rather than prompting again.
        const localChoice = readChoice();
        if (localChoice) {
          await apiFetch("/api/consent/cookies", {
            method: "PUT",
            body: JSON.stringify({
              analytics: localChoice.preferences.analytics,
              marketing: localChoice.preferences.marketing
            })
          });
        }
      })
      .catch(() => {
        // The local choice remains effective on this browser if account sync is unavailable.
        if (active) setSyncError("Your choice is saved on this device; account sync is temporarily unavailable.");
      });

    return () => { active = false; };
  }, [ready, session?.user.id]);

  const saveChoice = useCallback(async (next: CookiePreferences) => {
    const choice: StoredChoice = {
      version: CONSENT_VERSION,
      preferences: { necessary: true, analytics: next.analytics === true, marketing: next.marketing === true },
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
      setSyncError("");
    } catch {
      setSyncError("Browser storage is unavailable. Your choice may not persist after this visit.");
    }
    setStoredChoice(choice);
    setPreferences(choice.preferences);
    setVisible(false);
    setCustomizing(false);

    if (session?.user.id) {
      try {
        await apiFetch("/api/consent/cookies", {
          method: "PUT",
          body: JSON.stringify({
            analytics: choice.preferences.analytics,
            marketing: choice.preferences.marketing
          })
        });
        setSyncError("");
      } catch {
        setSyncError("Your choice is saved on this device; account sync is temporarily unavailable.");
      }
    }
  }, [session?.user.id]);

  if (!ready) return null;

  return (
    <>
      {!visible && syncError && (
        <div role="status" className="fixed bottom-3 left-3 z-[160] max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-lg">
          <div className="flex items-start gap-2">
            <span className="flex-1">{syncError}</span>
            <button type="button" aria-label="Dismiss consent sync message" onClick={() => setSyncError("")}><X size={14} /></button>
          </div>
        </div>
      )}

      {visible && (
        <div className="fixed inset-x-3 bottom-3 z-[160] mx-auto max-h-[78vh] w-auto max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:inset-x-6 sm:bottom-5">
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Cookie size={21} /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold">Your privacy choices</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">BuddyForStudy uses essential storage to keep sign-in, security, and your preferences working. Optional analytics and marketing categories stay off unless you choose them. You can change this decision later in Cookie settings.</p>
            </div>
            <button type="button" aria-label="Reject optional cookies and close" onClick={() => void saveChoice({ ...DEFAULT_PREFERENCES, analytics: false, marketing: false })} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>

          {customizing && (
            <div className="space-y-3 border-t border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-3.5">
                <div><p className="text-sm font-bold">Essential storage</p><p className="mt-1 text-xs leading-5 text-slate-500">Required for authentication, security, and remembering these choices. Always active.</p></div>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">Always on</span>
              </div>
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-3.5">
                <span><span className="block text-sm font-bold">Analytics</span><span className="mt-1 block text-xs leading-5 text-slate-500">Allow optional measurement of how the platform is used to help improve learning experiences.</span></span>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-violet-600" checked={preferences.analytics} onChange={(event) => setPreferences((value) => ({ ...value, analytics: event.target.checked }))} />
              </label>
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-3.5">
                <span><span className="block text-sm font-bold">Marketing</span><span className="mt-1 block text-xs leading-5 text-slate-500">Allow optional marketing or advertising storage if those tools are enabled on the platform.</span></span>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-violet-600" checked={preferences.marketing} onChange={(event) => setPreferences((value) => ({ ...value, marketing: event.target.checked }))} />
              </label>
              <p className="text-xs leading-5 text-slate-500">Selecting a category records your preference; any optional third-party tool must separately respect it before loading. Essential storage cannot be disabled because the account would not work safely.</p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:flex-wrap sm:justify-end sm:p-5">
            <button type="button" onClick={() => void saveChoice({ ...DEFAULT_PREFERENCES, analytics: false, marketing: false })} className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Reject optional</button>
            {!customizing && <button type="button" onClick={() => setCustomizing(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"><Settings2 size={16} /> Cookie settings</button>}
            {customizing && <button type="button" onClick={() => void saveChoice(preferences)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Save my choices</button>}
            <button type="button" onClick={() => void saveChoice({ ...DEFAULT_PREFERENCES, analytics: true, marketing: true })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800"><ShieldCheck size={16} /> Accept all</button>
          </div>
        </div>
      )}
    </>
  );
}
