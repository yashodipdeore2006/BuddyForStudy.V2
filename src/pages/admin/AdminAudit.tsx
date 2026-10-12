import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCcw, Search, X } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

export default function AdminAudit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);

  async function load(filters = { q, action, targetType }) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.action) params.set("action", filters.action);
      if (filters.targetType) params.set("targetType", filters.targetType);
      const data = await adminFetch("/api/admin/audit-logs?" + params.toString());
      setLogs(data.logs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load audit log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const actions = useMemo(() => [...new Set(logs.map((log) => log.action).filter(Boolean))].sort(), [logs]);
  const targets = useMemo(() => [...new Set(logs.map((log) => log.targetType).filter(Boolean))].sort(), [logs]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Security & accountability</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Audit Log</h1>
          <p className="mt-2 text-slate-500">Inspect sensitive admin actions with searchable before/after context and reasons.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="card mt-6 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_220px_auto]">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="input-field pl-10" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="Search action, target, ID or reason" /></div>
          <select className="input-field" value={action} onChange={(e) => { const nextAction = e.target.value; setAction(nextAction); void load({ q, action: nextAction, targetType }); }}><option value="">All actions</option>{actions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="input-field" value={targetType} onChange={(e) => { const nextTargetType = e.target.value; setTargetType(nextTargetType); void load({ q, action, targetType: nextTargetType }); }}><option value="">All targets</option>{targets.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button type="button" className="btn-secondary" onClick={() => { setQ(""); setAction(""); setTargetType(""); void load({ q: "", action: "", targetType: "" }); }}>Clear</button>
        </div>
        <p className="mt-3 text-xs text-slate-400">{logs.length} events loaded</p>
      </div>

      <div className="card mt-6 overflow-hidden">
        {loading ? <div className="p-12 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th scope="col" className="p-4">Time</th><th scope="col" className="p-4">Admin</th><th scope="col" className="p-4">Action</th><th scope="col" className="p-4">Target</th><th scope="col" className="p-4">Reason</th><th scope="col" className="p-4 text-right">Details</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap p-4 text-xs text-slate-500">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</td>
                    <td className="p-4 text-xs font-semibold">{log.actor?.email || "system"}</td>
                    <td className="p-4 font-mono text-xs font-bold text-slate-700">{log.action}</td>
                    <td className="p-4 text-xs text-slate-600">{log.targetType} <span className="font-mono">{log.targetId || "—"}</span></td>
                    <td className="max-w-sm p-4 text-xs text-slate-500">{log.reason || "—"}</td>
                    <td className="p-4 text-right"><button type="button" className="btn-secondary text-xs" onClick={() => setSelected(log)}><ChevronDown className="h-4 w-4" /> Inspect</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logs.length && <div className="p-10 text-center text-sm text-slate-500">No audit events match these filters.</div>}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Audit event</p><h2 className="mt-1 font-mono text-lg font-extrabold">{selected.action}</h2><p className="mt-1 text-xs text-slate-500">{selected.actor?.email || "system"} · {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</p></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-slate-950 p-4 text-xs text-slate-100"><p className="mb-2 font-bold text-white">Before</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(selected.before ?? null, null, 2)}</pre></div>
              <div className="rounded-xl bg-slate-950 p-4 text-xs text-slate-100"><p className="mb-2 font-bold text-white">After</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(selected.after ?? null, null, 2)}</pre></div>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><span className="font-bold">Reason:</span> {selected.reason || "No reason recorded."}</div>
          </section>
        </div>
      )}
    </div>
  );
}
