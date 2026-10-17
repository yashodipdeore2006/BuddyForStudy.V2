import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Lock, Loader2, Check, AlertCircle, Bell, Smartphone, Clock3 } from "lucide-react";
import { disableBrowserPush, enableBrowserPush, sendTestBrowserPushNotification } from "@/lib/pushNotifications";

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
  timezone: string;
  reminderHour: number;
  quietHoursStart: number;
  quietHoursEnd: number;
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
  timezone: "Asia/Kolkata",
  reminderHour: 18,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

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
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {description && <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export default function Settings() {
  const { profile, session } = useAuth();
  const canChangePassword = profile?.auth_provider === "local" || profile?.auth_provider === "local_google";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [pushAvailable, setPushAvailable] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushTestMessage, setPushTestMessage] = useState("");

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
      const data = await apiFetch("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(notifPrefs),
      });
      setNotifPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.preferences || {}) });
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
    setPushTestMessage("");
    try {
      if (enabled) {
        if (!pushAvailable) throw new Error("Web Push is not configured. Add WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT to server/.env.");
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
      setPushAvailable(Boolean(data.pushAvailable));
      setNotifSuccess(true);
    } catch (error) {
      setNotifError(error instanceof Error ? error.message : "Unable to update push notifications.");
    } finally {
      setSavingPush(false);
    }
  };

  const handlePushTest = async () => {
    setTestingPush(true);
    setNotifError("");
    setPushTestMessage("");
    try {
      const result = await sendTestBrowserPushNotification();
      setPushTestMessage(`Test push submitted to ${result.sent} device(s).${result.failed ? ` ${result.failed} device(s) failed.` : ""} Check your OS notification panel.`);
    } catch (error) {
      setNotifError(error instanceof Error ? error.message : "Unable to send a test push notification.");
    } finally {
      setTestingPush(false);
    }
  };

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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Settings" subtitle="Manage your account and notification preferences." />

      {canChangePassword ? (
        <form onSubmit={handlePasswordChange} className="mt-6 card p-6">
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
        <div className="mt-6 card p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Password</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Your account uses Google Sign-In, so your password is managed by Google. There is no BuddyForStudy password to change.
          </p>
        </div>
      )}

      <section className="mt-6 card p-6">
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">Reminder time
                    <select className="input-field mt-1" value={notifPrefs.reminderHour} onChange={(event) => updatePreference("reminderHour", Number(event.target.value))} disabled={!notifPrefs.learningRemindersEnabled}>
                      {Array.from({ length: 24 }, (_item, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">Time zone
                    <select className="input-field mt-1" value={notifPrefs.timezone} onChange={(event) => updatePreference("timezone", event.target.value)} disabled={!notifPrefs.learningRemindersEnabled}>
                      <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">US Eastern</option>
                      <option value="Europe/London">United Kingdom</option>
                    </select>
                  </label>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">Quiet hours start
                    <select className="input-field mt-1" value={notifPrefs.quietHoursStart} onChange={(event) => updatePreference("quietHoursStart", Number(event.target.value))} disabled={!notifPrefs.learningRemindersEnabled}>
                      {Array.from({ length: 24 }, (_item, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">Quiet hours end
                    <select className="input-field mt-1" value={notifPrefs.quietHoursEnd} onChange={(event) => updatePreference("quietHoursEnd", Number(event.target.value))} disabled={!notifPrefs.learningRemindersEnabled}>
                      {Array.from({ length: 24 }, (_item, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                </div>
                <p className="text-xs leading-5 text-slate-500">Reminders are sent only at your chosen local time and never during quiet hours (default: 22:00–08:00).</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900">Browser and PWA push</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Enable browser push using the standard Web Push API. Notifications can reach supported browsers and installed web apps when the browser is closed. Native Android/iOS apps require a separate native push integration.</p>
                  {!pushAvailable && <p className="mt-2 text-xs text-amber-700">Web Push is not configured. Set WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT in server/.env.</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">{notifPrefs.pushEnabled ? "Push notifications are enabled for this account." : "Push notifications are currently off."}</p>
                <button type="button" disabled={savingPush || (!notifPrefs.pushEnabled && !pushAvailable) onClick={() => void handlePushToggle(!notifPrefs.pushEnabled)} className={notifPrefs.pushEnabled ? "btn-secondary" : "btn-primary"}>
                  {savingPush ? <><Loader2 className="h-4 w-4 animate-spin" />Updating...</> : notifPrefs.pushEnabled ? "Disable push" : "Enable push"}
                </button>
              </div>
              {pushTestMessage && <p role="status" className="mt-3 text-sm text-green-700">{pushTestMessage}</p>}
              {notifPrefs.pushEnabled && <div className="mt-3"><button type="button" disabled={testingPush} onClick={() => void handlePushTest()} className="btn-secondary">{testingPush ? <><Loader2 className="h-4 w-4 animate-spin" />Sending test...</> : "Send test push"}</button></div>}
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
    </div>
  );
}
