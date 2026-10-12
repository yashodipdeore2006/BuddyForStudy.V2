import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, IndianRupee, RefreshCcw, TrendingUp, Users } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

function money(value: number) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

function maxOf(items: any[], key: string) {
  return Math.max(1, ...items.map((item) => Number(item[key] || 0)));
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(selectedDays = days) {
    setLoading(true);
    setError("");
    try {
      const result = await adminFetch("/api/admin/analytics?days=" + selectedDays);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [days]);

  const enrollmentMax = useMemo(() => maxOf(data?.enrollmentsDaily || [], "count"), [data]);
  const revenueMax = useMemo(() => maxOf(data?.revenueDaily || [], "amount"), [data]);

  const completions: Array<{ label: string; count: number }> = (data?.completionBreakdown || [])
    .map((item: any) => ({
      label:
        item._id === 0 ? "0–24%" :
        item._id === 25 ? "25–49%" :
        item._id === 50 ? "50–74%" :
        item._id === 75 ? "75–99%" :
        item._id === 100 ? "100%" : "Other",
      count: Number(item.count || 0),
    }));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Business intelligence</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Analytics</h1>
          <p className="mt-2 text-slate-500">Understand learner acquisition, revenue activity, course performance and learning completion.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Select analytics reporting period" className="input-field w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="button" aria-label="Refresh analytics" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>
        </div>
      </div>

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {loading && !data ? (
        <div role="status" aria-live="polite" aria-label="Loading analytics" className="flex min-h-[50vh] items-center justify-center"><RefreshCcw className="animate-spin text-blue-600" /><span className="sr-only">Loading analytics</span></div>
      ) : (
        <>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card p-5"><Users className="h-5 w-5 text-blue-600" /><p className="mt-3 text-2xl font-bold">{data?.totals?.enrollments || 0}</p><p className="text-sm text-slate-500">Enrollments in period</p></div>
            <div className="card p-5"><IndianRupee className="h-5 w-5 text-blue-600" /><p className="mt-3 text-2xl font-bold">{money(data?.totals?.recordedRevenue)}</p><p className="text-sm text-slate-500">Recorded payment value</p></div>
            <div className="card p-5"><TrendingUp className="h-5 w-5 text-green-600" /><p className="mt-3 text-2xl font-bold">{data?.coursePerformance?.[0]?.enrollments || 0}</p><p className="text-sm text-slate-500">Top course enrollments</p></div>
            <div className="card p-5"><Activity className="h-5 w-5 text-purple-600" /><p className="mt-3 text-2xl font-bold">{completions.find((item) => item.label === "100%")?.count || 0}</p><p className="text-sm text-slate-500">Fully completed courses</p></div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-bold">Daily enrollments</h2><p className="text-xs text-slate-500">New course enrollments.</p></div><ArrowUp className="h-4 w-4 text-green-600" /></div>
              <div className="mt-5 space-y-2">
                {(data?.enrollmentsDaily || []).map((item: any) => (
                  <div key={item._id} className="grid grid-cols-[90px_1fr_50px] items-center gap-2 text-xs">
                    <span className="text-slate-400">{item._id}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: (Number(item.count || 0) / enrollmentMax) * 100 + "%" }} /></div>
                    <span className="text-right font-bold text-slate-600">{item.count}</span>
                  </div>
                ))}
                {!data?.enrollmentsDaily?.length && <p className="text-sm text-slate-500">No enrollments in this period.</p>}
              </div>
            </section>

            <section className="card p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-bold">Daily payment activity</h2><p className="text-xs text-slate-500">Recorded paid payment value.</p></div><ArrowDown className="h-4 w-4 text-blue-600" /></div>
              <div className="mt-5 space-y-2">
                {(data?.revenueDaily || []).map((item: any) => (
                  <div key={item._id} className="grid grid-cols-[90px_1fr_80px] items-center gap-2 text-xs">
                    <span className="text-slate-400">{item._id}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: (Number(item.amount || 0) / revenueMax) * 100 + "%" }} /></div>
                    <span className="text-right font-bold text-slate-600">{money(item.amount)}</span>
                  </div>
                ))}
                {!data?.revenueDaily?.length && <p className="text-sm text-slate-500">No paid payments in this period.</p>}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <section className="card overflow-hidden">
              <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Course performance</h2><p className="mt-1 text-xs text-slate-500">Courses ranked by total enrollments.</p></div>
              <div className="divide-y divide-slate-100">
                {(data?.coursePerformance || []).map((item: any, index: number) => (
                  <div key={item._id || index} className="flex items-center gap-3 p-4">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">#{index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title || "Untitled course"}</p><p className="text-xs text-slate-500">{item.published ? "Published" : "Unpublished"} · {item.pricingMode || "free"}</p></div>
                    <span className="text-sm font-bold">{item.enrollments}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Subscription health</h2><p className="mt-1 text-xs text-slate-500">Current subscription statuses.</p></div>
              <div className="divide-y divide-slate-100">
                {(data?.subscriptionBreakdown || []).map((item: any) => (
                  <div key={item._id} className="flex items-center justify-between p-4"><span className="capitalize text-sm font-semibold text-slate-700">{item._id}</span><span className="text-sm font-bold">{item.count}</span></div>
                ))}
              </div>
            </section>
          </div>

          <section className="card mt-6 p-5">
            <div><h2 className="font-bold">Learning completion</h2><p className="mt-1 text-xs text-slate-500">Progress distribution across saved learner progress records.</p></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-5">
              {completions.map((item: { label: string; count: number }) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-2 text-xl font-bold">{item.count}</p></div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
