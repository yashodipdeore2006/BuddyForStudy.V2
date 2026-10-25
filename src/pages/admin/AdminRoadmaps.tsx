import { useCallback, useEffect, useState } from "react";
import { Map, RefreshCcw } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";

type Roadmap = {
  _id: string;
  source: "saved" | "generated";
  title?: string;
  user?: { name?: string };
  query: string;
  canonicalTopic?: string;
  intent?: string;
  careerOutcome?: string;
  level: string;
  status: "active" | "completed" | "published" | "draft" | "archived";
  lessonCount: number;
  startedAt?: string;
  lastAccessedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
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
  const generated = items.filter((item) => item.source === "generated").length;
  return <div className="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader eyebrow="Learning intelligence" title="Learning roadmaps" description="Inspect saved learner plans alongside AI-generated course roadmaps. Learner plans show completion status; generated courses show publication status." actions={<button type="button" className="btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")}/> Refresh</button>}/>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>{total.toLocaleString()} matching roadmap records</span><span>{active} active plans, {completed} completed plans, and {generated} AI-generated courses on this page</span></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">Roadmap inventory</h2><p className="mt-1 text-sm text-slate-500">{total.toLocaleString()} saved-plan and AI-generated-course records matching the selected status; showing {items.length.toLocaleString()} records on page {page} of {pages}.</p></div><select aria-label="Filter roadmaps by status" className="input-field w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All records</option><option value="active">Active learner plans</option><option value="completed">Completed learner plans</option><option value="published">Published AI courses</option><option value="draft">Draft AI courses</option><option value="archived">Archived AI courses</option></select></div>
      {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading roadmaps…</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Roadmap / topic</th><th className="p-4">Learner</th><th className="p-4">Level</th><th className="p-4">Progress</th><th className="p-4">Activity</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.source + "-" + item._id}><td className="p-4"><p className="font-semibold text-slate-900">{item.title || item.canonicalTopic || item.query}</p><p className="mt-1 text-xs text-slate-500">{item.intent || item.careerOutcome || item.query || "No outcome recorded"}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{item._id}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{item.source === "saved" ? "Saved learner plan" : "AI-generated course"}</p></td><td className="p-4"><p className="font-medium">{item.user?.name || (item.source === "generated" ? "Shared AI course" : "Unknown learner")}</p></td><td className="p-4">{item.level}</td><td className="p-4"><AdminBadge tone={item.status === "completed" || item.status === "published" ? "success" : "info"}>{item.status}</AdminBadge><p className="mt-1 text-xs text-slate-500">{item.lessonCount} lessons</p></td><td className="p-4 text-xs text-slate-500">{item.source === "saved" ? <><p>Started {date(item.startedAt)}</p>{item.lastAccessedAt && <p className="mt-1">Last accessed {date(item.lastAccessedAt)}</p>}<p className="mt-1">Updated {date(item.updatedAt)}</p>{item.completedAt && <p className="mt-1">Completed {date(item.completedAt)}</p>}</> : <><p>Generated {date(item.createdAt || item.startedAt)}</p><p className="mt-1">Updated {date(item.updatedAt)}</p></>}</td></tr>)}</tbody></table>{!items.length && <div className="p-10 text-center"><Map className="mx-auto h-7 w-7 text-slate-400"/><p className="mt-3 text-sm text-slate-500">No roadmap records match this filter.</p></div>}</div>}
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
