import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { enableBrowserPush, hasBrowserPushSubscription } from "@/lib/pushNotifications";

const DISMISS_KEY_PREFIX = "bfs-push-prompt-dismissed:";
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type PushPreferences = Record<string, unknown> & {
  pushEnabled?: boolean;
};

function hasCookieChoice(): boolean {
  try {
    const raw = localStorage.getItem("bfs-cookie-consent-v1");
    if (!raw) return false;
    const choice = JSON.parse(raw) as { version?: unknown; preferences?: unknown };
    return choice.version === "cookie-choice-v1" && Boolean(choice.preferences);
  } catch {
    return false;
  }
}

function wasRecentlyDismissed(userId: string): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY_PREFIX + userId));
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < REMIND_AFTER_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(userId: string): void {
  try {
    localStorage.setItem(DISMISS_KEY_PREFIX + userId, String(Date.now()));
  } catch {
    // The prompt can still be dismissed for this render if browser storage is unavailable.
  }
}

function browserCanOfferPush(): boolean {
  return typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
}

export default function PushNotificationPrompt() {
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();
  const userId = session?.user.id;
  const isAdmin = session?.user.role === "admin";
  const excludedRoute = ["/login", "/register", "/verify-email", "/verify-login", "/forgot-password", "/accept-admin-invitation"].includes(location.pathname) ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/legal");

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState<PushPreferences>({});

  useEffect(() => {
    if (authLoading || !userId || isAdmin || excludedRoute) {
      setVisible(false);
      return;
    }

    let active = true;
    let displayTimer: number | undefined;
    let checkVersion = 0;

    const checkPromptEligibility = async () => {
      const thisCheck = ++checkVersion;
      if (!hasCookieChoice() || !browserCanOfferPush() || Notification.permission === "denied") {
        setVisible(false);
        return;
      }
      if (wasRecentlyDismissed(userId)) {
        setVisible(false);
        return;
      }

      try {
        const [notificationData, consentData, subscribed] = await Promise.all([
          apiFetch("/api/notifications/preferences"),
          apiFetch("/api/consent/status"),
          hasBrowserPushSubscription(),
        ]);
        if (!active || thisCheck !== checkVersion) return;

        const status = consentData?.status;
        if (
          notificationData?.pushAvailable !== true ||
          !status ||
          status.requiresLegalAcceptance === true ||
          status.requiresProfileCompletion === true
        ) {
          setVisible(false);
          return;
        }

        const currentPreferences = (notificationData.preferences || {}) as PushPreferences;
        setPreferences(currentPreferences);
        if (currentPreferences.pushEnabled === true && subscribed) {
          setVisible(false);
          return;
        }

        if (displayTimer !== undefined) window.clearTimeout(displayTimer);
        displayTimer = window.setTimeout(() => {
          if (active) setVisible(true);
        }, 850);
      } catch {
        // A transient API or browser error must not block normal app usage.
        setVisible(false);
      }
    };

    void checkPromptEligibility();
    const recheck = () => void checkPromptEligibility();
    window.addEventListener("bfs:cookie-consent-updated", recheck);
    window.addEventListener("bfs:account-consent-settled", recheck);

    return () => {
      active = false;
      checkVersion += 1;
      if (displayTimer !== undefined) window.clearTimeout(displayTimer);
      window.removeEventListener("bfs:cookie-consent-updated", recheck);
      window.removeEventListener("bfs:account-consent-settled", recheck);
    };
  }, [authLoading, userId, isAdmin, excludedRoute, location.pathname]);

  const dismiss = useCallback(() => {
    if (userId) rememberDismissal(userId);
    setError("");
    setVisible(false);
  }, [userId]);

  const handleEnable = useCallback(async () => {
    if (busy || !userId) return;
    setBusy(true);
    setError("");
    try {
      // The native browser permission prompt is requested only from this click.
      await enableBrowserPush();
      const nextPreferences = { ...preferences, pushEnabled: true };
      const saved = await apiFetch("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(nextPreferences),
      });
      setPreferences({ ...nextPreferences, ...(saved.preferences || {}) });
      setVisible(false);
    } catch (enableError) {
      const permissionIsDenied = "Notification" in window && Notification.permission === "denied";
      setError(permissionIsDenied
        ? "Notifications are blocked by your browser. Enable them in this site's browser settings, then try again."
        : enableError instanceof Error
          ? enableError.message
          : "Notifications could not be enabled right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, userId, preferences]);

  if (!visible || !userId || isAdmin) return null;

  return (
    <aside
      aria-labelledby="push-notification-prompt-title"
      className="fixed inset-x-3 bottom-3 z-[150] mx-auto w-auto max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-950/20 sm:inset-x-auto sm:bottom-5 sm:right-5"
      role="region"
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
          <BellRing size={23} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Stay on track</p>
          <h2 id="push-notification-prompt-title" className="mt-1 text-lg font-extrabold text-slate-950">
            Keep your learning moving
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Get useful course updates and learning reminders, even when BuddyForStudy isn’t open.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notification prompt"
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 sm:mx-5" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <button type="button" onClick={dismiss} disabled={busy} className="rounded-full px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60">
          Not now
        </button>
        <button
          type="button"
          onClick={() => void handleEnable()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1B41] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#12132f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B5CF6] disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Enabling…</> : "Enable notifications"}
        </button>
      </div>
      <p className="px-5 pb-3 text-center text-[11px] leading-4 text-slate-500">
        Optional — choose Enable to open your browser’s permission prompt. You can change this anytime in Settings.
      </p>
    </aside>
  );
}
