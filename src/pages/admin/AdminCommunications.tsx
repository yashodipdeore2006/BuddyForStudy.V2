import { useEffect, useMemo, useState } from "react";
import { Bell, Eye, Mail, Megaphone, Send } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminTabs } from "@/components/admin/AdminUI";

type Channel = "in_app" | "email" | "push";
type MessageTemplate = { _id: string; name: string; key: string; channel: "notification" | "email" | "announcement"; title: string; subject: string; body: string; link: string; messageType?: string; isActive: boolean };
type TemplateDraft = { name: string; key: string; channel: "notification" | "email" | "announcement"; title: string; subject: string; body: string; link: string; messageType: string; isActive: boolean };
type TemplatePreview = { channel: string; title: string; subject: string; body: string; placeholders: string[]; unknownPlaceholders: string[] };
type AnnouncementRecord = { _id: string; title: string; status: string; channel: Channel[]; scheduledAt?: string; timezone?: string; startedAt?: string; sentAt?: string; completedAt?: string; createdAt?: string; stats?: { total?: number; sent?: number; pending?: number; failed?: number; skipped?: number }; lastError?: string };
type TemplatePreview = { channel: string; title: string; subject: string; body: string; placeholders: string[]; unknownPlaceholders: string[] };
type AnnouncementRecord = { _id: string; title: string; status: string; channel: Channel[]; scheduledAt?: string; timezone?: string; startedAt?: string; sentAt?: string; completedAt?: string; createdAt?: string; stats?: { total?: number; sent?: number; pending?: number; failed?: number; skipped?: number }; lastError?: string };
type AudiencePlanOption = { id: string; name: string; price: number; currency: string; billingInterval: string; isActive: boolean; isPopular: boolean };
type AudienceCourseOption = { id: string; title: string; category: string; level: string; isPublished: boolean; pricingMode: string; price: number; featured: boolean };
const EMPTY_TEMPLATE: TemplateDraft = { name: "", key: "", channel: "notification", title: "", subject: "", body: "", link: "", messageType: "system", isActive: true };

export default function AdminCommunications() {
  const [tab, setTab] = useState<"notification" | "email" | "announcement">("notification");
  const [audience, setAudience] = useState("all");
  const [targetMode, setTargetMode] = useState<"audience" | "emails" | "filters">("audience");
  const [selectedEmails, setSelectedEmails] = useState("");
  const [audienceFilters, setAudienceFilters] = useState<Record<string, string>>({});
  const [segmentPreset, setSegmentPreset] = useState("custom");
  const [audiencePlans, setAudiencePlans] = useState<AudiencePlanOption[]>([]);
  const [audienceCourses, setAudienceCourses] = useState<AudienceCourseOption[]>([]);
  const [audienceOptionsError, setAudienceOptionsError] = useState("");
  const [audiencePreview, setAudiencePreview] = useState<{ recipientCount: number; truncated: boolean; previewToken: string; sample: Array<{ id: string; name: string; email: string }>; channelCounts?: Record<string, { consentEligible: number; willReach: number; activeSubscriptions?: number; platformEnabled?: boolean; providerConfigured?: boolean }> } | null>(null);
  const [previewingAudience, setPreviewingAudience] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [link, setLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["in_app"]);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [retryingDelivery, setRetryingDelivery] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateStatus, setTemplateStatus] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState(false);
  const [testSendingTemplate, setTestSendingTemplate] = useState(false);
  const [campaigns, setCampaigns] = useState<AnnouncementRecord[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [campaignNotice, setCampaignNotice] = useState("");
  const [campaignReports, setCampaignReports] = useState<Record<string, any>>({});
  const [campaignBusy, setCampaignBusy] = useState("");
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState(false);
  const [testSendingTemplate, setTestSendingTemplate] = useState(false);
  const [campaigns, setCampaigns] = useState<AnnouncementRecord[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [campaignNotice, setCampaignNotice] = useState("");
  const [campaignReports, setCampaignReports] = useState<Record<string, any>>({});
  const [campaignBusy, setCampaignBusy] = useState("");

  async function retryDelivery(notificationId: string, channel: "email" | "push") {
    const label = channel === "email" ? "email" : "push notification";
    if (!window.confirm(`Retry this ${label} delivery now?`)) return;
    setRetryingDelivery(`${notificationId}:${channel}`);
    setDeliveryError("");
    setDeliveryNotice("");
    try {
      const data = await adminFetch(`/api/admin/notification-deliveries/${notificationId}/retry`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
      setDeliveryNotice(data.message || `${label} retry finished.`);
      await loadDeliveryLogs();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : `Unable to retry ${label} delivery.`);
    } finally {
      setRetryingDelivery("");
    }
  }

  async function loadCampaigns() {
    setLoadingCampaigns(true); setCampaignError("");
    try { const data = await adminFetch("/api/admin/announcements?limit=50"); setCampaigns(Array.isArray(data.announcements) ? data.announcements : []); }
    catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to load announcement history."); }
    finally { setLoadingCampaigns(false); }
  }

  async function loadCampaignReport(announcementId: string) {
    setCampaignBusy(announcementId); setCampaignError("");
    try { const data = await adminFetch("/api/admin/announcements/" + announcementId + "/report"); setCampaignReports((current) => ({ ...current, [announcementId]: data })); }
    catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to load the announcement report."); }
    finally { setCampaignBusy(""); }
  }

  async function cancelCampaign(announcementId: string, titleText: string) {
    if (!window.confirm("Cancel scheduled announcement \"" + titleText + "\" before sending starts?")) return;
    const reason = window.prompt("Reason for cancelling this announcement (10–500 characters):") || "";
    if (reason.trim().length < 10 || reason.trim().length > 500) { setCampaignError("Cancellation reason must be between 10 and 500 characters."); return; }
    setCampaignBusy(announcementId); setCampaignError(""); setCampaignNotice("");
    try {
      const data = await adminFetch("/api/admin/announcements/" + announcementId + "/cancel", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setCampaignNotice(data.message || "Announcement cancelled."); await loadCampaigns();
    } catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to cancel this announcement."); }
    finally { setCampaignBusy(""); }
  }
  async function loadCampaigns() {
    setLoadingCampaigns(true); setCampaignError("");
    try { const data = await adminFetch("/api/admin/announcements?limit=50"); setCampaigns(Array.isArray(data.announcements) ? data.announcements : []); }
    catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to load announcement history."); }
    finally { setLoadingCampaigns(false); }
  }

  async function loadCampaignReport(announcementId: string) {
    setCampaignBusy(announcementId); setCampaignError("");
    try { const data = await adminFetch("/api/admin/announcements/" + announcementId + "/report"); setCampaignReports((current) => ({ ...current, [announcementId]: data })); }
    catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to load the announcement report."); }
    finally { setCampaignBusy(""); }
  }

  async function cancelCampaign(announcementId: string, titleText: string) {
    if (!window.confirm("Cancel scheduled announcement \"" + titleText + "\" before sending starts?")) return;
    const reason = window.prompt("Reason for cancelling this announcement (10–500 characters):") || "";
    if (reason.trim().length < 10 || reason.trim().length > 500) { setCampaignError("Cancellation reason must be between 10 and 500 characters."); return; }
    setCampaignBusy(announcementId); setCampaignError(""); setCampaignNotice("");
    try { const data = await adminFetch("/api/admin/announcements/" + announcementId + "/cancel", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }); setCampaignNotice(data.message || "Announcement cancelled."); await loadCampaigns(); }
    catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to cancel this announcement."); }
    finally { setCampaignBusy(""); }
  }

  async function loadDeliveryLogs() {
    setLoadingDeliveries(true);
    setDeliveryError("");
    try {
      const data = await adminFetch("/api/admin/notification-deliveries");
      setDeliveries(Array.isArray(data.deliveries) ? data.deliveries : []);
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Unable to load notification delivery logs.");
    } finally {
      setLoadingDeliveries(false);
    }
  }

  useEffect(() => {
    adminFetch("/api/admin/message-templates").then(data => setTemplates(Array.isArray(data.templates) ? data.templates : [])).catch(() => setTemplates([]));
    adminFetch("/api/admin/notifications/audience-options").then((data) => {
      setAudiencePlans(Array.isArray(data.plans) ? data.plans : []);
      setAudienceCourses(Array.isArray(data.courses) ? data.courses : []);
      setAudienceOptionsError("");
    }).catch((error) => setAudienceOptionsError(error instanceof Error ? error.message : "Unable to load plan and course filters."));
    void loadDeliveryLogs();
    void loadCampaigns();
  }, []);

  function editTemplate(template?: MessageTemplate) {
    setTemplateEditorOpen(true);
    setEditingTemplateId(template?._id || "");
    setTemplateDraft(template ? {
      name: template.name,
      key: template.key,
      channel: template.channel,
      title: template.title || "",
      subject: template.subject || "",
      body: template.body || "",
      link: template.link || "",
      messageType: template.messageType || "system",
      isActive: template.isActive !== false,
    } : { ...EMPTY_TEMPLATE });
    setTemplateStatus("");
    setTemplateError("");
  }

  async function previewTemplate() {
    setPreviewingTemplate(true); setTemplateError(""); setTemplateStatus("");
    try {
      const data = await adminFetch("/api/admin/message-templates/preview", { method: "POST", body: JSON.stringify({ template: templateDraft, sampleData: { userName: "Template Preview" } }) });
      setTemplatePreview(data.preview || null); if (data.warning) setTemplateError(data.warning);
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "Unable to preview this template."); setTemplatePreview(null); }
    finally { setPreviewingTemplate(false); }
  }

  async function testSendTemplate() {
    if (!editingTemplateId) { setTemplateError("Save the template first, then reopen it to send a test."); return; }
    const reason = window.prompt("Reason for sending a template test to your own administrator account (10–500 characters):") || "";
    if (reason.trim().length < 10 || reason.trim().length > 500) { setTemplateError("Test-send reason must be between 10 and 500 characters."); return; }
    if (!window.confirm("Send a test using this saved template to your own administrator account only?")) return;
    setTestSendingTemplate(true); setTemplateError(""); setTemplateStatus("");
    try {
      const data = await adminFetch("/api/admin/message-templates/" + editingTemplateId + "/test-send", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setTemplateStatus(data.message || "Test message sent to your administrator account.");
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "Unable to send this template test."); }
    finally { setTestSendingTemplate(false); }
  }
  async function previewTemplate() {
    setPreviewingTemplate(true); setTemplateError(""); setTemplateStatus("");
    try { const data = await adminFetch("/api/admin/message-templates/preview", { method: "POST", body: JSON.stringify({ template: templateDraft, sampleData: { userName: "Template Preview" } }) }); setTemplatePreview(data.preview || null); if (data.warning) setTemplateError(data.warning); }
    catch (error) { setTemplateError(error instanceof Error ? error.message : "Unable to preview this template."); setTemplatePreview(null); }
    finally { setPreviewingTemplate(false); }
  }

  async function testSendTemplate() {
    if (!editingTemplateId) { setTemplateError("Save the template first, then reopen it to send a test."); return; }
    const reason = window.prompt("Reason for sending a template test to your own administrator account (10–500 characters):") || "";
    if (reason.trim().length < 10 || reason.trim().length > 500) { setTemplateError("Test-send reason must be between 10 and 500 characters."); return; }
    if (!window.confirm("Send a test using this saved template to your own administrator account only?")) return;
    setTestSendingTemplate(true); setTemplateError(""); setTemplateStatus("");
    try { const data = await adminFetch("/api/admin/message-templates/" + editingTemplateId + "/test-send", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }); setTemplateStatus(data.message || "Test message sent to your administrator account."); }
    catch (error) { setTemplateError(error instanceof Error ? error.message : "Unable to send this template test."); }
    finally { setTestSendingTemplate(false); }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    setTemplateStatus("");
    setTemplateError("");
    try {
      const endpoint = editingTemplateId
        ? `/api/admin/message-templates/${editingTemplateId}`
        : "/api/admin/message-templates";
      await adminFetch(endpoint, {
        method: editingTemplateId ? "PUT" : "POST",
        body: JSON.stringify(templateDraft),
      });
      const data = await adminFetch("/api/admin/message-templates");
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setTemplateStatus("Template saved. Automatic event notifications will use it when its key matches a built-in event.");
      setTemplatePreview(null);
      setEditingTemplateId("");
      setTemplateDraft({ ...EMPTY_TEMPLATE });
      setTemplateEditorOpen(false);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "Unable to save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  const canSend = useMemo(() => {
    if (tab === "email") return Boolean(subject.trim() && html.trim());
    if (tab === "announcement") return Boolean(title.trim() && message.trim() && channels.length);
    return Boolean(title.trim() && message.trim());
  }, [tab, subject, html, title, message, channels]);

  function applyAudiencePreset(preset: string) {
    const presets: Record<string, Record<string, string>> = {
      premium: { subscriptionStatus: "active", planSegment: "premium" },
      popular_plan: { subscriptionStatus: "active", planSegment: "popular" },
      high_spenders: { totalSpendMin: "5000" },
      multi_course_learners: { courseCountMin: "4" },
      premium_high_value: { subscriptionStatus: "active", planSegment: "premium", totalSpendMin: "5000", courseCountMin: "4" },
      popular_course_learners: { courseSegment: "popular" },
      free_course_learners: { courseSegment: "free" },
      inactive_learners: { inactiveDays: "14" },
      expiring_subscribers: { subscriptionStatus: "active", expiresWithinDays: "7" },
      at_risk_subscribers: { subscriptionStatus: "past_due" },
      unverified_accounts: { emailVerified: "false" },
    };
    setSegmentPreset(preset);
    setTargetMode("filters");
    setAudience("all");
    setAudienceFilters({ ...(presets[preset] || {}) });
    setAudiencePreview(null);
    setStatus("");
  }

  function audiencePayload() {
    if (targetMode === "emails") {
      return { emails: selectedEmails.split(/[;,\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean) };
    }
    if (targetMode === "filters") {
      const filters: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(audienceFilters)) {
        if (!value.trim()) continue;
        if (key === "emailVerified") filters[key] = value === "true";
        else if (["expiresWithinDays", "progressMin", "progressMax", "inactiveDays", "totalSpendMin", "courseCountMin"].includes(key)) filters[key] = Number(value);
        else filters[key] = value;
      }
      return { audience, filters };
    }
    return { audience };
  }

  function targetingError() {
    if (targetMode === "emails" && !selectedEmails.split(/[;,\n]/).some((email) => email.trim())) {
      return "Enter at least one registered email address.";
    }
    if (targetMode === "filters" && !Object.values(audienceFilters).some((value) => value.trim())) {
      return "Add at least one audience filter before previewing or sending.";
    }
    return "";
  }

  async function previewAudience() {
    const targetingProblem = targetingError();
    if (targetingProblem) { setStatus(targetingProblem); return; }
    setPreviewingAudience(true);
    setAudiencePreview(null);
    setStatus("");
    try {
      const data = await adminFetch("/api/admin/notifications/audience-preview", {
        method: "POST",
        body: JSON.stringify(audiencePayload()),
      });
      setAudiencePreview({
        recipientCount: Number(data.recipientCount || 0),
        truncated: Boolean(data.truncated),
        previewToken: String(data.previewToken || ""),
        sample: Array.isArray(data.sample) ? data.sample : [],
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to preview this audience.");
    } finally {
      setPreviewingAudience(false);
    }
  }

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    );
  }

  async function send() {
    const targetingProblem = targetingError();
    if (targetingProblem) { setStatus(targetingProblem); return; }
    if (!audiencePreview) {
      setStatus("Preview the recipients and confirm the audience before sending.");
      return;
    }
    if (audiencePreview.truncated) {
      setStatus("This audience exceeds the 5,000-recipient limit. Narrow the filters and preview again.");
      return;
    }
    if (!canSend) {
      setStatus("Complete the required fields first.");
      return;
    }

    if (!window.confirm(`Send this communication to ${audiencePreview.recipientCount.toLocaleString()} recipient(s)?`)) return;

    setSending(true);
    setStatus("Sending...");
    try {
      const path =
        tab === "notification"
          ? "/api/admin/notifications/send"
          : tab === "email"
            ? "/api/admin/emails/send"
            : "/api/admin/announcements/send";

      const body =
        tab === "email"
          ? { ...audiencePayload(), subject, html, previewToken: audiencePreview.previewToken }
          : {
              ...audiencePayload(),
              previewToken: audiencePreview.previewToken,
              title,
              message,
              type: "system",
              link: link.trim(),
              channel: channels,
            };

      const data = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
      const deliverySummary = tab === "email"
        ? data.queued !== undefined
          ? `${data.queued} emails queued, ${data.skipped || 0} skipped by preferences or configuration`
          : `${data.sent ?? 0} recipient(s)`
        : tab === "announcement"
          ? `${data.recipients ?? 0} recipient(s)${data.emailsQueued !== undefined ? `, ${data.emailsQueued} emails queued` : ""}${data.pushQueued !== undefined ? `, ${data.pushQueued} push deliveries queued` : ""}`
          : `${data.sent ?? 0} recipient(s)`;
      setStatus((data.message || "Sent") + " — " + deliverySummary);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to send communication");
    } finally {
      setSending(false);
    }
  }

  function renderPreview() {
    if (tab === "email") {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Email preview</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{subject || "Email subject"}</p>
          <div className="mt-4 overflow-hidden rounded-xl border bg-white">
            <iframe title="Email preview" sandbox="" srcDoc={html || "<p style='font-family:Arial;padding:24px'>Email preview</p>"} className="h-96 w-full" />
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">In-app preview</p>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="font-bold text-slate-900">{title || "Notification title"}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{message || "Your message will appear here."}</p>
          {link && <p className="mt-3 text-xs font-bold text-blue-600">Action: {link}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        eyebrow="Engagement"
        title="Communications"
        description="Send targeted in-app notifications, email and announcements with a preview before delivery."
      />

      <AdminTabs
        ariaLabel="Communication type"
        value={tab}
        onChange={setTab}
        items={[
          { value: "notification", label: "In-app notification" },
          { value: "email", label: "Email" },
          { value: "announcement", label: "Announcement" },
        ]}
      />

      {templates.some(template => template.isActive) && <div className="mt-5 card p-4"><label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Reusable message template</span><select className="input-field mt-2" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}><option value="">Choose a saved template</option>{templates.filter(template => template.isActive).map(template => <option key={template._id} value={template._id}>{template.name} · {template.channel}</option>)}</select></label><button type="button" className="btn-secondary mt-3" disabled={!selectedTemplateId} onClick={() => { const template = templates.find(item => item._id === selectedTemplateId); if (!template) return; setTab(template.channel); setTitle(template.title || ""); setMessage(template.channel === "email" ? "" : template.body); setSubject(template.subject || ""); setHtml(template.channel === "email" ? template.body : ""); setLink(template.link || ""); setStatus("Template loaded. Review audience and content before sending."); }}>Load template into composer</button></div>}

      <section className="card mt-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Automation templates</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Edit automatic notifications</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">These templates are used for course purchase confirmations, subscription activation and renewal, payment failures, and learning reminders. Keep the built-in key unchanged to keep the event connected.</p>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={() => editTemplate()}>New template</button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <div key={template._id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{template.key}</p>
                <p className="mt-1 text-xs text-slate-500">{template.channel} · {template.isActive ? "Active" : "Inactive"}</p>
              </div>
              <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => editTemplate(template)}>Edit</button>
            </div>
          ))}
        </div>

        {templateEditorOpen && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{editingTemplateId ? "Edit message template" : "Create message template"}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Supported tokens include <code>{"{{userName}}"}</code>, <code>{"{{courseTitle}}"}</code>, <code>{"{{planName}}"}</code>, <code>{"{{amount}}"}</code>, <code>{"{{currency}}"}</code>, and <code>{"{{link}}"}</code>.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => { setTemplateEditorOpen(false); setEditingTemplateId(""); setTemplateDraft({ ...EMPTY_TEMPLATE }); setTemplateError(""); setTemplateStatus(""); }}>Close</button>
            </div>
            {templateError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{templateError}</p>}
            {templateStatus && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{templateStatus}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">Template name
                <input className="input-field mt-1" value={templateDraft.name} onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })} />
              </label>
              <label className="block text-xs font-semibold text-slate-600">Template key
                <input className="input-field mt-1 font-mono" value={templateDraft.key} onChange={(e) => setTemplateDraft({ ...templateDraft, key: e.target.value })} disabled={Boolean(editingTemplateId)} />
              </label>
              <label className="block text-xs font-semibold text-slate-600">Channel
                <select className="input-field mt-1" value={templateDraft.channel} disabled={Boolean(editingTemplateId)} onChange={(e) => setTemplateDraft({ ...templateDraft, channel: e.target.value as TemplateDraft["channel"] })}>
                  <option value="notification">In-app notification</option>
                  <option value="email">Email</option>
                  <option value="announcement">Announcement</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">Message type
                <select className="input-field mt-1" value={templateDraft.messageType} onChange={(e) => setTemplateDraft({ ...templateDraft, messageType: e.target.value })}>
                  <option value="system">System</option>
                  <option value="course">Course</option>
                  <option value="billing">Billing</option>
                  <option value="promotion">Promotion</option>
                  <option value="security">Security</option>
                </select>
              </label>
              {templateDraft.channel === "email" ? (
                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Email subject
                  <input className="input-field mt-1" value={templateDraft.subject} onChange={(e) => setTemplateDraft({ ...templateDraft, subject: e.target.value })} />
                </label>
              ) : (
                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Notification title
                  <input className="input-field mt-1" value={templateDraft.title} onChange={(e) => setTemplateDraft({ ...templateDraft, title: e.target.value })} />
                </label>
              )}
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Body {templateDraft.channel === "email" ? "(HTML)" : "(plain text)"}
                <textarea className="input-field mt-1 min-h-40 font-mono text-sm" value={templateDraft.body} onChange={(e) => setTemplateDraft({ ...templateDraft, body: e.target.value })} />
              </label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Destination route (optional)
                <input className="input-field mt-1" value={templateDraft.link} onChange={(e) => setTemplateDraft({ ...templateDraft, link: e.target.value })} placeholder="/billing" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={templateDraft.isActive} onChange={(e) => setTemplateDraft({ ...templateDraft, isActive: e.target.checked })} /> Template active</label>
            </div>
            <button type="button" className="btn-primary mt-4" onClick={() => void saveTemplate()} disabled={savingTemplate}>
              {savingTemplate ? "Saving template..." : "Save template"}
            </button>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="card p-6">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Recipient targeting</span>
                <select className="input-field mt-2" value={targetMode} onChange={(e) => { setTargetMode(e.target.value as typeof targetMode); setAudiencePreview(null); }}>
                  <option value="audience">Audience group</option>
                  <option value="emails">Specific user(s) by email</option>
                  <option value="filters">Advanced filters</option>
                </select>
              </label>
              {targetMode === "audience" && <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Audience group</span>
                <select className="input-field mt-2" value={audience} onChange={(e) => { setAudience(e.target.value); setAudiencePreview(null); }}>
                  <option value="all">All users</option>
                  <option value="active">Active users</option>
                  <option value="subscribers">Active subscribers</option>
                </select>
              </label>}
            </div>
            {targetMode === "emails" && <label className="mt-3 block text-xs font-semibold text-slate-600">Recipient email addresses
              <textarea className="input-field mt-2 min-h-24" value={selectedEmails} onChange={(e) => { setSelectedEmails(e.target.value); setAudiencePreview(null); }} placeholder="user@example.com, another@example.com" />
              <span className="mt-1 block font-normal text-slate-500">Enter one or more registered email addresses, separated by commas, semicolons, or new lines. Maximum 500.</span>
            </label>}
            {targetMode === "filters" && <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Choose a predefined segment, then optionally refine it with filters</p>
              <label className="mt-3 block text-xs font-semibold text-slate-600">Quick audience presets
                <select className="input-field mt-1" value={segmentPreset} onChange={(e) => applyAudiencePreset(e.target.value)}>
                  <option value="custom">Custom filters</option>
                  <option value="premium">Subscribers on highest-priced active plan</option>
                  <option value="popular_plan">Subscribers on the most popular plan</option>
                  <option value="high_spenders">High spenders (₹5,000+ paid)</option>
                  <option value="multi_course_learners">Learners enrolled in 4+ courses</option>
                  <option value="premium_high_value">Premium subscribers who spent ₹5,000+ and enrolled in 4+ courses</option>
                  <option value="popular_course_learners">Learners in the 5 most popular courses</option>
                  <option value="free_course_learners">Learners enrolled in free courses</option>
                  <option value="inactive_learners">No course progress activity for 14+ days</option>
                  <option value="expiring_subscribers">Subscribers expiring within 7 days</option>
                  <option value="at_risk_subscribers">Past-due subscribers</option>
                  <option value="unverified_accounts">Email addresses not verified</option>
                </select>
              </label>
              {audienceOptionsError && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{audienceOptionsError} Course and plan dropdowns may be incomplete.</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-semibold text-slate-600">Account status<select className="input-field mt-1" value={audienceFilters.status || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, status: e.target.value }); setAudiencePreview(null); }}><option value="">Any status</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Account type<select className="input-field mt-1" value={audienceFilters.role || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, role: e.target.value }); setAudiencePreview(null); }}><option value="">Users and admins</option><option value="user">Learners only</option><option value="admin">Administrators only</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Email verified<select className="input-field mt-1" value={audienceFilters.emailVerified || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, emailVerified: e.target.value }); setAudiencePreview(null); }}><option value="">Any</option><option value="true">Verified</option><option value="false">Not verified</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Sign-in provider<select className="input-field mt-1" value={audienceFilters.authProvider || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, authProvider: e.target.value }); setAudiencePreview(null); }}><option value="">Any provider</option><option value="local">Email/password</option><option value="google">Google</option><option value="local_google">Email and Google</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Subscription status<select className="input-field mt-1" value={audienceFilters.subscriptionStatus || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, subscriptionStatus: e.target.value }); setAudiencePreview(null); }}><option value="">Any subscription</option><option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Specific subscription plan<select className="input-field mt-1" value={audienceFilters.planId || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, planId: e.target.value, planSegment: "" }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any plan</option>{audiencePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.currency} {plan.price}{plan.isPopular ? " · Popular" : ""}{!plan.isActive ? " · Inactive" : ""}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Expires within<select className="input-field mt-1" value={audienceFilters.expiresWithinDays || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, expiresWithinDays: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any expiry</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Inactive for<select className="input-field mt-1" value={audienceFilters.inactiveDays || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, inactiveDays: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any activity</option><option value="7">7+ days</option><option value="14">14+ days</option><option value="30">30+ days</option><option value="60">60+ days</option><option value="90">90+ days</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Specific course<select className="input-field mt-1" value={audienceFilters.courseId || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, courseId: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any course</option>{audienceCourses.map((course) => <option key={course.id} value={course.id}>{course.title} · {course.category} · {course.pricingMode === "paid" ? `₹${course.price}` : "Free"}{course.featured ? " · Featured" : ""}{!course.isPublished ? " · Draft" : ""}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Enrollment status<select className="input-field mt-1" value={audienceFilters.enrollmentStatus || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, enrollmentStatus: e.target.value }); setAudiencePreview(null); }}><option value="">Any enrollment</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Minimum course progress<select className="input-field mt-1" value={audienceFilters.progressMin || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, progressMin: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any progress</option><option value="25">25%+</option><option value="50">50%+</option><option value="75">75%+</option><option value="90">90%+</option><option value="100">100% complete</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Maximum course progress<select className="input-field mt-1" value={audienceFilters.progressMax || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, progressMax: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any progress</option><option value="25">Up to 25%</option><option value="50">Up to 50%</option><option value="75">Up to 75%</option><option value="90">Up to 90%</option><option value="100">Up to 100%</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Plan segment<select className="input-field mt-1" value={audienceFilters.planSegment || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, planSegment: e.target.value, planId: "" }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any plan type</option><option value="premium">Highest-priced active plan</option><option value="popular">Marked as most popular</option><option value="paid">Any paid plan</option><option value="free">Free plan</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Course segment<select className="input-field mt-1" value={audienceFilters.courseSegment || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, courseSegment: e.target.value, courseId: "" }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any course</option><option value="popular">Top 5 most-enrolled courses</option><option value="paid">Paid courses</option><option value="free">Free courses</option><option value="featured">Featured courses</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Total paid spend<select className="input-field mt-1" value={audienceFilters.totalSpendMin || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, totalSpendMin: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any spend</option><option value="500">₹500+</option><option value="1000">₹1,000+</option><option value="2500">₹2,500+</option><option value="5000">₹5,000+</option><option value="10000">₹10,000+</option><option value="25000">₹25,000+</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Courses enrolled<select className="input-field mt-1" value={audienceFilters.courseCountMin || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, courseCountMin: e.target.value }); setSegmentPreset("custom"); setAudiencePreview(null); }}><option value="">Any course count</option><option value="1">1+ courses</option><option value="2">2+ courses</option><option value="3">3+ courses</option><option value="4">4+ courses</option><option value="5">5+ courses</option><option value="10">10+ courses</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Registered after<input className="input-field mt-1" type="date" value={audienceFilters.registeredAfter || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, registeredAfter: e.target.value }); setAudiencePreview(null); }} /></label>
                <label className="text-xs font-semibold text-slate-600">Registered before<input className="input-field mt-1" type="date" value={audienceFilters.registeredBefore || ""} onChange={(e) => { setAudienceFilters({ ...audienceFilters, registeredBefore: e.target.value }); setAudiencePreview(null); }} /></label>
              </div>
            </div>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-secondary" onClick={() => void previewAudience()} disabled={previewingAudience}>{previewingAudience ? "Checking recipients..." : "Preview recipients"}</button>
              <span className="text-xs text-slate-500">Sending is capped at 5,000 recipients per campaign. Review the audience before sending.</span>
            </div>
            {audiencePreview && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4" aria-live="polite">
              <p className="font-semibold text-slate-900">{audiencePreview.truncated ? "At least " : ""}{audiencePreview.recipientCount.toLocaleString()} matching recipient(s)</p>
              {audiencePreview.truncated && <p className="mt-1 text-xs text-amber-700">Preview capped at 5,000. Narrow the audience before sending to avoid an overly broad campaign.</p>}
              {audiencePreview.sample.length > 0 && <ul className="mt-3 space-y-1 text-sm text-slate-600">{audiencePreview.sample.map((user) => <li key={user.id}>{user.name || "Unnamed user"} <span className="text-slate-400">· {user.email}</span></li>)}</ul>}
            </div>}
          </div>

          {tab !== "email" && (
            <>
              <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Title</span><input className="input-field mt-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your announcement title" /></label>
              <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Message</span><textarea className="input-field mt-2 min-h-40" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} placeholder="Write a clear, useful message..." /><div className="mt-1 text-right text-[11px] text-slate-400">{message.length}/5000</div></label>
              <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Destination route (optional)</span><input className="input-field mt-2" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/courses or /pricing" /></label>
            </>
          )}

          {tab === "email" && (
            <>
              <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Subject</span><input className="input-field mt-2" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
              <label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">HTML body</span><textarea className="input-field mt-2 min-h-72 font-mono text-sm" value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<h1>Hello...</h1>" /></label>
            </>
          )}

          {tab === "announcement" && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Channels</p>
              <p className="mt-1 text-xs text-slate-500">Push requires the platform push service and a registered device. Learner preferences and platform settings still apply.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {(["in_app", "email", "push"] as Channel[]).map((channel) => (
                  <label key={channel} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
                    <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />
                    {channel === "in_app" ? "In-app" : channel === "email" ? "Email" : "Push"}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPreview((value) => !value)}>
              <Eye className="h-4 w-4" /> {preview ? "Hide preview" : "Preview"}
            </button>
            <button type="button" className="btn-primary" onClick={() => void send()} disabled={sending || !canSend}>
              <Send className="h-4 w-4" /> {sending ? "Sending..." : "Send now"}
            </button>
          </div>

          {status && <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{status}</p>}
        </section>

        {preview ? renderPreview() : (
          <div className="card p-6">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Delivery checklist</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Use a specific subject/title and a concise message.</li>
              <li>Set a route when the message should take the learner somewhere in the app.</li>
              <li>Verify the audience before sending.</li>
              <li>Announcements can use both in-app and email channels.</li>
            </ul>
          </div>
        )}
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Operations</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Notification delivery logs</h2>
            <p className="mt-1 text-sm text-slate-500">Latest automated and manual deliveries, retry attempts, and provider errors.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void loadDeliveryLogs()} disabled={loadingDeliveries}>
            {loadingDeliveries ? "Refreshing..." : "Refresh logs"}
          </button>
        </div>
        {deliveryError && <p role="alert" className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{deliveryError}</p>}
        {deliveryNotice && <p role="status" className="m-5 rounded-xl bg-green-50 p-3 text-sm text-green-700">{deliveryNotice}</p>}
        {loadingDeliveries && !deliveries.length ? (
          <div className="p-8 text-sm text-slate-500">Loading delivery history...</div>
        ) : deliveries.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No automated delivery attempts have been recorded yet. Events appear here after the notification service queues them.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Notification</th><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Push</th><th className="px-5 py-3">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="max-w-xs px-5 py-4">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{item.type}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{item.user?.name || "Unknown user"}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.user?.email || "No email"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.emailStatus === "sent" ? "bg-green-50 text-green-700" : item.emailStatus === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{item.emailStatus || "unknown"}</span>
                      <p className="mt-1 text-xs text-slate-500">{item.emailAttempts || 0} attempt(s)</p>
                      {item.emailError && <p className="mt-1 max-w-48 text-xs text-red-600">{item.emailError}</p>}
                      {(item.emailStatus === "failed" || (item.emailStatus === "skipped" && /SMTP is not configured|Email delivery is disabled in admin platform settings/.test(item.emailError || ""))) && <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" disabled={retryingDelivery === `${item.id}:email`} onClick={() => void retryDelivery(item.id, "email")}>{retryingDelivery === `${item.id}:email` ? "Retrying..." : "Retry email"}</button>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.pushStatus === "sent" ? "bg-green-50 text-green-700" : item.pushStatus === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.pushStatus || "unknown"}</span>
                      <p className="mt-1 text-xs text-slate-500">{item.pushAttempts || 0} attempt(s)</p>
                      {item.pushError && <p className="mt-1 max-w-48 text-xs text-red-600">{item.pushError}</p>}
                      {(item.pushStatus === "failed" || (item.pushStatus === "skipped" && /Web Push VAPID keys are not configured|No active browser push subscriptions|Push delivery is disabled in admin platform settings/.test(item.pushError || ""))) && <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" disabled={retryingDelivery === `${item.id}:push`} onClick={() => void retryDelivery(item.id, "push")}>{retryingDelivery === `${item.id}:push` ? "Retrying..." : "Retry push"}</button>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
