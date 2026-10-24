import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Target, Activity } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Lock, Loader2, Check, AlertCircle, Bell, Smartphone, Clock3, Sun, Moon, CreditCard, UserRound, ShieldCheck, ArrowUpRight, Pencil, X } from "lucide-react";
import { disableBrowserPush, enableBrowserPush, hasBrowserPushSubscription } from "@/lib/pushNotifications";
import { routes } from "@/lib/routes";

type NotificationPreferences = {
  emailCourseUpdates: boolean;
  inAppCourseUpdates: boolean;
  emailProjectUpdates: boolean;
  inAppProjectUpdates: boolean;
  emailAnnouncements: boolean;
  inAppAnnouncements: boolean;
  emailLearningReminders: boolean;
  inAppLearningReminders: boolean;
  learningRemindersEnabled: boolean;
  pushEnabled: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailCourseUpdates: true,
  inAppCourseUpdates: true,
  emailProjectUpdates: true,
  inAppProjectUpdates: true,
  emailAnnouncements: false,
  inAppAnnouncements: true,
  emailLearningReminders: true,
  inAppLearningReminders: true,
  learningRemindersEnabled: true,
  pushEnabled: false,
};

type BrowserPushStatus = "checking" | "unsupported" | "insecure" | NotificationPermission;

function readBrowserPushStatus(): BrowserPushStatus {
  if (typeof window === "undefined") return "checking";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
}

function getBrowserPushStatusMessage(status: BrowserPushStatus, serverAvailable: boolean): string {
  if (!serverAvailable) return "Push delivery is currently unavailable because the platform has not configured its Web Push service.";
  if (status === "checking") return "Checking this browser’s notification support…";
  if (status === "unsupported") return "This browser does not support web push notifications. You can still use in-app notifications.";
  if (status === "insecure") return "Browser push requires HTTPS. Localhost is supported for local development.";
  if (status === "denied") return "Notifications are blocked by this browser for this site. Change this site’s notification permission in your browser settings, then return here.";
  if (status === "granted") return "Browser permission is granted. BuddyForStudy only sends notifications while your account preference is enabled.";
  return "When you choose Enable push, your browser will show its own permission prompt. You can decline and continue using the platform.";
}

function PreferenceToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition ${disabled ? "opacity-50" : "hover:border-slate-300"}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${checked ? "bg-violet-600" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export default function Settings({ embedded = false }: { embedded?: boolean }) {
  const { profile, session, refreshProfile } = useAuth();
  const location = useLocation();
  const canChangePassword = profile?.auth_provider === "local" || profile?.auth_provider === "local_google";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [editingPersonalInfo, setEditingPersonalInfo] = useState(false);
  const [contactPhone, setContactPhone] = useState(profile?.phone_number || "");
  const [contactCity, setContactCity] = useState(profile?.city || "");
  const [contactLearningGoal, setContactLearningGoal] = useState(profile?.learning_goal || "");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState("");
  const [marketingEmailConsent, setMarketingEmailConsent] = useState(profile?.marketing_email_consent === true);
  const [loadingMarketingConsent, setLoadingMarketingConsent] = useState(true);
  const [savingMarketingConsent, setSavingMarketingConsent] = useState(false);
  const [marketingConsentMessage, setMarketingConsentMessage] = useState("");
  const [marketingConsentError, setMarketingConsentError] = useState("");

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [pushAvailable, setPushAvailable] = useState(false);
  const [browserPushPermission, setBrowserPushPermission] = useState<BrowserPushStatus>("checking");
  const [browserPushSubscribed, setBrowserPushSubscribed] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    try { const stored = localStorage.getItem("bfs-theme"); return stored === "dark" || stored === "system" ? stored : "light"; } catch { return "light"; }
  });
  const [dailyGoalLessons, setDailyGoalLessons] = useState(1);
  const [savedDailyGoalLessons, setSavedDailyGoalLessons] = useState(1);
  const [loadingLearningGoal, setLoadingLearningGoal] = useState(true);
  const [savingLearningGoal, setSavingLearningGoal] = useState(false);
  const [learningGoalError, setLearningGoalError] = useState("");
  const [learningGoalSuccess, setLearningGoalSuccess] = useState(false);
  const learningGoalDirty = dailyGoalLessons !== savedDailyGoalLessons;

  useEffect(() => {
    setContactPhone(profile?.phone_number || "");
    setContactCity(profile?.city || "");
    setContactLearningGoal(profile?.learning_goal || "");
    setMarketingEmailConsent(profile?.marketing_email_consent === true);
  }, [profile?.phone_number, profile?.city, profile?.learning_goal, profile?.marketing_email_consent]);

  useEffect(() => {
    let active = true;
    apiFetch("/api/consent/status")
      .then((data) => {
        if (active) setMarketingEmailConsent(data.status?.user?.marketingEmailConsent === true);
      })
      .catch(() => {
        if (active) setMarketingConsentError("Unable to load the email update preference.");
      })
      .finally(() => { if (active) setLoadingMarketingConsent(false); });
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (theme === "dark" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.dataset.theme = "dark";
      document.documentElement.style.colorScheme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = "light";
    }
    try { localStorage.setItem("bfs-theme", theme); } catch { /* Theme still applies for this session. */ }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onSystemThemeChange = () => {
      if (theme !== "system") return;
      if (media.matches) document.documentElement.dataset.theme = "dark";
      else delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = media.matches ? "dark" : "light";
    };
    media.addEventListener?.("change", onSystemThemeChange);
    return () => media.removeEventListener?.("change", onSystemThemeChange);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/achievements/me")
      .then((data) => {
        if (cancelled) return;
        const goal = Number(data.stats?.dailyGoalLessons ?? 1);
        const validGoal = Number.isInteger(goal) && goal >= 1 && goal <= 20 ? goal : 1;
        setDailyGoalLessons(validGoal);
        setSavedDailyGoalLessons(validGoal);
      })
      .catch((error) => { if (!cancelled) setLearningGoalError(error instanceof Error ? error.message : "Unable to load your learning goal."); })
      .finally(() => { if (!cancelled) setLoadingLearningGoal(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!learningGoalDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [learningGoalDirty]);

  useEffect(() => {
    if (!location.hash) return;
    const timer = window.setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const saveLearningGoal = async () => {
    if (!learningGoalDirty || savingLearningGoal) return;
    setSavingLearningGoal(true);
    setLearningGoalError("");
    setLearningGoalSuccess(false);
    try {
      const data = await apiFetch("/api/achievements/preferences", { method: "PUT", body: JSON.stringify({ dailyGoalLessons }) });
      const savedGoal = Number(data.stats?.dailyGoalLessons ?? dailyGoalLessons);
      setDailyGoalLessons(savedGoal);
      setSavedDailyGoalLessons(savedGoal);
      setLearningGoalSuccess(true);
    } catch (error) {
      setLearningGoalError(error instanceof Error ? error.message : "Unable to save your learning goal. Please retry.");
    } finally { setSavingLearningGoal(false); }
  };

  useEffect(() => {
    let active = true;
    const refreshBrowserPermission = () => {
      setBrowserPushPermission(readBrowserPushStatus());
      void hasBrowserPushSubscription()
        .then((subscribed) => { if (active) setBrowserPushSubscribed(subscribed); })
        .catch(() => { if (active) setBrowserPushSubscribed(false); });
    };
    refreshBrowserPermission();
    window.addEventListener("focus", refreshBrowserPermission);
    document.addEventListener("visibilitychange", refreshBrowserPermission);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshBrowserPermission);
      document.removeEventListener("visibilitychange", refreshBrowserPermission);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPreferences() {
      try {
        const data = await apiFetch("/api/notifications/preferences");
        if (cancelled) return;
        setNotifPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.preferences || {}) });
        setPushAvailable(Boolean(data.pushAvailable));
      } catch (error) {
        if (!cancelled) setNotifError(error instanceof Error ? error.message : "Unable to load notification preferences.");
      } finally {
        if (!cancelled) setLoadingNotifs(false);
      }
    }
    void loadPreferences();
    return () => { cancelled = true; };
  }, []);

  const saveContactDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingContact(true);
    setContactError("");
    setContactSuccess(false);
    try {
      await apiFetch("/api/consent/profile", {
        method: "PUT",
        body: JSON.stringify({
          phoneNumber: contactPhone,
          city: contactCity,
          learningGoal: contactLearningGoal
        })
      });
      await refreshProfile();
      setContactSuccess(true);
      setEditingPersonalInfo(false);
    } catch (error) {
      setContactError(error instanceof Error ? error.message : "Unable to save contact details.");
    } finally {
      setSavingContact(false);
    }
  };

  const saveMarketingConsent = async (enabled: boolean) => {
    setSavingMarketingConsent(true);
    setMarketingConsentError("");
    setMarketingConsentMessage("");
    try {
      const data = await apiFetch("/api/consent/marketing-email", {
        method: "PUT",
        body: JSON.stringify({ enabled })
      });
      setMarketingEmailConsent(data.marketingEmailConsent === true);
      setMarketingConsentMessage(enabled ? "Optional email updates enabled." : "Optional email updates disabled.");
    } catch (error) {
      setMarketingConsentError(error instanceof Error ? error.message : "Unable to update email preferences.");
    } finally {
      setSavingMarketingConsent(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setSavingPassword(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const updatePreference = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setNotifPrefs((current) => ({ ...current, [key]: value }));
    setNotifSuccess(false);
  };

  const handleNotifSave = async () => {
    setSavingNotifs(true);
    setNotifError("");
    setNotifSuccess(false);
    try {
      // Push changes are saved only from the explicit Enable/Disable action so
      // editing a reminder or email preference cannot create a push-consent event.
      const preferencesWithoutPush = Object.fromEntries(
        Object.entries(notifPrefs).filter(([key]) => key !== "pushEnabled")
      );
      const data = await apiFetch("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(preferencesWithoutPush),
      });
      setNotifPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.preferences || {}) });
      if (typeof data.preferences?.emailAnnouncements === "boolean") {
        setMarketingEmailConsent(data.preferences.emailAnnouncements);
      }
      setPushAvailable(Boolean(data.pushAvailable));
      setNotifSuccess(true);
    } catch (error) {
      setNotifError(error instanceof Error ? error.message : "Unable to save notification preferences.");
    } finally {
      setSavingNotifs(false);
    }
  };

  const handlePushToggle = async (enabled: boolean) => {
    setSavingPush(true);
    setNotifError("");
    setNotifSuccess(false);
    try {
      if (enabled) {
        if (!pushAvailable) throw new Error("Notifications are temporarily unavailable. Please try again later.");
        await enableBrowserPush();
      } else {
        await disableBrowserPush();
      }
      const next = { ...notifPrefs, pushEnabled: enabled };
      const data = await apiFetch("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setNotifPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.preferences || next) });
      if (typeof data.preferences?.emailAnnouncements === "boolean") {
        setMarketingEmailConsent(data.preferences.emailAnnouncements);
      }
      setPushAvailable(Boolean(data.pushAvailable));
      setNotifSuccess(true);
    } catch (error) {
      setNotifError(error instanceof Error ? error.message : "Unable to update push notifications.");
    } finally {
      setBrowserPushPermission(readBrowserPushStatus());
      void hasBrowserPushSubscription()
        .then(setBrowserPushSubscribed)
        .catch(() => setBrowserPushSubscribed(false));
      setSavingPush(false);
    }
  };

  const pushActiveOnThisBrowser = notifPrefs.pushEnabled && browserPushSubscribed;
  const browserPushCanRequest = pushAvailable &&
    browserPushPermission !== "checking" &&
    browserPushPermission !== "unsupported" &&
    browserPushPermission !== "insecure" &&
    browserPushPermission !== "denied";

  const notificationGroups = [
    {
      title: "Course updates",
      description: "New lessons and important changes to courses you are learning.",
      emailKey: "emailCourseUpdates" as const,
      inAppKey: "inAppCourseUpdates" as const,
    },
    {
      title: "Project updates",
      description: "Updates about project-based learning and learning activities.",
      emailKey: "emailProjectUpdates" as const,
      inAppKey: "inAppProjectUpdates" as const,
    },
    {
      title: "Platform announcements",
      description: "Optional product news and platform announcements. Email updates are off until you opt in.",
      emailKey: "emailAnnouncements" as const,
      inAppKey: "inAppAnnouncements" as const,
    },
  ];

  return (
    <div className={embedded ? "space-y-8" : "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"}>
      {!embedded && <PageHeader title="Settings" subtitle="Personalize BuddyForStudy, protect your account, and control how we contact you." />}
      {!embedded && <nav aria-label="Settings sections" className="sticky top-3 z-20 mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-lg shadow-slate-900/[0.04] backdrop-blur-xl">
        <a href="#account" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-transparent px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-violet-100 hover:bg-violet-50 hover:text-violet-800"><UserRound className="h-4 w-4" />Account</a>
        <a href="#security" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><ShieldCheck className="h-4 w-4" />Security</a>
        <a href="#appearance" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Sun className="h-4 w-4" />Appearance</a>
        <a href="#privacy-consent" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><ShieldCheck className="h-4 w-4" />Privacy & consent</a>
        <a href="#learning-goals" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Target className="h-4 w-4" />Learning goals</a>
        <a href="#notifications" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Bell className="h-4 w-4" />Notifications</a>
        <a href={routes.billing()} className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><CreditCard className="h-4 w-4" />Billing</a>
      </nav>}
      <section id="account" className={embedded ? "grid gap-5" : "mt-8 scroll-mt-28 grid gap-5"}>
        {!embedded && <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] transition hover:shadow-md sm:p-7">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><UserRound className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 className="font-extrabold text-slate-950">Personal information</h2><p className="mt-1 text-sm text-slate-500">Your account identity and personal learning details.</p></div></div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-500">Name</span><span className="font-semibold text-slate-900">{profile?.name || "—"}</span></div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-500">Email</span><span className="max-w-[65%] truncate font-semibold text-slate-900">{session?.user.email || "—"}</span></div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-500">Sign-in method</span><span className="font-semibold capitalize text-slate-900">{profile?.auth_provider?.replace("_", " + ") || "—"}</span></div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Contact & learning details</h3><p className="mt-1 text-xs text-slate-500">Optional details used to personalize your learning experience.</p></div>
              <button type="button" onClick={() => setEditingPersonalInfo((value) => !value)} aria-expanded={editingPersonalInfo} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-200 px-3.5 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50">{editingPersonalInfo ? <><X className="h-4 w-4" />Cancel</> : <><Pencil className="h-4 w-4" />Edit</>}</button>
            </div>
            {contactError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{contactError}</p>}
            {contactSuccess && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Personal information saved.</p>}
            {editingPersonalInfo ? (
              <form onSubmit={saveContactDetails} className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">Contact number <span className="font-normal text-slate-400">(optional)</span><input type="tel" inputMode="tel" autoComplete="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={32} className="input-field mt-1.5" placeholder="+91 98765 43210" /></label>
                <label className="block text-sm font-semibold text-slate-700">City <span className="font-normal text-slate-400">(optional)</span><input value={contactCity} onChange={(event) => setContactCity(event.target.value)} maxLength={100} autoComplete="address-level2" className="input-field mt-1.5" placeholder="Your city" /></label>
                <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Learning goal <span className="font-normal text-slate-400">(optional)</span><input value={contactLearningGoal} onChange={(event) => setContactLearningGoal(event.target.value)} maxLength={240} className="input-field mt-1.5" placeholder="e.g. Become a backend developer" /></label>
                <div className="sm:col-span-2 flex justify-end"><button type="submit" disabled={savingContact} className="btn-primary">{savingContact ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save personal information"}</button></div>
              </form>
            ) : (
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3.5"><dt className="text-xs font-medium text-slate-500">Contact number</dt><dd className="mt-1 break-words font-semibold text-slate-900">{contactPhone || "Not added"}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3.5"><dt className="text-xs font-medium text-slate-500">City</dt><dd className="mt-1 font-semibold text-slate-900">{contactCity || "Not added"}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3.5 sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Learning goal</dt><dd className="mt-1 font-semibold text-slate-900">{contactLearningGoal || "Not added"}</dd></div>
              </dl>
            )}
          </div>
        </div>}
        <div id="appearance" className="scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] transition hover:shadow-md sm:p-7"><div className="flex items-start gap-3"><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Sun className="h-5 w-5" /></div><div><h2 className="font-extrabold text-slate-950">Appearance</h2><p className="mt-1 text-sm text-slate-500">Choose how the interface looks on this browser.</p></div></div><div className="mt-5 grid grid-cols-3 gap-3">{(["light", "dark", "system"] as const).map((mode) => <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => setTheme(mode)} className={theme === mode ? "rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-left text-[var(--text)]" : "rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"}>{mode === "light" ? <Sun className="h-5 w-5" /> : mode === "dark" ? <Moon className="h-5 w-5" /> : <Activity className="h-5 w-5" />}<span className="mt-3 block text-sm font-bold">{mode === "system" ? "System" : mode[0].toUpperCase() + mode.slice(1)}</span></button>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">Theme preference is saved in this browser.</p></div>
      </section>

      <section id="learning-goals" className="mt-8 scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-8" aria-labelledby="learning-goal-title">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--accent-soft)] p-2.5 text-[var(--accent)]"><Target className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="learning-goal-title" className="font-extrabold text-slate-950">Daily learning goal</h2>
            <p className="mt-1 text-sm text-slate-500">Choose how many lessons you want to complete each day. Your goal is saved to your account.</p>
          </div>
        </div>
        {learningGoalError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{learningGoalError}</p>}
        {learningGoalSuccess && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">Daily learning goal saved.</p>}
        {loadingLearningGoal ? <p role="status" className="mt-4 text-sm text-slate-500">Loading your learning goal…</p> : (
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="daily-goal-lessons">Lessons per day
              <select id="daily-goal-lessons" className="input-field mt-1" value={dailyGoalLessons} onChange={(event) => { setDailyGoalLessons(Number(event.target.value)); setLearningGoalSuccess(false); }}>
                {Array.from({ length: 20 }, (_item, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? "lesson" : "lessons"}</option>)}
              </select>
            </label>
            <p className="text-sm text-slate-500">Current goal: <strong>{dailyGoalLessons} {dailyGoalLessons === 1 ? "lesson" : "lessons"}</strong> each day</p>
          </div>
        )}
        {learningGoalDirty && !loadingLearningGoal && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-sm text-[var(--text-2)]">You have unsaved changes to your daily goal.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={savingLearningGoal} onClick={() => { setDailyGoalLessons(savedDailyGoalLessons); setLearningGoalError(""); setLearningGoalSuccess(false); }}>Cancel</button>
              <button type="button" className="btn-primary" disabled={savingLearningGoal} onClick={() => void saveLearningGoal()}>{savingLearningGoal ? "Saving…" : "Save goal"}</button>
            </div>
          </div>
        )}
      </section>

      {canChangePassword ? (
        <form id="security" onSubmit={handlePasswordChange} className="mt-8 scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-8">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
          </div>

          {passwordError && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Password updated successfully!</span>
            </div>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Current Password</label>
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="input-field" placeholder="Enter current password" required autoComplete="current-password" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input-field" placeholder="At least 8 characters" required autoComplete="new-password" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input-field" placeholder="••••••••" required autoComplete="new-password" />
            </div>
          </div>

          <div className="mt-6">
            <button type="submit" disabled={savingPassword} className="btn-primary">
              {savingPassword ? <><Loader2 className="h-4 w-4 animate-spin" />Updating...</> : "Update Password"}
            </button>
          </div>
        </form>
      ) : (
        <div id="security" className="mt-8 scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-8">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Password</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Your account uses Google Sign-In, so your password is managed by Google. There is no BuddyForStudy password to change.
          </p>
        </div>
      )}

      <section id="notifications" className="mt-8 scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-8">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
            <p className="mt-1 text-sm text-slate-500">Choose what BuddyForStudy sends you and where. Essential purchase, payment, and security emails remain enabled.</p>
          </div>
        </div>

        {notifError && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{notifError}</div>}
        {notifSuccess && <div role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700"><Check className="h-4 w-4" />Preferences saved successfully.</div>}

        {loadingNotifs ? (
          <div role="status" className="mt-6 flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your preferences...</div>
        ) : (
          <div className="mt-6 space-y-7">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Updates</h3>
              <div className="mt-3 space-y-3">
                {notificationGroups.map((group) => (
                  <div key={group.title} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{group.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <PreferenceToggle checked={notifPrefs[group.emailKey]} onChange={(value) => updatePreference(group.emailKey, value)} label="Email" description="Send updates to your account email." />
                      <PreferenceToggle checked={notifPrefs[group.inAppKey]} onChange={(value) => updatePreference(group.inAppKey, value)} label="In-app" description="Show updates in the notification center." />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 text-slate-400" />
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Learning reminders</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">When enabled, BuddyForStudy checks for incomplete courses with no activity for at least three days and sends at most one reminder per day.</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <PreferenceToggle checked={notifPrefs.learningRemindersEnabled} onChange={(value) => updatePreference("learningRemindersEnabled", value)} label="Enable learning reminders" description="Turn scheduled reminders on or off." />
                <div className="grid gap-2 sm:grid-cols-2">
                  <PreferenceToggle checked={notifPrefs.emailLearningReminders} onChange={(value) => updatePreference("emailLearningReminders", value)} label="Email reminders" disabled={!notifPrefs.learningRemindersEnabled} />
                  <PreferenceToggle checked={notifPrefs.inAppLearningReminders} onChange={(value) => updatePreference("inAppLearningReminders", value)} label="In-app reminders" disabled={!notifPrefs.learningRemindersEnabled} />
                </div>
                <p className="text-xs leading-5 text-slate-500">Reminders follow the platform’s delivery schedule. You can turn email and in-app reminders on or off independently.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-             <p role="status" className="mt-3 rounded-xl border border-[var(--bfs-line-soft)] bg-[var(--bfs-surface-soft)] px-3.5 py-3 text-xs leading-5 text-[var(--bfs-muted)]">
                {getBrowserPushStatusMessage(browserPushPermission, pushAvailable)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <p className="max-w-lg text-xs leading-5 text-slate-500">Purchase confirmations, payment status, and account-security emails are transactional and cannot be disabled here.</p>
          <button type="button" onClick={() => void handleNotifSave()} disabled={savingNotifs || loadingNotifs} className="btn-primary">
            {savingNotifs ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save Preferences"}
          </button>
        </div>
      </section>

      <section id="contact-details" className="mt-8 scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-8">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Contact & learning details</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Add only the details you want BuddyForStudy to keep. Phone numbers are not verified and are not used for SMS or account recovery.</p>
          </div>
        </div>
        {contactError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{contactError}</p>}
        {contactSuccess && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Contact details saved.</p>}
        <form onSubmit={saveContactDetails} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">Contact number <span className="font-normal text-slate-400">(optional)</span>
            <input type="tel" inputMode="tel" autoComplete="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={32} className="input-field mt-1.5" placeholder="+91 98765 43210" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">City <span className="font-normal text-slate-400">(optional)</span>
            <input value={contactCity} onChange={(event) => setContactCity(event.target.value)} maxLength={100} autoComplete="address-level2" className="input-field mt-1.5" placeholder="Your city" />
          </label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Learning goal <span className="font-normal text-slate-400">(optional)</span>
            <input value={contactLearningGoal} onChange={(event) => setContactLearningGoal(event.target.value)} maxLength={240} className="input-field mt-1.5" placeholder="e.g. Become a backend developer" />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={savingContact} className="btn-primary">{savingContact ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save contact details"}</button>
          </div>
        </form>
      </section>

      <section id="privacy-consent" className="mt-8 scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/[0.025] sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Privacy & consent</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Essential storage stays on for sign-in and security. Optional cookie categories can be changed at any time; marketing email is a separate opt-in.</p>
          </div>
        </div>
        {marketingConsentError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{marketingConsentError}</p>}
        {marketingConsentMessage && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{marketingConsentMessage}</p>}
        <div className="mt-5">
          <PreferenceToggle
            checked={marketingEmailConsent}
            disabled={loadingMarketingConsent || savingMarketingConsent}
            onChange={(value) => void saveMarketingConsent(value)}
            label="Optional product emails"
            description="Send product news, learning tips, and occasional offers. This is not required for account or course notifications."
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => window.dispatchEvent(new Event("bfs:open-cookie-settings"))} className="btn-secondary">Cookie settings</button>
          <a href="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-violet-700 underline underline-offset-2">Privacy policy</a>
          <a href="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-violet-700 underline underline-offset-2">Terms of service</a>
        </div>
      </section>
    </div>
  );
}
