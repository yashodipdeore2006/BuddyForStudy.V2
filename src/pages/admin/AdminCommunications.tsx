import { useEffect, useMemo, useState } from "react";
import { Bell, Eye, Mail, Megaphone, Send } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type Channel = "in_app" | "email";
type MessageTemplate = { _id: string; name: string; key: string; channel: "notification" | "email" | "announcement"; title: string; subject: string; body: string; link: string; messageType?: string; isActive: boolean };
type TemplateDraft = { name: string; key: string; channel: "notification" | "email" | "announcement"; title: string; subject: string; body: string; link: string; messageType: string; isActive: boolean };
const EMPTY_TEMPLATE: TemplateDraft = { name: "", key: "", channel: "notification", title: "", subject: "", body: "", link: "", messageType: "system", isActive: true };

export default function AdminCommunications() {
  const [tab, setTab] = useState<"notification" | "email" | "announcement">("notification");
  const [audience, setAudience] = useState("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [link, setLink] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["in_app"]);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateStatus, setTemplateStatus] = useState("");
  const [templateError, setTemplateError] = useState("");

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
    void loadDeliveryLogs();
  }, []);

  function editTemplate(template?: MessageTemplate) {
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
      setEditingTemplateId("");
      setTemplateDraft({ ...EMPTY_TEMPLATE });
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

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    );
  }

  async function send() {
    if (!canSend) {
      setStatus("Complete the required fields first.");
      return;
    }

    if (!window.confirm("Send this communication to the selected audience?")) return;

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
          ? { audience, subject, html }
          : {
              audience,
              title,
              message,
              type: "system",
              link: link.trim(),
              channel: channels,
            };

      const data = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
      setStatus(
        (data.message || "Sent") + " — " + String(data.sent ?? data.recipients ?? 0) + " recipients"
      );
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
            <iframe title="Email preview" srcDoc={html || "<p style='font-family:Arial;padding:24px'>Email preview</p>"} className="h-96 w-full" />
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
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Engagement</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Communications</h1>
        <p className="mt-2 text-slate-500">Send targeted in-app notifications, email and announcements with a preview before delivery.</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["notification", "In-app notification", Bell],
          ["email", "Email", Mail],
          ["announcement", "Announcement", Megaphone],
        ].map(([value, label, Icon]: any) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={tab === value ? "btn-primary" : "btn-secondary"}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

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

        {(editingTemplateId || templateDraft.name || templateStatus || templateError) && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{editingTemplateId ? "Edit message template" : "Create message template"}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Supported tokens include <code>{"{{userName}}"}</code>, <code>{"{{courseTitle}}"}</code>, <code>{"{{planName}}"}</code>, <code>{"{{amount}}"}</code>, <code>{"{{currency}}"}</code>, and <code>{"{{link}}"}</code>.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => editTemplate()}>Close</button>
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
                <select className="input-field mt-1" value={templateDraft.channel} onChange={(e) => setTemplateDraft({ ...templateDraft, channel: e.target.value as TemplateDraft["channel"] })}>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Audience</span>
              <select className="input-field mt-2" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">All users</option>
                <option value="active">Active users</option>
                <option value="subscribers">Subscribers</option>
              </select>
            </label>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Delivery reaches the selected audience from the server, including inactive accounts for “All users”.
            </div>
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
              <div className="mt-3 flex flex-wrap gap-3">
                {(["in_app", "email"] as Channel[]).map((channel) => (
                  <label key={channel} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
                    <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />
                    {channel === "in_app" ? "In-app" : "Email"}
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
        {loadingDeliveries && !deliveries.length ? (
          <div className="p-8 text-sm text-slate-500">Loading delivery history...</div>
        ) : deliveries.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No automated delivery attempts have been recorded yet. Events appear here after the notification service queues them.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
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
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.pushStatus === "sent" ? "bg-green-50 text-green-700" : item.pushStatus === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.pushStatus || "unknown"}</span>
                      <p className="mt-1 text-xs text-slate-500">{item.pushAttempts || 0} attempt(s)</p>
                      {item.pushError && <p className="mt-1 max-w-48 text-xs text-red-600">{item.pushError}</p>}
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
