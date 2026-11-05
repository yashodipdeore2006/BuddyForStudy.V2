import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { enableBrowserPush, hasBrowserPushSubscription } from "@/lib/pushNotifications";

const DISMISS_KEY_PREFIX = "bfs-notification-prompt-dismissed:";

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
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(userId: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + userId, "1");
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
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [blockedPromptDismissed, setBlockedPromptDismissed] = useState(false);

  useEffect(() => {
    const refreshPermission = () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      const denied = Notification.permission === "denied";
      setPermissionBlocked(denied);
      if (!denied) {
        // The learner may have changed this site's permission in browser settings.
        setBlockedPromptDismissed(false);
        setError("");
      }
    };
    window.addEventListener("focus", refreshPermission);
    document.addEventListener("visibilitychange", refreshPermission);
    return () => {
      window.removeEventListener("focus", refreshPermission);
      document.removeEventListener("visibilitychange", refreshPermission);
    };
  }, []);

  useEffect(() => {
    if (authLoading || !userId || isAdmin || excludedRoute) {
      setVisible(false);
      return;
    }
    if (blockedPromptDismissed) {
      setVisible(false);
      return;
    }

    let active = true;
    let displayTimer: number | undefined;
    let checkVersion = 0;

    const checkPromptEligibility = async () => {
      const thisCheck = ++checkVersion;
      if (!hasCookieChoice() || !browserCanOfferPush()) {
        setVisible(false);
        return;
      }
      const isPermissionBlocked = Notification.permission === "denied";
      setPermissionBlocked(isPermissionBlocked);
      // A browser-level block cannot be overridden by requestPermission(). Keep
      // showing an in-app recovery prompt on a fresh app entry instead.
      if (!isPermissionBlocked && wasRecentlyDismissed(userId)) {
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
        const accountChannels = [
          "emailCourseUpdates", "inAppCourseUpdates", "emailProjectUpdates", "inAppProjectUpdates",
          "emailAnnouncements", "inAppAnnouncements", "emailLearningReminders", "inAppLearningReminders",
          "learningRemindersEnabled",
        ];
        const allChannelsEnabled = accountChannels.every((key) => currentPreferences[key] === true);
        const pushReady = currentPreferences.pushEnabled === true && subscribed;
        if (!isPermissionBlocked && allChannelsEnabled && pushReady) {
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
  }, [authLoading, userId, isAdmin, excludedRoute, location.pathname, blockedPromptDismissed]);

  const dismiss = useCallback(() => {
    if (userId) {
      if ("Notification" in window && Notification.permission === "denied") {
        // Dismiss for this mounted app session only. On the next app entry,
        // explain how to unblock notifications again.
        setBlockedPromptDismissed(true);
      } else {
        rememberDismissal(userId);
      }
    }
    setError("");
    setVisible(false);
  }, [userId]);

  const recheckPermission = useCallback(() => {
    if (!("Notification" in window)) return;
    const stillBlocked = Notification.permission === "denied";
    setPermissionBlocked(stillBlocked);
    setError(stillBlocked
      ? "Notifications are still blocked. Change this site's permission in your browser settings, then check again."
      : "");
    if (!stillBlocked) {
      setBlockedPromptDismissed(false);
    }
  }, []);

  const handleEnable = useCallback(async () => {
    if (busy || !userId) return;
    if ("Notification" in window && Notification.permission === "denied") {
      setPermissionBlocked(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The native browser permission prompt is requested only from this click.
      await enableBrowserPush();
      const nextPreferences = {
        ...preferences,
        emailCourseUpdates: true,
        inAppCourseUpdates: true,
        emailProjectUpdates: true,
        inAppProjectUpdates: true,
        emailAnnouncements: true,
        inAppAnnouncements: true,
        emailLearningReminders: true,
        inAppLearningReminders: true,
        learningRemindersEnabled: true,
        pushEnabled: true,
      };
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
            {permissionBlocked ? "Notifications are blocked in your browser" : "Enable all notifications"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {permissionBlocked
              ? "Your browser will not show the permission popup again until you change this site's permission."
              : "Turn on course updates, project updates, learning reminders, in-app alerts, and browser notifications. You can change any switch later in Settings."}
          </p>
          {permissionBlocked && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              <p className="font-bold">How to unblock notifications</p>
              <p className="mt-1">In Chrome or Edge, select the site controls icon beside the address bar, open Site settings, change Notifications from Block to Allow, then return here.</p>
              <p className="mt-1">Other browsers provide a similar Notifications permission in their site settings.</p>
            </div>
          )}
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
        {permissionBlocked ? (
          <button
            type="button"
            onClick={recheckPermission}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1B41] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#12132f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B5CF6]"
          >
            Check permission again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1B41] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#12132f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B5CF6] disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Enabling…</> : "Enable notifications"}
          </button>
        )}
      </div>
      <p className="px-5 pb-3 text-center text-[11px] leading-4 text-slate-500">
        {permissionBlocked
          ? "After allowing notifications in browser settings, return here and check again. This prompt will appear again the next time you open BuddyForStudy until access is restored."
          : "Your choice is saved to your account and stays the same after you sign in again. You can change individual switches anytime in Settings."}
      </p>
    </aside>
  );
}
