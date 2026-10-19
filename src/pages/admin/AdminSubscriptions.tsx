import { useEffect, useState } from "react";
import { RefreshCcw, CalendarClock, CreditCard } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminPageHeader } from "@/components/admin/AdminUI";

const money = (value: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value || 0));
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";

export default function AdminSubscriptions() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/admin/subscriptions?limit=500" + (status ? "&status=" + status : ""));
      setItems(data.subscriptions || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load subscriptions."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [status]);
  const active = items.filter((item) => item.status === "active").length;
  const pastDue = items.filter((item) => item.status === "past_due").length;
  return <div className="mx-auto max-w-7xl">
    <AdminPageHeader eyebrow="Finance operations" title="Subscriptions" description="Review plan assignments, billing periods, cancellation settings and subscription health. Status is provider-derived and read-only in this console."
      actions={<button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>} />
    {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><Metric label="Subscriptions in result" value={items.length} /><Metric label="Active" value={active} /><Metric label="Past due" value={pastDue} warning={pastDue > 0} /></div>
    <section className="card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">Subscription ledger</h2><p className="mt-1 text-xs text-slate-500">No direct status editing is available; reconcile changes through verified billing/provider flows.</p></div><select aria-label="Filter subscriptions by status" className="input-field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select></div>
      {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading subscriptions…</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Subscriber</th><th className="p-4">Plan</th><th className="p-4">Status</th><th className="p-4">Period</th><th className="p-4">Provider</th><th className="p-4">Cancellation</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item._id}><td className="p-4"><p className="font-semibold">{item.user?.name || "Unknown user"}</p><p className="text-xs text-slate-500">{item.user?.email || "No email"}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{item._id}</p></td><td className="p-4"><p className="font-semibold">{item.plan?.name || "Plan unavailable"}</p><p className="text-xs text-slate-500">{money(item.plan?.price, item.plan?.currency || "INR")} / {item.plan?.billingInterval || "period"}</p></td><td className="p-4"><AdminBadge tone={item.status === "active" ? "success" : item.status === "past_due" ? "danger" : "neutral"}>{item.status}</AdminBadge></td><td className="p-4 text-xs text-slate-600"><p><CalendarClock className="mr-1 inline h-3.5 w-3.5" />Start: {date(item.currentPeriodStart)}</p><p className="mt-1">End: {date(item.currentPeriodEnd)}</p></td><td className="p-4"><p className="capitalize">{item.provider || "unknown"}</p><p className="mt-1 max-w-48 break-all font-mono text-[10px] text-slate-400">{item.providerSubscriptionId || "No provider subscription ID"}</p></td><td className="p-4">{item.cancelAtPeriodEnd ? <AdminBadge tone="warning">At period end</AdminBadge> : <AdminBadge tone="neutral">Not scheduled</AdminBadge>}{item.cancelledAt && <p className="mt-1 text-xs text-slate-500">{date(item.cancelledAt)}</p>}</td></tr>)}</tbody></table>{!items.length && <p className="p-8 text-center text-sm text-slate-500">No subscriptions match this filter.</p>}</div>}
    </section>
  </div>;
}
function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <div className="card p-5"><div className="flex items-center gap-2 text-slate-500"><CreditCard className="h-4 w-4"/><p className="text-xs font-semibold">{label}</p></div><p className={"mt-2 text-2xl font-extrabold " + (warning ? "text-amber-700" : "text-slate-900")}>{value}</p></div>; }
