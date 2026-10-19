import { useCallback, useEffect, useState } from "react";
import { Map, RefreshCcw } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";

type Roadmap = {
  _id: string;
  user?: { name?: string; email?: string };
  query: string;
  canonicalTopic?: string;
  intent?: string;
  careerOutcome?: string;
  level: string;
  status: "active" | "completed";
  lessons?: unknown[];
  startedAt?: string;
  lastAccessedAt?: string;
  completedAt?: string;
  updatedAt?: string;
};
const date = (value?: string) => value ? new Date(value).toLocaleString() : "—";

export default function AdminRoadmaps() {
  const [items, setItems] = useState<Roadmap[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      const data = await adminFetch("/api/admin/content-roadmaps?" + params.toString());
      setItems(data.roadmaps || []); setTotal(Number(data.total || 0)); setPages(Math.max(1, Number(data.pages || 1)));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load learning roadmaps."); }
    finally { setLoading(false); }
  }, [status, page, limit]);
  useEffect(() => { void load(); }, [load]);
  const active = items.filter((item) => item.status === "active").length;
  const completed = items.filter((item) => item.status === "completed").length;
  return <div className="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader eyebrow="Learning intelligence" title="Learning roadmaps" description="Inspect generated learning plans, learner context, completion status and recent activity. This view is read-only and does not expose lesson answers or learner quiz responses." actions={<button type="button" className="btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")}/> Refresh</button>}/>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>{total.toLocaleString()} matching roadmap records</span><span>{items.filter((item) => item.status === "active").length} active and {items.filter((item) => item.status === "completed").length} completed on this page</span></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">Generated roadmap records</h2><p className="mt-1 text-sm text-slate-500">{total.toLocaleString()} total records matching the selected status; showing up to 300 most recently updated.</p></div><select aria-label="Filter roadmaps by status" className="input-field w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="completed">Completed</option></select></div>
      {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading roadmaps…</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Roadmap / topic</th><th className="p-4">Learner</th><th className="p-4">Level</th><th className="p-4">Progress</th><th className="p-4">Activity</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item._id}><td className="p-4"><p className="font-semibold text-slate-900">{item.canonicalTopic || item.query}</p><p className="mt-1 text-xs text-slate-500">{item.intent || item.careerOutcome || "No outcome recorded"}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{item._id}</p></td><td className="p-4"><p className="font-medium">{item.user?.name || "Unknown learner"}</p><p className="text-xs text-slate-500">{item.user?.email || "No email"}</p></td><td className="p-4">{item.level}</td><td className="p-4"><AdminBadge tone={item.status === "completed" ? "success" : "info"}>{item.status}</AdminBadge><p className="mt-1 text-xs text-slate-500">{item.lessons?.length || 0} roadmap lessons</p></td><td className="p-4 text-xs text-slate-500"><p>Started {date(item.startedAt)}</p><p className="mt-1">Last accessed {date(item.lastAccessedAt)}</p><p className="mt-1">Updated {date(item.updatedAt)}</p>{item.completedAt && <p className="mt-1">Completed {date(item.completedAt)}</p>}</td></tr>)}</tbody></table>{!items.length && <div className="p-10 text-center"><Map className="mx-auto h-7 w-7 text-slate-400"/><p className="mt-3 text-sm text-slate-500">No roadmap records match this filter.</p></div>}</div>}
      <div className="border-t border-slate-100 px-4 py-3">
        <AdminPagination
          page={page}
          pages={pages}
          total={total}
          from={total ? (page - 1) * limit + 1 : 0}
          to={Math.min(page * limit, total)}
          limit={limit}
          loading={loading}
          onPageChange={setPage}
          onLimitChange={(nextLimit) => { setLimit(nextLimit); setPage(1); }}
        />
      </div>
    </section>
  </div>;
}
