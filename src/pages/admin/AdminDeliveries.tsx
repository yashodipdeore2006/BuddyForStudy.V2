import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { useSearchParams } from "react-router-dom";
import { AdminPageHeader } from "@/components/admin/AdminUI";

type Delivery = {
  id: string;
  time?: string;
  recipient?: { name?: string; email?: string } | null;
  type: string;
  eventKey: string;
  title: string;
  channels: {
    in_app: { status: string };
    email: { status: string; attempts: number; lastAttemptAt?: string; sentAt?: string; error?: string };
    push: { status: string; attempts: number; lastAttemptAt?: string; sentAt?: string; error?: string };
  };
};
const statuses = ["pending", "sent", "failed", "skipped"];
const statusClass = (status: string) => status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "failed" ? "border-red-200 bg-red-50 text-red-800" : status === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600";
const date = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "—";

export default function AdminDeliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Delivery[]>([]);
  const initialQuery = searchParams.get("q") || "";
  const [q, setQ] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [channel, setChannel] = useState(searchParams.get("channel") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("from") || "");
  const [dateTo, setDateTo] = useState(searchParams.get("to") || "");
  const [page, setPage] = useState(Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retrying, setRetrying] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: "25", page: String(page) });
      if (search.trim()) params.set("q", search.trim());
      if (channel) params.set("channel", channel);
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      if (dateFrom) params.set("from", new Date(dateFrom + "T00:00:00+05:30").toISOString());
      if (dateTo) params.set("to", new Date(dateTo + "T23:59:59.999+05:30").toISOString());
      const data = await adminFetch("/api/admin/deliveries?" + params.toString());
      setItems(Array.isArray(data.deliveries) ? data.deliveries : []);
      setPages(Math.max(1, Number(data.pages || 1)));
      setTotal(Number(data.total || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load notification deliveries.");
    } finally { setLoading(false); }
  }, [search, channel, status, type, dateFrom, dateTo, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (channel) params.set("channel", channel);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (page > 1) params.set("page", String(page));
    setSearchParams(params, { replace: true });
  }, [search, channel, status, type, dateFrom, dateTo, page, setSearchParams]);

  async function retry(item: Delivery, selectedChannel: "email" | "push") {
    const current = item.channels[selectedChannel];
    const label = selectedChannel === "email" ? "email" : "push";
    if (current.status !== "failed") return;
    if (!window.confirm("Retry the " + label + " delivery for " + (item.recipient?.email || "this masked recipient") + "?")) return;
    const reason = window.prompt("Reason for retrying this delivery (10–500 characters):") || "";
    if (reason.trim().length < 10 || reason.trim().length > 500) { setError("Retry reason must be between 10 and 500 characters."); return; }
    setRetrying(item.id + ":" + selectedChannel); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/deliveries/" + item.id + "/retry", { method: "POST", body: JSON.stringify({ channel: selectedChannel, reason: reason.trim() }) });
      setNotice(data.message || "Delivery retry processed.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to retry this delivery."); }
    finally { setRetrying(""); }
  }

  return <div className="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader eyebrow="Communications" title="Delivery log" description="Search notification attempts, inspect channel acceptance and retry eligible failures. Sent means the provider accepted the request, not that it reached an inbox or was read." actions={<button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")}/> Refresh</button>} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_140px_140px_160px_160px_180px_auto]">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input className="input-field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient or event key" aria-label="Search recipient or event key"/></form>
        <select className="input-field" value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} aria-label="Filter channel"><option value="">All channels</option><option value="in_app">In-app</option><option value="email">Email</option><option value="push">Push</option></select>
        <select className="input-field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter status"><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select className="input-field" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter notification type"><option value="">All types</option>{["system", "course", "billing", "promotion", "security", "learning"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <label className="text-xs font-semibold text-slate-500">From<input type="date" className="input-field mt-1" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></label>
        <label className="text-xs font-semibold text-slate-500">To<input type="date" className="input-field mt-1" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></label>
        <button type="button" className="btn-secondary" onClick={() => { setQ(""); setSearch(""); setChannel(""); setStatus(""); setType(""); setDateFrom(""); setDateTo(""); setPage(1); }}>Reset</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">{total.toLocaleString()} matching delivery record(s) · page {page} of {pages}</p>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {loading && !items.length ? <p role="status" className="p-8 text-sm text-slate-500">Loading delivery records…</p> : !items.length ? <p className="p-8 text-sm text-slate-500">{search || channel || status || type ? "No delivery records match these filters." : "No delivery records have been created yet."}</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Time / recipient</th><th className="p-4">Event</th><th className="p-4">In-app</th><th className="p-4">Email</th><th className="p-4">Push</th></tr></thead><tbody className="divide-y divide-slate-100">
          {items.map((item) => <tr key={item.id} className="align-top"><td className="p-4"><p className="font-medium text-slate-900">{date(item.time)}</p><p className="mt-2 text-xs text-slate-600">{item.recipient?.name || "Unknown recipient"}</p><p className="text-xs text-slate-500">{item.recipient?.email || "Masked recipient"}</p></td><td className="max-w-xs p-4"><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.type}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{item.eventKey || item.id}</p></td><td className="p-4"><span className={"inline-flex rounded-full border px-2 py-1 text-xs font-semibold " + statusClass(item.channels.in_app.status)}>{item.channels.in_app.status}</span><p className="mt-2 text-xs text-slate-500">In-app record status</p></td>
            {(["email", "push"] as const).map((key) => { const delivery = item.channels[key]; const eligible = delivery.status === "failed"; return <td key={key} className="p-4"><span className={"inline-flex rounded-full border px-2 py-1 text-xs font-semibold " + statusClass(delivery.status)}>{delivery.status}</span><p className="mt-2 text-xs text-slate-500">{delivery.attempts} attempt(s)</p>{delivery.sentAt && <p className="mt-1 text-xs text-slate-500">Accepted {date(delivery.sentAt)}</p>}{delivery.error && <p className="mt-2 max-w-56 break-words text-xs text-red-600">{delivery.error}</p>}{eligible && <button type="button" className="btn-secondary mt-2 text-xs" disabled={retrying === item.id + ":" + key} onClick={() => void retry(item, key)}>{retrying === item.id + ":" + key ? "Retrying…" : "Retry " + key}</button>}</td>; })}
          </tr>)}
        </tbody></table></div>}
      <div className="flex items-center justify-between border-t border-slate-100 p-4"><span className="text-xs text-slate-500">Sent = provider accepted; not proof of final delivery.</span><div className="flex gap-2"><button type="button" className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" className="btn-secondary" disabled={page >= pages || loading} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</button></div></div>
    </section>
  </div>;
}
