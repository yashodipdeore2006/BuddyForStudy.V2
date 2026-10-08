import { useMemo, useState } from "react";
import { Bell, Eye, Mail, Megaphone, Send } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type Channel = "in_app" | "email";

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

          {status && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{status}</p>}
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
    </div>
  );
}
