import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, RefreshCcw, Search } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader } from "@/components/admin/AdminUI";

type Issue = {
  _id: string;
  category: string;
  description: string;
  status: "open" | "in_review" | "resolved" | "closed";
  adminNote?: string;
  assignedTo?: { _id?: string; id?: string; name?: string; email?: string } | string | null;
  internalNotes?: { _id?: string; note: string; reason: string; createdAt: string; author?: { name?: string; email?: string } }[];
  createdAt: string;
  user?: { name?: string; email?: string };
  payment?: { amount?: number; currency?: string; status?: string; course?: { title?: string }; plan?: { name?: string } };
};

const STATUS_LABELS: Record<Issue["status"], string> = {
  open: "Open", in_review: "In review", resolved: "Resolved", closed: "Closed",
};
const CATEGORY_LABELS: Record<string, string> = {
  benefit_not_received: "Benefit not received", payment_failed: "Payment failed",
  duplicate_charge: "Duplicate charge", incorrect_amount: "Incorrect amount",
  refund_help: "Refund assistance", other: "Other",
};
const money = (amount = 0, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);

export default function AdminSupport() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [data, assigneeData] = await Promise.all([
        adminFetch("/api/admin/payment-issues?limit=300" + (filter ? "&status=" + filter : "")),
        adminFetch("/api/admin/payment-issues/assignees"),
      ]);
      setIssues(data.issues || []);
      setAssignees(assigneeData.assignees || []);
      setAssignments((current) => {
        const next = { ...current };
        for (const issue of data.issues || []) if (next[issue._id] === undefined) next[issue._id] = issue.assignedTo?._id || issue.assignedTo?.id || (typeof issue.assignedTo === "string" ? issue.assignedTo : "");
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load support cases.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filter]);

  async function update(issue: Issue, status: Issue["status"], assignment = assignments[issue._id] ?? (typeof issue.assignedTo === "string" ? issue.assignedTo : issue.assignedTo?._id || issue.assignedTo?.id || "")) {
    const adminNote = (notes[issue._id] ?? issue.adminNote ?? "").trim();
    const internalNote = (internalNotes[issue._id] || "").trim();
    const reason = window.prompt("Reason for this support case change (10–500 characters):")?.trim() || "";
    if (reason.length < 10 || reason.length > 500) {
      setError("A reason of 10–500 characters is required for support case changes.");
      return;
    }
    if (status === "resolved" && !adminNote) {
      setError("Add a resolution note before resolving a support case.");
      return;
    }
    setSavingId(issue._id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/payment-issues/" + issue._id, {
        method: "PUT", body: JSON.stringify({ status, adminNote, assignedTo: assignment || null, internalNote, reason }),
      });
      setNotice("Support case updated.");
      setInternalNotes((old) => ({ ...old, [issue._id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update support case.");
    } finally { setSavingId(null); }
  }

  const filtered = issues.filter((issue) => {
    const haystack = [issue.user?.name, issue.user?.email, issue.description, issue.category, issue.payment?.course?.title, issue.payment?.plan?.name].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return <div className="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      eyebrow="Learner support"
      title="Payment and access cases"
      description="Investigate missing course access, failed payments and billing concerns. Refund execution is handled by Finance permissions."
      actions={<button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary"><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh</button>}
    />
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    <section className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
      <label className="text-sm font-medium text-slate-700">Case status
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="">All cases</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Search cases
        <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, course or issue…" className="w-full py-2.5 text-sm outline-none"/></span>
      </label>
    </section>
    {loading ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading support cases…</div> : filtered.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500"/><p className="mt-3 font-semibold text-slate-900">No matching cases</p><p className="mt-1 text-sm text-slate-500">Try another status or search term.</p></div> :
      <div className="space-y-4">{filtered.map((issue) => <article key={issue._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">{CATEGORY_LABELS[issue.category] || issue.category}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{STATUS_LABELS[issue.status]}</span></div>
            <p className="mt-1 text-sm text-slate-500">{issue.user?.name || "Unknown user"} · {issue.user?.email || "No email"} · {new Date(issue.createdAt).toLocaleString()}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{issue.description}</p>
            <p className="mt-2 text-xs text-slate-500">Transaction: {issue.payment?.status || "Unknown"} · {money(issue.payment?.amount, issue.payment?.currency || "INR")} · {issue.payment?.course?.title || issue.payment?.plan?.name || "Product not specified"}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><AlertCircle className="h-4 w-4"/> Support workflow</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block text-sm font-medium text-slate-700">Assigned administrator
            <select value={assignments[issue._id] ?? (typeof issue.assignedTo === "string" ? issue.assignedTo : issue.assignedTo?._id || issue.assignedTo?.id || "")} onChange={(e) => setAssignments((old) => ({ ...old, [issue._id]: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <option value="">Unassigned</option>
              {assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="button" disabled={savingId === issue._id} onClick={() => void update(issue, issue.status)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Save assignment</button></div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Internal notes</p>
          {(issue.internalNotes || []).map((note, index) => <div key={note._id || index} className="mt-2 border-b border-slate-200 pb-2 last:border-0"><p className="whitespace-pre-wrap text-sm text-slate-700">{note.note}</p><p className="mt-1 text-xs text-slate-400">{note.author?.name || "Admin"} · {new Date(note.createdAt).toLocaleString()} · reason: {note.reason}</p></div>)}
          <textarea value={internalNotes[issue._id] || ""} onChange={(e) => setInternalNotes((old) => ({ ...old, [issue._id]: e.target.value }))} rows={2} maxLength={2000} placeholder="Private internal note (not sent to learner)" className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400"/>
          <button type="button" disabled={savingId === issue._id || !(internalNotes[issue._id] || "").trim()} onClick={() => void update(issue, issue.status)} className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white">Add internal note</button>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700">Support update / resolution message
          <textarea value={notes[issue._id] ?? issue.adminNote ?? ""} onChange={(e) => setNotes((old) => ({ ...old, [issue._id]: e.target.value }))} rows={2} maxLength={2000} placeholder="This note is sent to the learner when the case status changes." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"/>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.status !== "in_review" && <button type="button" disabled={savingId === issue._id} onClick={() => void update(issue, "in_review")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Mark in review</button>}
          {issue.status !== "resolved" && <button type="button" disabled={savingId === issue._id} onClick={() => void update(issue, "resolved")} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{savingId === issue._id ? "Saving…" : "Resolve case"}</button>}
          {issue.status !== "closed" && <button type="button" disabled={savingId === issue._id} onClick={() => void update(issue, "closed")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close case</button>}
        </div>
      </article>)}</div>}
  </div>;
}
