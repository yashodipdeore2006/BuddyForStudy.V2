import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Send } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminConfirmDialog, AdminPageHeader, AdminPagination, AdminTabs } from "@/components/admin/AdminUI";

type Channel = "in_app" | "email" | "push";
type CommunicationConfirmation =
  | { kind: "retry-delivery"; notificationId: string; channel: "email" | "push" }
  | { kind: "cancel-campaign"; announcementId: string; title: string }
  | { kind: "test-template"; templateId: string }
  | { kind: "send"; channel: "notification" | "email" | "announcement"; recipientCount: number; scheduled: boolean };
type MessageTemplate = { _id: string; name: string; key: string; channel: "notification" | "email" | "announcement"; title: string; subject: string; body: string; link: string; messageType?: string; isActive: boolean; usedBy?: Array<{ event: string; source: string }> };
type TemplateDraft = { name: string; key: string; channel: "notification" | "email" | "announcement"; title: string; subject: string; body: string; link: string; messageType: string; isActive: boolean };
type TemplatePreview = { channel: string; title: string; subject: string; body: string; placeholders: string[]; unknownPlaceholders: string[] };
type AnnouncementRecord = { _id: string; title: string; status: string; channel: Channel[]; scheduledAt?: string; timezone?: string; startedAt?: string; sentAt?: string; completedAt?: string; createdAt?: string; stats?: { total?: number; sent?: number; pending?: number; failed?: number; skipped?: number }; lastError?: string };
type CampaignReport = {
  announcement?: { stats?: AnnouncementRecord["stats"] };
  channels?: Partial<Record<Channel, { sent?: number; pending?: number; failed?: number; skipped?: number }>>;
  topErrors?: Array<{ recipient?: { email?: string }; emailError?: string; pushError?: string }>;
};
type DeliveryRecord = {
  id: string; title?: string; message?: string; type?: string; link?: string;
  createdAt?: string; updatedAt?: string;
  user?: { name?: string; email?: string } | null;
  emailStatus?: string; emailAttempts?: number; emailError?: string; emailSentAt?: string;
  pushStatus?: string; pushAttempts?: number; pushError?: string; pushSentAt?: string;
};
type AudiencePlanOption = { id: string; name: string; price: number; currency: string; billingInterval: string; isActive: boolean; isPopular: boolean };
type AudienceCourseOption = { id: string; title: string; category: string; level: string; isPublished: boolean; pricingMode: string; price: number; featured: boolean };
const EMPTY_TEMPLATE: TemplateDraft = { name: "", key: "", channel: "notification", title: "", subject: "", body: "", link: "", messageType: "system", isActive: true };
const TEMPLATE_PLACEHOLDERS = ["userName", "courseTitle", "planName", "amount", "currency", "purchaseDate", "paymentReference", "billingInterval", "currentPeriodStart", "currentPeriodEnd", "periodSummary", "status", "link"] as const;

export default function AdminCommunications() {
  const [tab, setTab] = useState<"notification" | "email" | "announcement">("notification");
  const [workspaceView, setWorkspaceView] = useState<"compose" | "templates" | "deliveries" | "campaigns">("compose");
  const [audience, setAudience] = useState("all");
  const [targetMode, setTargetMode] = useState<"audience" | "emails" | "filters">("audience");
  const [selectedEmails, setSelectedEmails] = useState("");
  const [audienceFilters, setAudienceFilters] = useState<Record<string, string>>({});
  const [segmentPreset, setSegmentPreset] = useState("custom");
  const [audiencePlans, setAudiencePlans] = useState<AudiencePlanOption[]>([]);
  const [audienceCourses, setAudienceCourses] = useState<AudienceCourseOption[]>([]);
  const [audienceOptionsError, setAudienceOptionsError] = useState("");
  const [audiencePreview, setAudiencePreview] = useState<{ recipientCount: number; truncated: boolean; previewToken: string; sample: Array<{ id: string; name: string; email: string }>; channelCounts?: Record<string, { selected?: boolean; consentEligible: number; willReach: number; activeSubscriptions?: number; platformEnabled?: boolean; providerConfigured?: boolean }> } | null>(null);
  const [previewingAudience, setPreviewingAudience] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [link, setLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["in_app"]);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesLoadError, setTemplatesLoadError] = useState("");
  const templateRequestId = useRef(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [deliverySearchInput, setDeliverySearchInput] = useState("");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryLimit, setDeliveryLimit] = useState(25);
  const [deliveryPages, setDeliveryPages] = useState(1);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const deliveryRequestId = useRef(0);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryPermissionsLoaded, setDeliveryPermissionsLoaded] = useState(false);
  const [canManageDeliveries, setCanManageDeliveries] = useState(false);
  const [canManageCommunications, setCanManageCommunications] = useState(false);
  const [canSendCommunications, setCanSendCommunications] = useState(false);
  const [canReadCommunicationDeliveries, setCanReadCommunicationDeliveries] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [retryingDelivery, setRetryingDelivery] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [placeholderTarget, setPlaceholderTarget] = useState<"title" | "subject" | "body">("body");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateStatus, setTemplateStatus] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState(false);
  const [testSendingTemplate, setTestSendingTemplate] = useState(false);
  const [campaigns, setCampaigns] = useState<AnnouncementRecord[]>([]);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignLimit, setCampaignLimit] = useState(25);
  const [campaignPages, setCampaignPages] = useState(1);
  const [campaignTotal, setCampaignTotal] = useState(0);
  const [campaignStatus, setCampaignStatus] = useState("all");
  const [campaignSearchInput, setCampaignSearchInput] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const campaignRequestId = useRef(0);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [campaignNotice, setCampaignNotice] = useState("");
  const [campaignReports, setCampaignReports] = useState<Record<string, CampaignReport>>({});
  const [campaignBusy, setCampaignBusy] = useState("");
  const [confirmationAction, setConfirmationAction] = useState<CommunicationConfirmation | null>(null);
  const [confirmationReason, setConfirmationReason] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [confirmationBusy, setConfirmationBusy] = useState(false);

  function requestConfirmation(action: CommunicationConfirmation) {
    setConfirmationAction(action);
    setConfirmationReason("");
    setConfirmationText("");
    setConfirmationError("");
  }

  function closeConfirmation() {
    if (confirmationBusy) return;
    setConfirmationAction(null);
    setConfirmationReason("");
    setConfirmationText("");
    setConfirmationError("");
  }

  function retryDelivery(notificationId: string, channel: "email" | "push") {
    requestConfirmation({ kind: "retry-delivery", notificationId, channel });
  }

  async function loadTemplates(): Promise<boolean> {
    const requestId = ++templateRequestId.current;
    setLoadingTemplates(true);
    setTemplatesLoadError("");
    try {
      const data = await adminFetch("/api/admin/message-templates");
      if (requestId !== templateRequestId.current) return false;
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      return true;
    } catch (error) {
      if (requestId !== templateRequestId.current) return false;
      setTemplatesLoadError(error instanceof Error ? error.message : "Unable to load message templates.");
      return false;
    } finally {
      if (requestId === templateRequestId.current) setLoadingTemplates(false);
    }
  }

  async function loadCampaigns(page = campaignPage, limit = campaignLimit, statusFilter = campaignStatus, search = campaignSearch) {
    const requestId = ++campaignRequestId.current;
    setLoadingCampaigns(true); setCampaignError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim().slice(0, 100));
      const data = await adminFetch("/api/admin/announcements?" + params.toString());
      if (requestId !== campaignRequestId.current) return;
      const nextPages = Math.max(1, Number(data.pages || 1));
      setCampaignTotal(Number(data.total || 0));
      setCampaignPages(nextPages);
      if (page > nextPages) {
        setCampaignPage(nextPages);
        await loadCampaigns(nextPages, limit, statusFilter, search);
        return;
      }
      setCampaigns(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (error) {
      if (requestId === campaignRequestId.current) setCampaignError(error instanceof Error ? error.message : "Unable to load announcement history.");
    } finally {
      if (requestId === campaignRequestId.current) setLoadingCampaigns(false);
    }
  }

  async function loadCampaignReport(announcementId: string) {
    setCampaignBusy(announcementId); setCampaignError("");
    try { const data = await adminFetch("/api/admin/announcements/" + announcementId + "/report"); setCampaignReports((current) => ({ ...current, [announcementId]: data })); }
    catch (error) { setCampaignError(error instanceof Error ? error.message : "Unable to load the announcement report."); }
    finally { setCampaignBusy(""); }
  }

  function cancelCampaign(announcementId: string, titleText: string) {
    requestConfirmation({ kind: "cancel-campaign", announcementId, title: titleText });
  }

  async function loadDeliveryLogs(page = deliveryPage, limit = deliveryLimit, search = deliverySearch) {
    const requestId = ++deliveryRequestId.current;
    setLoadingDeliveries(true);
    setDeliveryError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set("q", search.trim().slice(0, 100));
      const data = await adminFetch("/api/admin/notification-deliveries?" + params.toString());
      if (requestId !== deliveryRequestId.current) return;
      const nextPages = Math.max(1, Number(data.pages || 1));
      setDeliveryTotal(Number(data.total || 0));
      setDeliveryPages(nextPages);
      if (page > nextPages) {
        setDeliveryPage(nextPages);
        await loadDeliveryLogs(nextPages, limit, search);
        return;
      }
      setDeliveries(Array.isArray(data.deliveries) ? data.deliveries : []);
    } catch (error) {
      if (requestId === deliveryRequestId.current) setDeliveryError(error instanceof Error ? error.message : "Unable to load notification delivery logs.");
    } finally {
      if (requestId === deliveryRequestId.current) setLoadingDeliveries(false);
    }
  }

  useEffect(() => {
    if (!deliveryPermissionsLoaded) return;
    const restrictedManagementView = (workspaceView === "templates" || workspaceView === "campaigns") && !canManageCommunications;
    const restrictedDeliveryView = workspaceView === "deliveries" && !canReadCommunicationDeliveries;
    const restrictedComposeView = workspaceView === "compose" && !canSendCommunications;
    if (restrictedManagementView || restrictedDeliveryView) {
      setWorkspaceView(canSendCommunications ? "compose" : canManageCommunications ? "templates" : canReadCommunicationDeliveries ? "deliveries" : "compose");
    } else if (restrictedComposeView && (canManageCommunications || canReadCommunicationDeliveries)) {
      setWorkspaceView(canManageCommunications ? "templates" : "deliveries");
    }
  }, [deliveryPermissionsLoaded, workspaceView, canSendCommunications, canManageCommunications, canReadCommunicationDeliveries]);

  useEffect(() => {
    adminFetch("/api/admin/access").then((data) => {
      const permissions: string[] = Array.isArray(data.access?.permissions) ? data.access.permissions : [];
      const canSendCommunicationContent = permissions.includes("communications.send");
      const canManageCommunicationContent = permissions.includes("communications.manage");
      const canReadDeliveryOperations = permissions.includes("operations.read");
      setCanSendCommunications(canSendCommunicationContent);
      setCanManageCommunications(canManageCommunicationContent);
      setCanReadCommunicationDeliveries(canReadDeliveryOperations);
      setCanManageDeliveries(permissions.includes("operations.manage"));
      setDeliveryPermissionsLoaded(true);
      // Call only APIs the principal is permitted to use. Direct-route access
      // must not create a stream of predictable 403 requests.
      if (canSendCommunicationContent) {
        void adminFetch("/api/admin/notifications/audience-options").then((options) => {
          setAudiencePlans(Array.isArray(options.plans) ? options.plans : []);
          setAudienceCourses(Array.isArray(options.courses) ? options.courses : []);
          setAudienceOptionsError("");
        }).catch((error) => setAudienceOptionsError(error instanceof Error ? error.message : "Unable to load plan and course filters."));
      }
      if (canManageCommunicationContent) {
        void loadTemplates();
        void loadCampaigns();
      }
      if (canReadDeliveryOperations) void loadDeliveryLogs();
    }).catch(() => {
      setCanSendCommunications(false);
      setCanManageCommunications(false);
      setCanReadCommunicationDeliveries(false);
      setCanManageDeliveries(false);
      setDeliveryPermissionsLoaded(true);
    });
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

  function testSendTemplate() {
    if (!editingTemplateId) { setTemplateError("Save the template first, then reopen it to send a test."); return; }
    requestConfirmation({ kind: "test-template", templateId: editingTemplateId });
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
      const refreshed = await loadTemplates();
      if (!refreshed) {
        setTemplateStatus("Template saved, but the template list could not be refreshed. Retry the template list above before making further edits.");
        return;
      }
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
    if (!canSendCommunications) { setStatus("You do not have permission to preview or send communications."); return; }
    const targetingProblem = targetingError();
    if (targetingProblem) { setStatus(targetingProblem); return; }
    setPreviewingAudience(true);
    setAudiencePreview(null);
    setStatus("");
    try {
      const data = await adminFetch("/api/admin/notifications/audience-preview", {
        method: "POST",
        body: JSON.stringify({ ...audiencePayload(), ...(tab === "announcement" ? { channels } : {}) }),
      });
      setAudiencePreview({
        recipientCount: Number(data.recipientCount || 0),
        truncated: Boolean(data.truncated),
        previewToken: String(data.previewToken || ""),
        sample: Array.isArray(data.sample) ? data.sample : [],
        channelCounts: data.channelCounts || undefined,
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
    if (tab === "announcement") setAudiencePreview(null);
  }

  async function send() {
    if (!canSendCommunications) { setStatus("You do not have permission to send communications."); return; }
    const targetingProblem = targetingError();
    if (targetingProblem) { setStatus(targetingProblem); return; }
    if (!audiencePreview) {
      setStatus("Preview the recipients and confirm the audience before sending.");
      return;
    }
    if (audiencePreview.recipientCount < 1) {
      setStatus("The selected audience has no recipients. Adjust the audience and preview again.");
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
    requestConfirmation({
      kind: "send",
      channel: tab,
      recipientCount: audiencePreview.recipientCount,
      scheduled: tab === "announcement" && Boolean(scheduledAt),
    });
  }

  async function performSend(channel: "notification" | "email" | "announcement", reason: string): Promise<boolean> {
    if (!canSendCommunications) {
      const message = "You do not have permission to send communications.";
      setStatus(message); setConfirmationError(message); return false;
    }
    if (!audiencePreview) {
      setStatus("Preview the recipients and confirm the audience before sending.");
      setConfirmationError("The audience preview is no longer available. Close this dialog and preview recipients again.");
      return false;
    }
    setSending(true);
    setStatus("Sending...");
    try {
      const path =
        channel === "notification"
          ? "/api/admin/notifications/send"
          : channel === "email"
            ? "/api/admin/emails/send"
            : "/api/admin/announcements/send";
      const body =
        channel === "email"
          ? { ...audiencePayload(), subject, html, reason: reason.trim(), previewToken: audiencePreview.previewToken }
          : {
              ...audiencePayload(),
              previewToken: audiencePreview.previewToken,
              title,
              message,
              type: "system",
              link: link.trim(),
              channel: channels,
              reason: reason.trim(),
              ...(channel === "announcement" ? {
                ...(scheduledAt ? { scheduledAt: new Date(scheduledAt + ":00+05:30").toISOString() } : {}),
                timezone: "Asia/Kolkata",
              } : {}),
            };
      const data = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
      const deliverySummary = channel === "email"
        ? data.queued !== undefined
          ? `${data.queued} emails queued, ${data.skipped || 0} skipped by preferences or configuration`
          : `${data.sent ?? 0} recipient(s)`
        : channel === "announcement"
          ? `${data.recipients ?? 0} recipient(s)${data.emailsQueued !== undefined ? `, ${data.emailsQueued} emails queued` : ""}${data.pushQueued !== undefined ? `, ${data.pushQueued} push deliveries queued` : ""}`
          : `${data.sent ?? 0} recipient(s)`;
      setStatus((data.message || "Sent") + " — " + deliverySummary);
      if (channel === "announcement") { setScheduledAt(""); if (canManageCommunications) await loadCampaigns(); }
      return true;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to send communication";
      setStatus(messageText);
      setConfirmationError(messageText);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function submitConfirmation() {
    const action = confirmationAction;
    if (!action) return;
    const reason = confirmationReason.trim();
    const requiresReason = true;
    if (requiresReason && (reason.length < 10 || reason.length > 500)) {
      setConfirmationError("Enter a reason between 10 and 500 characters.");
      return;
    }
    const requiredText = action.kind === "cancel-campaign"
      ? "CANCEL ANNOUNCEMENT"
      : action.kind === "test-template"
        ? "SEND TEST"
        : action.kind === "send" && action.recipientCount > 500
          ? "SEND TO " + action.recipientCount.toLocaleString("en-US") + " USERS"
          : "";
    if (requiredText && confirmationText.trim() !== requiredText) {
      setConfirmationError("Type the exact confirmation phrase to continue.");
      return;
    }
    setConfirmationBusy(true);
    setConfirmationError("");
    try {
      if (action.kind === "retry-delivery") {
        const label = action.channel === "email" ? "email" : "push notification";
        setRetryingDelivery(`${action.notificationId}:${action.channel}`);
        setDeliveryError("");
        setDeliveryNotice("");
        const data = await adminFetch(`/api/admin/notification-deliveries/${action.notificationId}/retry`, {
          method: "POST",
          body: JSON.stringify({ channel: action.channel, reason }),
        });
        setDeliveryNotice(data.message || `${label} retry finished.`);
        await loadDeliveryLogs();
      } else if (action.kind === "cancel-campaign") {
        setCampaignBusy(action.announcementId); setCampaignError(""); setCampaignNotice("");
        const data = await adminFetch("/api/admin/announcements/" + action.announcementId + "/cancel", {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setCampaignNotice(data.message || "Announcement cancelled.");
        await loadCampaigns();
      } else if (action.kind === "test-template") {
        setTestSendingTemplate(true); setTemplateError(""); setTemplateStatus("");
        const data = await adminFetch("/api/admin/message-templates/" + action.templateId + "/test-send", {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setTemplateStatus(data.message || "Test message sent to your administrator account.");
      } else {
        const succeeded = await performSend(action.channel, reason);
        if (!succeeded) return;
      }
      setConfirmationAction(null);
      setConfirmationReason("");
      setConfirmationText("");
      setConfirmationError("");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to complete the communication action.";
      setConfirmationError(messageText);
      if (action.kind === "retry-delivery") setDeliveryError(messageText);
      else if (action.kind === "cancel-campaign") setCampaignError(messageText);
      else if (action.kind === "test-template") setTemplateError(messageText);
    } finally {
      setConfirmationBusy(false);
      setRetryingDelivery("");
      setCampaignBusy("");
      setTestSendingTemplate(false);
    }
  }

  const confirmationRequiredText = confirmationAction?.kind === "cancel-campaign"
    ? "CANCEL ANNOUNCEMENT"
    : confirmationAction?.kind === "test-template"
      ? "SEND TEST"
      : confirmationAction?.kind === "send" && confirmationAction.recipientCount > 500
        ? "SEND TO " + confirmationAction.recipientCount.toLocaleString("en-US") + " USERS"
        : undefined;
  const confirmationNeedsReason = Boolean(confirmationAction);
  const confirmationTitle = !confirmationAction ? "Confirm action"
    : confirmationAction.kind === "retry-delivery" ? `Retry failed ${confirmationAction.channel === "email" ? "email" : "push"} delivery`
    : confirmationAction.kind === "cancel-campaign" ? "Cancel scheduled announcement"
    : confirmationAction.kind === "test-template" ? "Send template test"
    : confirmationAction.scheduled ? "Schedule announcement"
    : confirmationAction.channel === "email" ? "Send email campaign"
    : confirmationAction.channel === "announcement" ? "Send announcement"
    : "Send in-app notification";
  const confirmationDescription = !confirmationAction ? ""
    : confirmationAction.kind === "retry-delivery" ? "Only failed deliveries can be retried. A reason will be recorded in the audit log."
    : confirmationAction.kind === "cancel-campaign" ? `Cancel "${confirmationAction.title}" before the worker starts sending? This action is audited.`
    : confirmationAction.kind === "test-template" ? "This test message will be sent only to your own administrator account, never to the audience."
    : `${confirmationAction.scheduled ? "Schedule" : "Send"} this communication to ${confirmationAction.recipientCount.toLocaleString()} recipient(s). Check the previewed audience and consent counts before confirming.`;
  const confirmationLabel = !confirmationAction ? "Confirm"
    : confirmationAction.kind === "retry-delivery" ? "Retry delivery"
    : confirmationAction.kind === "cancel-campaign" ? "Cancel announcement"
    : confirmationAction.kind === "test-template" ? "Send test"
    : confirmationAction.scheduled ? "Schedule"
    : "Send communication";

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
        description="Compose targeted messages, maintain reusable templates, and inspect delivery and campaign outcomes."
      />

      <div className="mt-6">
        {(canSendCommunications || canManageCommunications || canReadCommunicationDeliveries) && <AdminTabs ariaLabel="Communication workspace" value={workspaceView} onChange={(value) => setWorkspaceView(value as "compose" | "templates" | "deliveries" | "campaigns")} items={[
          ...(canSendCommunications ? [{ value: "compose", label: "Compose" }] : []),
          ...(canManageCommunications ? [
            { value: "templates", label: loadingTemplates ? "Templates…" : templatesLoadError ? "Templates" : `Templates (${templates.length})` },
            { value: "campaigns", label: `Campaigns (${campaignTotal})` },
          ] : []),
          ...(canReadCommunicationDeliveries ? [{ value: "deliveries", label: "Delivery log" }] : []),
        ]} />}
      </div>

      {deliveryPermissionsLoaded && !canSendCommunications && !canManageCommunications && !canReadCommunicationDeliveries && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Your administrator role can open this page, but it does not have permission to send communications, manage message templates, or view delivery logs.</div>}

      {workspaceView === "compose" && canSendCommunications && <AdminTabs
        ariaLabel="Communication type"
        value={tab}
        onChange={(nextTab) => { setTab(nextTab); setAudiencePreview(null); setStatus(""); }}
        items={[
          { value: "notification", label: "In-app notification" },
          { value: "email", label: "Email" },
          { value: "announcement", label: "Announcement" },
        ]}
      />}

      {workspaceView === "compose" && canSendCommunications && templates.some(template => template.isActive) && <div className="mt-5 card p-4"><label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Reusable message template</span><select className="input-field mt-2" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}><option value="">Choose a saved template</option>{templates.filter(template => template.isActive).map(template => <option key={template._id} value={template._id}>{template.name} · {template.channel}</option>)}</select></label><button type="button" className="btn-secondary mt-3" disabled={!selectedTemplateId} onClick={() => { const template = templates.find(item => item._id === selectedTemplateId); if (!template) return; setTab(template.channel); setAudiencePreview(null); setTitle(template.title || ""); setMessage(template.channel === "email" ? "" : template.body); setSubject(template.subject || ""); setHtml(template.channel === "email" ? template.body : ""); setLink(template.link || ""); setStatus("Template loaded. Review audience and content before sending."); }}>Load template into composer</button></div>}

      {workspaceView === "templates" && canManageCommunications && <section className="card mt-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Automation templates</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Edit automatic notifications</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">These templates are used for course purchase confirmations, subscription activation and renewal, payment failures, and learning reminders. Keep the built-in key unchanged to keep the event connected.</p>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={() => editTemplate()}>New template</button>
        </div>

        {templatesLoadError && <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>Unable to refresh templates: {templatesLoadError}</span><button type="button" className="btn-secondary shrink-0" onClick={() => { void loadTemplates(); }} disabled={loadingTemplates}>{loadingTemplates ? "Retrying…" : "Retry loading"}</button></div>}
        {loadingTemplates && !templates.length ? (
          <div className="mt-4 rounded-xl border border-slate-200 p-5 text-sm text-slate-500" role="status">Loading message templates…</div>
        ) : templates.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <div key={template._id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{template.key}</p>
                  <p className="mt-1 text-xs text-slate-500">{template.channel} · {template.isActive ? "Active" : "Inactive"}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Used by</p>
                  {template.usedBy?.length ? <ul className="mt-1 space-y-1">{template.usedBy.map((usage) => <li key={usage.event} className="text-xs text-slate-500">{usage.event} <span className="text-slate-400">· {usage.source}</span></li>)}</ul> : <p className="mt-1 text-xs text-slate-400">No built-in event mapping</p>}
                </div>
                <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => editTemplate(template)}>Edit</button>
              </div>
            ))}
          </div>
        ) : !templatesLoadError ? (
          <div className="mt-4 rounded-xl border border-slate-200 p-5 text-sm text-slate-500">No message templates have been configured yet.</div>
        ) : null}

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
                <select className="input-field mt-1" value={templateDraft.channel} disabled={Boolean(editingTemplateId)} onChange={(e) => { const channel = e.target.value as TemplateDraft["channel"]; setTemplateDraft({ ...templateDraft, channel }); setPlaceholderTarget(channel === "email" ? "subject" : "title"); }}>
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
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Placeholder picker</p><select className="input-field w-auto" value={placeholderTarget} onChange={(e) => setPlaceholderTarget(e.target.value as "title" | "subject" | "body")} aria-label="Placeholder insertion field">{templateDraft.channel === "email" ? <option value="subject">Email subject</option> : <option value="title">Notification title</option>}<option value="body">Message body</option></select></div>
                <div className="mt-2 flex flex-wrap gap-2">{TEMPLATE_PLACEHOLDERS.map((token) => <button key={token} type="button" className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-mono text-slate-600 hover:bg-slate-50" onClick={() => setTemplateDraft((current) => ({ ...current, [placeholderTarget]: (current[placeholderTarget] || "") + "{{" + token + "}}" }))}>{"{{" + token + "}}"}</button>)}</div>
              </div>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Destination route (optional)
                <input className="input-field mt-1" value={templateDraft.link} onChange={(e) => setTemplateDraft({ ...templateDraft, link: e.target.value })} placeholder="/billing" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={templateDraft.isActive} onChange={(e) => setTemplateDraft({ ...templateDraft, isActive: e.target.checked })} /> Template active</label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => void previewTemplate()} disabled={previewingTemplate || !templateDraft.body.trim()}>{previewingTemplate ? "Rendering preview..." : "Preview template"}</button>
              <button type="button" className="btn-secondary" onClick={() => void testSendTemplate()} disabled={testSendingTemplate || !editingTemplateId}>{testSendingTemplate ? "Sending test..." : "Send test to me"}</button>
              <button type="button" className="btn-primary" onClick={() => void saveTemplate()} disabled={savingTemplate}>{savingTemplate ? "Saving template..." : "Save template"}</button>
            </div>
            {!editingTemplateId && <p className="mt-2 text-xs text-slate-500">Save the template first to enable a test send. Tests go only to the signed-in administrator.</p>}
            {templatePreview && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rendered sample preview</p>
              {templatePreview.unknownPlaceholders.length > 0 && <p role="alert" className="mt-2 text-sm text-amber-700">Unsupported placeholders: {templatePreview.unknownPlaceholders.join(", ")}</p>}
              {templatePreview.channel === "email" && <><p className="mt-2 font-semibold">{templatePreview.subject || "Email subject"}</p><iframe title="Template email preview" sandbox="" srcDoc={templatePreview.body || "<p>No body</p>"} className="mt-3 h-72 w-full rounded-lg border border-slate-200" /></>}
              {templatePreview.channel !== "email" && <><p className="mt-2 font-semibold">{templatePreview.title}</p><pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{templatePreview.body}</pre></>}
              <p className="mt-3 text-xs text-slate-500">Placeholders found: {templatePreview.placeholders.length ? templatePreview.placeholders.join(", ") : "none"}</p>
            </div>}
          </div>
        )}
      </section>}

      {workspaceView === "compose" && canSendCommunications && <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
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
              {audiencePreview.channelCounts && <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {(["in_app", "email", "push"] as const).map((channel) => {
                  const item = audiencePreview.channelCounts?.[channel];
                  return <div key={channel} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{channel === "in_app" ? "In-app" : channel === "email" ? "Email" : "Push"}</p><p className="mt-1 text-lg font-bold text-slate-900">{item?.selected === false ? "Not selected" : "Will reach: " + Number(item?.willReach || 0).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Consent eligible: {Number(item?.consentEligible || 0).toLocaleString()}</p>{channel === "push" && <p className="mt-1 text-xs text-slate-500">Active subscriptions: {Number(item?.activeSubscriptions || 0).toLocaleString()}</p>}{item?.providerConfigured === false && <p className="mt-1 text-xs text-amber-700">Provider not configured</p>}{item?.platformEnabled === false && <p className="mt-1 text-xs text-amber-700">Disabled in platform settings</p>}</div>;
                })}
              </div>}
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
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <label className="block text-sm font-semibold text-slate-700">Schedule announcement (optional)
                  <input className="input-field mt-2" type="datetime-local" step="60" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </label>
                <p className="mt-1 text-xs text-slate-500">Leave empty to queue now. Scheduled time uses Asia/Kolkata (UTC+05:30). You can cancel while the campaign is still scheduled.</p>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPreview((value) => !value)}>
              <Eye className="h-4 w-4" /> {preview ? "Hide preview" : "Preview"}
            </button>
            <button type="button" className="btn-primary" onClick={() => void send()} disabled={!canSendCommunications || sending || !canSend}>
              <Send className="h-4 w-4" /> {sending ? "Queuing..." : tab === "announcement" ? (scheduledAt ? "Schedule announcement" : "Queue announcement") : "Send now"}
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
      </div>}

      {workspaceView === "deliveries" && canReadCommunicationDeliveries && <section className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Operations</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Notification delivery logs</h2>
            <p className="mt-1 text-sm text-slate-500">{deliveryTotal.toLocaleString()} records · failed sends can be retried with a reason.</p>
          </div>
          <form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); const next = deliverySearchInput.trim(); setDeliverySearch(next); setDeliveryPage(1); void loadDeliveryLogs(1, deliveryLimit, next); }}>
            <input aria-label="Search notification delivery logs" className="input-field" maxLength={100} value={deliverySearchInput} onChange={(event) => setDeliverySearchInput(event.target.value)} placeholder="Notification, recipient, type or ID" />
            <button type="submit" className="btn-primary"><Eye className="h-4 w-4" /> Search</button>
            <button type="button" className="btn-secondary" onClick={() => { setDeliverySearchInput(""); setDeliverySearch(""); setDeliveryPage(1); void loadDeliveryLogs(1, deliveryLimit, ""); }}>Reset</button>
            <button type="button" className="btn-secondary sm:col-span-3 sm:justify-self-end" onClick={() => void loadDeliveryLogs()} disabled={loadingDeliveries}>{loadingDeliveries ? "Refreshing..." : "Refresh logs"}</button>
          </form>
        </div>
        {deliveryError && <p role="alert" className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{deliveryError}</p>}
        {deliveryPermissionsLoaded && !canManageDeliveries && <p role="status" className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Read-only delivery view. Retrying failed deliveries requires the operations management permission.</p>}
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
                      {item.emailStatus === "failed" && canManageDeliveries && <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" disabled={retryingDelivery === `${item.id}:email`} onClick={() => void retryDelivery(item.id, "email")}>{retryingDelivery === `${item.id}:email` ? "Retrying..." : "Retry email"}</button>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.pushStatus === "sent" ? "bg-green-50 text-green-700" : item.pushStatus === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.pushStatus || "unknown"}</span>
                      <p className="mt-1 text-xs text-slate-500">{item.pushAttempts || 0} attempt(s)</p>
                      {item.pushError && <p className="mt-1 max-w-48 text-xs text-red-600">{item.pushError}</p>}
                      {item.pushStatus === "failed" && canManageDeliveries && <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" disabled={retryingDelivery === `${item.id}:push`} onClick={() => void retryDelivery(item.id, "push")}>{retryingDelivery === `${item.id}:push` ? "Retrying..." : "Retry push"}</button>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination page={deliveryPage} pages={deliveryPages} total={deliveryTotal} from={deliveryTotal ? (deliveryPage - 1) * deliveryLimit + 1 : 0} to={Math.min(deliveryPage * deliveryLimit, deliveryTotal)} limit={deliveryLimit} loading={loadingDeliveries} onPageChange={(nextPage) => { setDeliveryPage(nextPage); void loadDeliveryLogs(nextPage, deliveryLimit, deliverySearch); }} onLimitChange={(nextLimit) => { setDeliveryLimit(nextLimit); setDeliveryPage(1); void loadDeliveryLogs(1, nextLimit, deliverySearch); }} />
      </section>}

      {workspaceView === "campaigns" && canManageCommunications && <section className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-wide text-blue-600">Campaigns</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Announcement schedule and reports</h2><p className="mt-1 text-sm text-slate-500">{campaignTotal.toLocaleString()} campaigns · scheduled work can be cancelled before processing starts.</p></div>
          <form className="grid gap-2 sm:grid-cols-[180px_minmax(220px,1fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); const next = campaignSearchInput.trim(); setCampaignSearch(next); setCampaignPage(1); void loadCampaigns(1, campaignLimit, campaignStatus, next); }}>
            <select aria-label="Filter campaigns by status" className="input-field" value={campaignStatus} onChange={(event) => { const next = event.target.value; setCampaignStatus(next); setCampaignPage(1); void loadCampaigns(1, campaignLimit, next, campaignSearch); }}>
              <option value="all">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="sending">Sending</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option>
            </select>
            <input aria-label="Search announcement campaigns" className="input-field" maxLength={100} value={campaignSearchInput} onChange={(event) => setCampaignSearchInput(event.target.value)} placeholder="Campaign title, creator or ID" />
            <button type="submit" className="btn-primary"><Eye className="h-4 w-4" /> Search</button>
            <button type="button" className="btn-secondary" onClick={() => { setCampaignSearchInput(""); setCampaignSearch(""); setCampaignStatus("all"); setCampaignPage(1); void loadCampaigns(1, campaignLimit, "all", ""); }}>Reset</button>
            <button type="button" className="btn-secondary sm:col-span-4 sm:justify-self-end" onClick={() => void loadCampaigns()} disabled={loadingCampaigns}>{loadingCampaigns ? "Refreshing..." : "Refresh campaigns"}</button>
          </form>
        </div>
        {campaignError && <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{campaignError}</p>}
        {campaignNotice && <p role="status" className="m-5 rounded-lg bg-green-50 p-3 text-sm text-green-700">{campaignNotice}</p>}
        {loadingCampaigns && !campaigns.length ? <p className="p-6 text-sm text-slate-500">Loading campaigns…</p> : !campaigns.length ? <p className="p-6 text-sm text-slate-500">No announcement campaigns yet.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Announcement</th><th className="p-4">Status</th><th className="p-4">Audience</th><th className="p-4">Schedule / sent</th><th className="p-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{campaigns.map((campaign) => {
              const report = campaignReports[campaign._id];
              const recentErrors = report?.topErrors ?? [];
              const stats = report?.announcement?.stats || campaign.stats || {};
              return <tr key={campaign._id} className="align-top">
                <td className="p-4"><p className="font-semibold text-slate-900">{campaign.title}</p><p className="mt-1 text-xs text-slate-500">{(campaign.channel || []).join(", ")}</p></td>
                <td className="p-4"><span className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold">{campaign.status}</span></td>
                <td className="p-4"><p>{Number(stats.total || 0).toLocaleString()} users</p><p className="mt-1 text-xs text-slate-500">Sent on ≥1 channel {Number(stats.sent || 0)} · Pending channel attempts {Number(stats.pending || 0)} · Failed channel attempts {Number(stats.failed || 0)} · Skipped {Number(stats.skipped || 0)}</p></td>
                <td className="p-4 text-xs text-slate-500">{campaign.scheduledAt ? <p>Scheduled {new Date(campaign.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p> : <p>Created {campaign.createdAt ? new Date(campaign.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</p>}{campaign.sentAt && <p className="mt-1">Queue completed {new Date(campaign.sentAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>}{campaign.lastError && <p className="mt-1 text-red-600">{campaign.lastError}</p>}</td>
                <td className="p-4"><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary text-xs" disabled={campaignBusy === campaign._id} onClick={() => void loadCampaignReport(campaign._id)}>{campaignBusy === campaign._id ? "Loading…" : report ? "Refresh report" : "View report"}</button>{(campaign.status === "scheduled" || campaign.status === "draft") && <button type="button" className="btn-secondary text-xs" disabled={campaignBusy === campaign._id} onClick={() => void cancelCampaign(campaign._id, campaign.title)}>Cancel</button>}</div>
                  {report && <div className="mt-3 min-w-64 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="font-semibold">Channel acceptance report</p>{(["in_app", "email", "push"] as const).map((channel) => <p key={channel} className="mt-1 text-xs text-slate-600">{channel}: accepted {Number(report.channels?.[channel]?.sent || 0)}, pending {Number(report.channels?.[channel]?.pending || 0)}, failed {Number(report.channels?.[channel]?.failed || 0)}, skipped {Number(report.channels?.[channel]?.skipped || 0)}</p>)}{recentErrors.length > 0 && <div className="mt-2 border-t border-slate-200 pt-2"><p className="text-xs font-semibold text-red-700">Recent failures</p>{recentErrors.slice(0, 5).map((error: any, idx: number) => <p key={idx} className="mt-1 text-xs text-red-600">{error.recipient?.email || "Masked recipient"} · {error.emailError || error.pushError || "Provider rejected request"}</p>)}</div>}</div>}</td>
              </tr>;
            })}</tbody></table></div>
        }
        <AdminPagination page={campaignPage} pages={campaignPages} total={campaignTotal} from={campaignTotal ? (campaignPage - 1) * campaignLimit + 1 : 0} to={Math.min(campaignPage * campaignLimit, campaignTotal)} limit={campaignLimit} loading={loadingCampaigns} onPageChange={(nextPage) => { setCampaignPage(nextPage); void loadCampaigns(nextPage, campaignLimit, campaignStatus, campaignSearch); }} onLimitChange={(nextLimit) => { setCampaignLimit(nextLimit); setCampaignPage(1); void loadCampaigns(1, nextLimit, campaignStatus, campaignSearch); }} />
      </section>}
      <AdminConfirmDialog
        open={Boolean(confirmationAction)}
        title={confirmationTitle}
        description={confirmationDescription}
        confirmLabel={confirmationLabel}
        requiredText={confirmationRequiredText}
        value={confirmationText}
        onValueChange={setConfirmationText}
        reason={confirmationReason}
        onReasonChange={setConfirmationReason}
        requireReason={confirmationNeedsReason}
        error={confirmationError}
        loading={confirmationBusy}
        danger={confirmationAction?.kind === "cancel-campaign"}
        onClose={closeConfirmation}
        onConfirm={() => void submitConfirmation()}
      />
    </div>
  );
}
