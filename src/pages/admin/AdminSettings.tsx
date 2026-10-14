import { useEffect, useState } from "react";
import { RefreshCcw, Save, Settings2, Trash2 } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

function formatValue(value: any) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function parseValue(value: string) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [advancedAI, setAdvancedAI] = useState({
    questionsPerHourVideo: 10,
    unknownDurationQuestions: 10,
    maxQuestionsPerLesson: 50,
    summaryEnabled: true,
    qaEnabled: true,
  });
  const [savingAdvancedAI, setSavingAdvancedAI] = useState(false);
  const [notificationConfig, setNotificationConfig] = useState({
    emailEnabled: true,
    inAppEnabled: true,
    pushEnabled: true,
    learningRemindersEnabled: true,
    inactiveDays: 3,
    subscriptionExpiryRemindersEnabled: true,
    subscriptionExpiryReminderDays: 3,
    emailRetryAttempts: 5,
    pushRetryAttempts: 3,
  });
  const [savingNotificationConfig, setSavingNotificationConfig] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/settings");
      setSettings(data.settings || []);
      const values = Object.fromEntries((data.settings || []).map((item: any) => [item.key, item.value]));
      setAdvancedAI({
        questionsPerHourVideo: Number(values.advanced_ai_questions_per_hour_video ?? 10),
        unknownDurationQuestions: Number(values.advanced_ai_questions_unknown_duration ?? 10),
        maxQuestionsPerLesson: Number(values.advanced_ai_max_questions_per_lesson ?? 50),
        summaryEnabled: values.advanced_ai_summary_enabled === undefined ? true : Boolean(values.advanced_ai_summary_enabled),
        qaEnabled: values.advanced_ai_qa_enabled === undefined ? true : Boolean(values.advanced_ai_qa_enabled),
      });
      setNotificationConfig({
        emailEnabled: values.notification_email_enabled === undefined ? true : Boolean(values.notification_email_enabled),
        inAppEnabled: values.notification_in_app_enabled === undefined ? true : Boolean(values.notification_in_app_enabled),
        pushEnabled: values.notification_push_enabled === undefined ? true : Boolean(values.notification_push_enabled),
        learningRemindersEnabled: values.learning_reminders_enabled === undefined ? true : Boolean(values.learning_reminders_enabled),
        inactiveDays: Math.max(1, Math.min(30, Number(values.learning_reminder_inactive_days ?? 3))),
        subscriptionExpiryRemindersEnabled: values.subscription_expiry_reminders_enabled === undefined ? true : Boolean(values.subscription_expiry_reminders_enabled),
        subscriptionExpiryReminderDays: Math.max(1, Math.min(14, Number(values.subscription_expiry_reminder_days ?? 3))),
        emailRetryAttempts: Math.max(1, Math.min(10, Number(values.notification_email_retry_attempts ?? 5))),
        pushRetryAttempts: Math.max(1, Math.min(6, Number(values.notification_push_retry_attempts ?? 3))),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveAdvancedAI() {
    setSavingAdvancedAI(true);
    setError("");
    setStatus("");
    try {
      const entries = [
        ["advanced_ai_questions_per_hour_video", Math.max(1, Math.min(100, Math.trunc(advancedAI.questionsPerHourVideo)))],
        ["advanced_ai_questions_unknown_duration", Math.max(1, Math.min(100, Math.trunc(advancedAI.unknownDurationQuestions)))],
        ["advanced_ai_max_questions_per_lesson", Math.max(1, Math.min(200, Math.trunc(advancedAI.maxQuestionsPerLesson)))],
        ["advanced_ai_summary_enabled", Boolean(advancedAI.summaryEnabled)],
        ["advanced_ai_qa_enabled", Boolean(advancedAI.qaEnabled)],
      ];
      await Promise.all(entries.map(([settingKey, settingValue]) =>
        adminFetch("/api/admin/settings", {
          method: "PUT",
          body: JSON.stringify({
            key: settingKey,
            value: settingValue,
            description: "Advanced AI assistant platform control",
            isPublic: false,
            reason: "Admin updated Advanced AI configuration",
          }),
        })
      ));
      setStatus("Advanced AI configuration saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save Advanced AI configuration");
    } finally {
      setSavingAdvancedAI(false);
    }
  }

  async function saveNotificationConfig() {
    setSavingNotificationConfig(true);
    setError("");
    setStatus("");
    try {
      const entries: Array<[string, boolean | number, string]> = [
        ["notification_email_enabled", Boolean(notificationConfig.emailEnabled), "Globally pause or enable email delivery, including transactional email."],
        ["notification_in_app_enabled", Boolean(notificationConfig.inAppEnabled), "Global in-app notification delivery control."],
        ["notification_push_enabled", Boolean(notificationConfig.pushEnabled), "Global OneSignal push delivery control."],
        ["learning_reminders_enabled", Boolean(notificationConfig.learningRemindersEnabled), "Enable or pause scheduled learning reminders."],
        ["learning_reminder_inactive_days", Math.max(1, Math.min(30, Math.trunc(notificationConfig.inactiveDays))), "Days without learning activity before a reminder is eligible."],
        ["subscription_expiry_reminders_enabled", Boolean(notificationConfig.subscriptionExpiryRemindersEnabled), "Enable or pause scheduled subscription expiry reminders."],
        ["subscription_expiry_reminder_days", Math.max(1, Math.min(14, Math.trunc(notificationConfig.subscriptionExpiryReminderDays))), "Lead time in days for subscription expiry reminder."],
        ["notification_email_retry_attempts", Math.max(1, Math.min(10, Math.trunc(notificationConfig.emailRetryAttempts))), "Maximum email delivery attempts per notification."],
        ["notification_push_retry_attempts", Math.max(1, Math.min(6, Math.trunc(notificationConfig.pushRetryAttempts))), "Maximum push delivery attempts per notification."]
      ];
      await Promise.all(entries.map(([settingKey, settingValue, description]) =>
        adminFetch("/api/admin/settings", {
          method: "PUT",
          body: JSON.stringify({
            key: settingKey,
            value: settingValue,
            description,
            isPublic: false,
            reason: "Admin updated notification delivery controls"
          })
        })
      ));
      setStatus("Notification delivery settings saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save notification settings");
    } finally {
      setSavingNotificationConfig(false);
    }
  }

  async function removeSetting(setting: any) {
    const confirmed = window.confirm(`Delete the "${setting.key}" setting? This action cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(setting._id);
    setError("");
    setStatus("");
    try {
      await adminFetch(`/api/admin/settings/${setting._id}`, { method: "DELETE" });
      if (key === setting.key) {
        setKey("");
        setValue("");
        setDescription("");
        setIsPublic(false);
        setReason("");
      }
      setStatus(`Setting "${setting.key}" deleted.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete setting");
    } finally {
      setDeletingId(null);
    }
  }
  function edit(setting: any) {
    setKey(setting.key);
    setValue(formatValue(setting.value));
    setDescription(setting.description || "");
    setIsPublic(Boolean(setting.isPublic));
    setStatus("");
  }

  async function save() {
    if (!key.trim()) {
      setError("Setting key is required.");
      return;
    }
    setSavingKey(key);
    setError("");
    setStatus("");
    try {
      await adminFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          key: key.trim(),
          value: parseValue(value),
          description: description.trim(),
          isPublic,
          reason: reason.trim(),
        }),
      });
      setStatus("Setting saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save setting");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Operations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Platform Settings</h1>
          <p className="mt-2 text-slate-500">Control operational configuration without a deployment, with typed values and an audit reason.</p>
        </div>
        <button type="button" aria-label="Refresh platform settings" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className="h-4 w-4" /> Refresh</button>
      </div>

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card mt-6 p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">AI control plane</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">Advanced AI assistant</h2>
          </div>
          <p className="text-xs text-slate-500">Questions are restricted to the current lesson. Repeated questions reuse the stored answer without another Gemini request.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs font-semibold text-slate-500">Questions / video hour
            <input className="input-field mt-2" type="number" min="1" max="100" value={advancedAI.questionsPerHourVideo} onChange={(e) => setAdvancedAI({ ...advancedAI, questionsPerHourVideo: Number(e.target.value) })} />
          </label>
          <label className="block text-xs font-semibold text-slate-500">Unknown-duration questions
            <input className="input-field mt-2" type="number" min="1" max="100" value={advancedAI.unknownDurationQuestions} onChange={(e) => setAdvancedAI({ ...advancedAI, unknownDurationQuestions: Number(e.target.value) })} />
          </label>
          <label className="block text-xs font-semibold text-slate-500">Hard max / lesson
            <input className="input-field mt-2" type="number" min="1" max="200" value={advancedAI.maxQuestionsPerLesson} onChange={(e) => setAdvancedAI({ ...advancedAI, maxQuestionsPerLesson: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-700"><input type="checkbox" checked={advancedAI.summaryEnabled} onChange={(e) => setAdvancedAI({ ...advancedAI, summaryEnabled: e.target.checked })} /> Lesson summaries</label>
          <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-700"><input type="checkbox" checked={advancedAI.qaEnabled} onChange={(e) => setAdvancedAI({ ...advancedAI, qaEnabled: e.target.checked })} /> Ask AI Q&A</label>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
          Example: with <strong>10 questions/hour</strong> and a <strong>2-hour video</strong>, a learner can ask up to <strong>20 unique questions</strong> for that lesson (subject to the hard maximum and their plan's monthly Advanced AI limit).
        </div>

        <button type="button" className="btn-primary mt-4" onClick={() => void saveAdvancedAI()} disabled={savingAdvancedAI}>
          <Save className="h-4 w-4" /> {savingAdvancedAI ? "Saving..." : "Save Advanced AI settings"}
        </button>
      </section>

      <section className="card mt-6 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Notification control plane</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950">Automated delivery & learning reminders</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Pause channels during an incident, set the inactivity threshold, and control retry attempts. User preferences still determine their optional channels.</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={notificationConfig.emailEnabled} onChange={(e) => setNotificationConfig({ ...notificationConfig, emailEnabled: e.target.checked })} /><span><span className="block text-sm font-semibold text-slate-900">Email delivery enabled</span><span className="mt-1 block text-xs leading-5 text-slate-500">Includes purchase and billing emails; use only as a temporary global kill switch.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={notificationConfig.inAppEnabled} onChange={(e) => setNotificationConfig({ ...notificationConfig, inAppEnabled: e.target.checked })} /><span><span className="block text-sm font-semibold text-slate-900">In-app notifications enabled</span><span className="mt-1 block text-xs leading-5 text-slate-500">Global control for optional in-app updates. Billing and security alerts remain visible.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={notificationConfig.pushEnabled} onChange={(e) => setNotificationConfig({ ...notificationConfig, pushEnabled: e.target.checked })} /><span><span className="block text-sm font-semibold text-slate-900">Push delivery enabled</span><span className="mt-1 block text-xs leading-5 text-slate-500">Requires OneSignal server configuration and user opt-in.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={notificationConfig.learningRemindersEnabled} onChange={(e) => setNotificationConfig({ ...notificationConfig, learningRemindersEnabled: e.target.checked })} /><span><span className="block text-sm font-semibold text-slate-900">Learning reminders enabled</span><span className="mt-1 block text-xs leading-5 text-slate-500">Global switch; each learner can also control personal reminder preferences.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={notificationConfig.subscriptionExpiryRemindersEnabled} onChange={(e) => setNotificationConfig({ ...notificationConfig, subscriptionExpiryRemindersEnabled: e.target.checked })} /><span><span className="block text-sm font-semibold text-slate-900">Subscription expiry reminders enabled</span><span className="mt-1 block text-xs leading-5 text-slate-500">Notify active or trialing subscriptions before the current billing period ends; scheduled cancellations are handled separately.</span></span></label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-500">Inactive days before reminder<input className="input-field mt-2" type="number" min="1" max="30" value={notificationConfig.inactiveDays} onChange={(e) => setNotificationConfig({ ...notificationConfig, inactiveDays: Number(e.target.value) })} /></label>
          <label className="block text-xs font-semibold text-slate-500">Subscription expiry lead days<input className="input-field mt-2" type="number" min="1" max="14" value={notificationConfig.subscriptionExpiryReminderDays} onChange={(e) => setNotificationConfig({ ...notificationConfig, subscriptionExpiryReminderDays: Number(e.target.value) })} disabled={!notificationConfig.subscriptionExpiryRemindersEnabled} /></label>
          <label className="block text-xs font-semibold text-slate-500">Email retry attempts<input className="input-field mt-2" type="number" min="1" max="10" value={notificationConfig.emailRetryAttempts} onChange={(e) => setNotificationConfig({ ...notificationConfig, emailRetryAttempts: Number(e.target.value) })} /></label>
          <label className="block text-xs font-semibold text-slate-500">Push retry attempts<input className="input-field mt-2" type="number" min="1" max="6" value={notificationConfig.pushRetryAttempts} onChange={(e) => setNotificationConfig({ ...notificationConfig, pushRetryAttempts: Number(e.target.value) })} /></label>
        </div>
        <button type="button" className="btn-primary mt-4" onClick={() => void saveNotificationConfig()} disabled={savingNotificationConfig}>
          <Save className="h-4 w-4" /> {savingNotificationConfig ? "Saving..." : "Save notification controls"}
        </button>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="card p-6">
          <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-blue-600" /><h2 className="font-bold">{settings.some((item) => item.key === key) ? "Edit setting" : "Create setting"}</h2></div>
          <label className="mt-5 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Key</span><input className="input-field mt-2" value={key} onChange={(e) => setKey(e.target.value)} placeholder="maintenance_mode" /></label>
          <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Value</span><textarea className="input-field mt-2 min-h-28 font-mono text-sm" value={value} onChange={(e) => setValue(e.target.value)} placeholder='false, 25, "text", or JSON object' /></label>
          <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Description</span><input className="input-field mt-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this setting control?" /></label>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public setting</label>
          <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Change reason (recommended)</span><input className="input-field mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this setting changing?" /></label>
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={savingKey !== null}><Save className="h-4 w-4" /> {savingKey ? "Saving..." : "Save setting"}</button>
            <button type="button" className="btn-secondary" onClick={() => { setKey(""); setValue(""); setDescription(""); setIsPublic(false); setStatus(""); }}>Clear</button>
          </div>
          {status && <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-green-600">{status}</p>}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Current settings</h2><p className="mt-1 text-xs text-slate-500">{settings.length} configuration entries</p></div>
          {loading ? <div role="status" aria-live="polite" aria-label="Loading platform settings" className="p-10 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /><span className="sr-only">Loading platform settings</span></div> : (
            <div className="divide-y divide-slate-100">
              {!settings.length && <p className="p-8 text-center text-sm text-slate-500">No platform settings yet.</p>}
              {settings.map((setting) => (
                <div key={setting._id} className="flex items-start gap-2 p-4 transition hover:bg-slate-50">
                  <button type="button" onClick={() => edit(setting)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-sm font-bold text-slate-800">{setting.key}</p>
                      <span className="badge bg-slate-100 text-slate-600">{setting.isPublic ? "Public" : "Private"}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{formatValue(setting.value)}</p>
                    <p className="mt-1 text-xs text-slate-400">{setting.description || "No description"} · click to edit</p>
                  </button>
                  <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => void removeSetting(setting)} disabled={deletingId === setting._id} aria-label={`Delete ${setting.key} setting`}>
                    <Trash2 className="h-4 w-4" /> {deletingId === setting._id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
