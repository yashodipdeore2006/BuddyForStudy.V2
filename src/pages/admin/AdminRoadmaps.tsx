import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ListTree, Map, RefreshCcw, Search, X } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";

type RoadmapSource = "saved" | "generated";
type RoadmapStatus = "active" | "completed" | "published" | "draft" | "archived";
type RoadmapLesson = {
  lessonId?: string;
  title: string;
  description?: string;
  type?: string;
  order?: number;
  buildState?: string;
};
type RoadmapModule = { title: string; order?: number; lessons: RoadmapLesson[] };
type Roadmap = {
  _id: string;
  source: RoadmapSource;
  title?: string;
  description?: string;
  user?: { name?: string };
  query: string;
  canonicalTopic?: string;
  intent?: string;
  careerOutcome?: string;
  level: string;
  status: RoadmapStatus;
  lessonCount: number;
  startedAt?: string;
  lastAccessedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  modules?: RoadmapModule[];
};
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";
const statusTone = (status: RoadmapStatus) => status === "completed" || status === "published" ? "success" as const : status === "archived" ? "neutral" as const : "info" as const;

export default function AdminRoadmaps() {
  const [items, setItems] = useState<Roadmap[]>([]);
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Roadmap | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailRequestRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      if (appliedQuery) params.set("q", appliedQuery);
      const data = await adminFetch("/api/admin/content-roadmaps?" + params.toString());
      setItems(data.roadmaps || []);
      setTotal(Number(data.total || 0));
      setPages(Math.max(1, Number(data.pages || 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load learning roadmaps.");
    } finally {
      setLoading(false);
    }
  }, [status, appliedQuery, page, limit]);

  useEffect(() => { void load(); }, [load]);

  const clearDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setSelectedKey(null);
    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
  }, []);

  const toggleDetails = useCallback(async (item: Roadmap) => {
    const key = item.source + "-" + item._id;
    if (selectedKey === key) {
      clearDetail();
      return;
    }
    const requestId = ++detailRequestRef.current;
    setSelectedKey(key);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const data = await adminFetch("/api/admin/content-roadmaps/" + encodeURIComponent(item.source) + "/" + encodeURIComponent(item._id));
      if (detailRequestRef.current === requestId) setDetail(data.roadmap || null);
    } catch (e) {
      if (detailRequestRef.current === requestId) setDetailError(e instanceof Error ? e.message : "Unable to load the roadmap outline.");
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }, [selectedKey, clearDetail]);

  const active = items.filter((item) => item.status === "active").length;
  const completed = items.filter((item) => item.status === "completed").length;
  const generated = items.filter((item) => item.source === "generated").length;

  return <div className="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader
      eyebrow="Learning intelligence"
      title="Learning roadmaps"
      description="Inspect saved learner plans alongside AI-generated course roadmaps. Search by topic or learner name, then inspect a safe, read-only lesson outline."
      actions={<button type="button" className="btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh</button>}
    />
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>{total.toLocaleString()} matching roadmap records</span>
      <span>{active} active plans, {completed} completed plans, and {generated} AI-generated courses on this page</span>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-bold">Roadmap inventory</h2>
          <p className="mt-1 text-sm text-slate-500">{total.toLocaleString()} saved-plan and AI-generated-course records matching the selected filters; showing {items.length.toLocaleString()} records on page {page} of {pages}.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form className="flex min-w-0 flex-1 flex-wrap gap-2" role="search" onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(searchInput.trim());
            setPage(1);
            clearDetail();
          }}>
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search roadmaps by topic or learner name</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input-field w-full pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search topic or learner name" aria-label="Search roadmaps by topic or learner name" maxLength={100} />
            </label>
            <button type="submit" className="btn-secondary">Search</button>
            {(searchInput || appliedQuery) && <button type="button" className="btn-secondary" onClick={() => {
              setSearchInput("");
              setAppliedQuery("");
              setPage(1);
              clearDetail();
            }}><X className="h-4 w-4" /> Clear</button>}
          </form>
          <select aria-label="Filter roadmaps by status" className="input-field w-auto" value={status} onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
            clearDetail();
          }}>
            <option value="">All records</option>
            <option value="active">Active learner plans</option>
            <option value="completed">Completed learner plans</option>
            <option value="published">Published AI courses</option>
            <option value="draft">Draft AI courses</option>
            <option value="archived">Archived AI courses</option>
          </select>
        </div>
      </div>
      {loading ? <div role="status" className="p-10 text-center text-sm text-slate-500">Loading roadmaps…</div> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-4">Roadmap / topic</th><th className="p-4">Learner / owner</th><th className="p-4">Level</th><th className="p-4">Status / lessons</th><th className="p-4">Activity</th><th className="p-4">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const key = item.source + "-" + item._id;
              const isOpen = selectedKey === key;
              return <Fragment key={key}>
                <tr>
                  <td className="p-4">
                    <p className="font-semibold text-slate-900">{item.title || item.canonicalTopic || item.query}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.intent || item.careerOutcome || item.query || "No outcome recorded"}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-400">{item._id}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{item.source === "saved" ? "Saved learner plan" : "AI-generated course"}</p>
                  </td>
                  <td className="p-4"><p className="font-medium">{item.user?.name || (item.source === "generated" ? "Shared AI course" : "Unknown learner")}</p></td>
                  <td className="p-4">{item.level}</td>
                  <td className="p-4"><AdminBadge tone={statusTone(item.status)}>{item.status}</AdminBadge><p className="mt-1 text-xs text-slate-500">{item.lessonCount} lessons</p></td>
                  <td className="p-4 text-xs text-slate-500">
                    {item.source === "saved" ? <>
                      <p>Started {date(item.startedAt)}</p>
                      {item.lastAccessedAt && <p className="mt-1">Last accessed {date(item.lastAccessedAt)}</p>}
                      <p className="mt-1">Updated {date(item.updatedAt)}</p>
                      {item.completedAt && <p className="mt-1">Completed {date(item.completedAt)}</p>}
                    </> : <>
                      <p>Generated {date(item.createdAt || item.startedAt)}</p>
                      <p className="mt-1">Updated {date(item.updatedAt)}</p>
                    </>}
                  </td>
                  <td className="p-4">
                    <button type="button" className="btn-secondary whitespace-nowrap" aria-expanded={isOpen} onClick={() => void toggleDetails(item)}>
                      {isOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {isOpen ? "Hide outline" : "View outline"}
                    </button>
                  </td>
                </tr>
                {isOpen && <tr>
                  <td colSpan={6} className="bg-slate-50 p-4 sm:p-6">
                    {detailLoading && <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><RefreshCcw className="h-4 w-4 animate-spin" /> Loading lesson outline…</div>}
                    {detailError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailError}</div>}
                    {!detailLoading && !detailError && detail && <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ListTree className="h-4 w-4" /> Read-only outline</div>
                          <h3 className="mt-1 text-lg font-bold text-slate-900">{detail.title || item.title || item.query}</h3>
                          {detail.description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{detail.description}</p>}
                          <p className="mt-1 text-xs text-slate-500">{detail.lessonCount} lessons · {detail.modules?.length || 0} modules · {detail.source === "saved" ? "Saved learner plan" : "AI-generated course"}</p>
                        </div>
                        <button type="button" className="btn-secondary" onClick={clearDetail}><X className="h-4 w-4" /> Close</button>
                      </div>
                      {detail.modules?.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {detail.modules.map((module, index) => <section key={module.title + "-" + index} className="rounded-xl border border-slate-200 bg-white p-4">
                          <h4 className="font-semibold text-slate-900">{module.order || index + 1}. {module.title}</h4>
                          <ol className="mt-3 space-y-2">
                            {module.lessons.map((lesson, lessonIndex) => <li key={(lesson.order || lessonIndex + 1) + "-" + lesson.title} className="flex gap-3 text-sm">
                              <span className="shrink-0 text-xs font-medium text-slate-400">{lesson.order || lessonIndex + 1}.</span>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-800">{lesson.title}</p>
                                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                                  {lesson.type && <span>{lesson.type}</span>}
                                  {lesson.buildState && <span>Resource state: {lesson.buildState}</span>}
                                </div>
                                {lesson.description && <p className="mt-1 text-xs leading-5 text-slate-500">{lesson.description}</p>}
                              </div>
                            </li>)}
                          </ol>
                        </section>)}
                      </div> : <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No lesson outline is available for this record.</p>}
                      <p className="mt-4 text-xs text-slate-500">This view intentionally omits quiz questions, answer keys, learner quiz responses, and contact details.</p>
                    </>}
                  </td>
                </tr>}
              </Fragment>;
            })}
          </tbody>
        </table>
        {!items.length && <div className="p-10 text-center"><Map className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 text-sm text-slate-500">No roadmap records match these filters.</p></div>}
      </div>}
      <div className="border-t border-slate-100 px-4 py-3">
        <AdminPagination
          page={page}
          pages={pages}
          total={total}
          from={total ? (page - 1) * limit + 1 : 0}
          to={Math.min(page * limit, total)}
          limit={limit}
          loading={loading}
          onPageChange={(nextPage) => { clearDetail(); setPage(nextPage); }}
          onLimitChange={(nextLimit) => { clearDetail(); setLimit(nextLimit); setPage(1); }}
        />
      </div>
    </section>
  </div>;
}
