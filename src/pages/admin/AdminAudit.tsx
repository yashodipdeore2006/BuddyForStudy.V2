import { useEffect, useState } from "react";
import { ChevronDown, RefreshCcw, Search, X } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";
import { SavedViews, type SavedViewRecord } from "@/components/admin/SavedViews";
import JsonDiff from "@/components/admin/JsonDiff";

export default function AdminAudit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [savedViews, setSavedViews] = useState<SavedViewRecord[]>([]);
  const [savedViewsLoading, setSavedViewsLoading] = useState(false);
  const [savedViewsError, setSavedViewsError] = useState("");
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

  async function load(filters: { q: string; action: string; targetType: string; page?: number; limit?: number } = { q, action, targetType, page, limit }) {
    setLoading(true);
    setError("");
    try {
      const selectedPage = filters.page ?? page;
      const selectedLimit = filters.limit ?? limit;
      const params = new URLSearchParams({ page: String(selectedPage), limit: String(selectedLimit) });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.action) params.set("action", filters.action);
      if (filters.targetType) params.set("targetType", filters.targetType);
      const data = await adminFetch("/api/admin/audit-logs?" + params.toString());
      setLogs(data.logs || []);
      setTotal(Number(data.total || 0));
      setPages(Math.max(1, Number(data.pages || 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load audit log");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSavedViews() {
    setSavedViewsLoading(true);
    setSavedViewsError("");
    try {
      const data = await adminFetch("/api/admin/saved-views?pageKey=audit&page=1&limit=100");
      setSavedViews((data.items || []) as SavedViewRecord[]);
    } catch (e) {
      setSavedViewsError(e instanceof Error ? e.message : "Unable to load audit saved filters.");
    } finally {
      setSavedViewsLoading(false);
    }
  }

  async function createSavedView(payload: any) {
    setSavedViewsError("");
    try {
      await adminFetch("/api/admin/saved-views", { method: "POST", body: JSON.stringify(payload) });
      await refreshSavedViews();
    } catch (e) {
      setSavedViewsError(e instanceof Error ? e.message : "Unable to save audit filters.");
      throw e;
    }
  }

  async function deleteSavedView(view: SavedViewRecord) {
    if (view.canManage === false) return;
    setSavedViewsError("");
    try {
      await adminFetch("/api/admin/saved-views/" + view.id, { method: "DELETE" });
      setSavedViews((current) => current.filter((item) => item.id !== view.id));
      if (activeSavedViewId === view.id) setActiveSavedViewId(null);
    } catch (e) {
      setSavedViewsError(e instanceof Error ? e.message : "Unable to delete audit saved filters.");
    }
  }

  function applySavedView(view: SavedViewRecord) {
    const filters = view.filters || {};
    const next = {
      q: typeof filters.q === "string" ? filters.q : "",
      action: typeof filters.action === "string" ? filters.action : "",
      targetType: typeof filters.targetType === "string" ? filters.targetType : ""
    };
    setQ(next.q);
    setAction(next.action);
    setTargetType(next.targetType);
    setActiveSavedViewId(view.id);
    setPage(1);
    void load({ ...next, page: 1, limit });
  }

  useEffect(() => { void load(); void refreshSavedViews(); }, []);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Security and accountability"
        title="Audit log"
        description="Inspect sensitive admin actions with searchable before/after context and reasons."
        actions={<button type="button" aria-label="Refresh audit events" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>}
      />

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="card mt-6 p-4">
        <SavedViews
          page="audit"
          views={savedViews}
          activeId={activeSavedViewId}
          currentView={{ filters: { q, action, targetType }, columns: [], sort: {}, density: "comfortable" }}
          onApply={applySavedView}
          onCreate={createSavedView}
          onDelete={deleteSavedView}
          loading={savedViewsLoading}
          error={savedViewsError}
        />
        <form className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); void load({ q, action, targetType, page: 1, limit }); }}>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search audit events" className="input-field pl-10" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="Search action, target ID or reason" /></div>
          <input aria-label="Filter audit events by action" className="input-field" value={action} maxLength={100} onChange={(e) => setAction(e.target.value)} placeholder="Action (e.g. user.updated)" />
          <input aria-label="Filter audit events by target type" className="input-field" value={targetType} maxLength={100} onChange={(e) => setTargetType(e.target.value)} placeholder="Target type (e.g. User)" />
          <button type="submit" className="btn-primary"><Search className="h-4 w-4" /> Apply</button>
          <button type="button" aria-label="Clear audit log filters" className="btn-secondary" onClick={() => { setQ(""); setAction(""); setTargetType(""); setPage(1); setActiveSavedViewId(null); void load({ q: "", action: "", targetType: "", page: 1, limit }); }}>Clear</button>
        </form>
        <p className="mt-3 text-xs text-slate-400" role="status" aria-live="polite">Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total.toLocaleString()} events</p>
      </div>

      <div className="card mt-6 overflow-hidden">
        {loading ? <div role="status" aria-live="polite" aria-label="Loading audit events" className="p-12 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /><span className="sr-only">Loading audit events</span></div> : (
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
                    <td className="p-4 text-right"><button type="button" aria-label={`Inspect audit event: ${log.action || "unknown action"}`} className="btn-secondary text-xs" onClick={() => setSelected(log)}><ChevronDown className="h-4 w-4" /> Inspect</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logs.length && <div role="status" aria-live="polite" className="p-10 text-center text-sm text-slate-500">No audit events match these filters.</div>}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        <AdminPagination page={page} pages={pages} total={total} from={total ? (page - 1) * limit + 1 : 0} to={Math.min(page * limit, total)} limit={limit} loading={loading} onPageChange={(nextPage) => { setPage(nextPage); void load({ q, action, targetType, page: nextPage, limit }); }} onLimitChange={(nextLimit) => { setLimit(nextLimit); setPage(1); void load({ q, action, targetType, page: 1, limit: nextLimit }); }} />
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="audit-event-title" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Audit event</p><h2 id="audit-event-title" className="mt-1 font-mono text-lg font-extrabold">{selected.action}</h2><p className="mt-1 text-xs text-slate-500">{selected.actor?.email || "system"} · {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</p></div><button type="button" aria-label="Close audit event details" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></div>
            <div className="mt-5"><JsonDiff before={selected.before ?? null} after={selected.after ?? null} /></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><span className="font-bold">Reason:</span> {selected.reason || "No reason recorded."}</div>
          </section>
        </div>
      )}
    </div>
  );
}
