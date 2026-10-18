import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, RefreshCcw, Search } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type Issue = {
  _id: string;
  category: string;
  description: string;
  status: "open" | "in_review" | "resolved" | "closed";
  adminNote?: string;
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
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/admin/payment-issues?limit=300" + (filter ? "&status=" + filter : ""));
      setIssues(data.issues || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load support cases.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filter]);

  async function update(issue: Issue, status: Issue["status"]) {
    const adminNote = (notes[issue._id] ?? issue.adminNote ?? "").trim();
    if (status === "resolved" && !adminNote) {
      setError("Add a resolution note before resolving a support case.");
      return;
    }
    setSavingId(issue._id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/payment-issues/" + issue._id, {
        method: "PUT", body: JSON.stringify({ status, adminNote }),
      });
      setNotice("Support case updated.");
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
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"><ClipboardList className="h-3.5 w-3.5" /> Learner support</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Payment & access cases</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Investigate missing course access, failed payments and billing concerns. Refund execution is handled by Finance permissions.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")}/> Refresh</button>
    </header>
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
