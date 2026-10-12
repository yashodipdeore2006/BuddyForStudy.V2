import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  RefreshCcw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

function money(value: number) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

export default function AdminControlCenter() {
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState("");
  const [healthError, setHealthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [overviewResult, healthResult] = await Promise.allSettled([
        adminFetch("/api/admin/overview"),
        adminFetch("/api/admin/health"),
      ]);

      if (overviewResult.status === "rejected") {
        throw overviewResult.reason;
      }

      setData(overviewResult.value);
      setLastUpdated(new Date());

      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
        setHealthError("");
      } else {
        setHealth(null);
        setHealthError("System health information is temporarily unavailable.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return <div role="status" aria-live="polite" className="flex min-h-[60vh] items-center justify-center"><RefreshCcw className="animate-spin text-blue-600" /><span className="sr-only">Loading admin dashboard</span></div>;
  }

  if (error && !data) {
    return <div role="alert" className="card p-6 text-red-600">{error}</div>;
  }

  const s = data?.stats || {};
  const emptyCourseLabel = Number(s.emptyCourses || 0) === 0 ? "Healthy" : String(s.emptyCourses) + " empty";
  const checks = [
    { label: "Database", ok: health?.database === "connected", value: health?.database || "unknown" },
    { label: "Published courses", ok: Number(s.published) > 0, value: String(s.published || 0) },
    { label: "Course structure", ok: Number(s.emptyCourses || 0) === 0, value: emptyCourseLabel },
    { label: "Payment failures", ok: Number(s.failedPayments || 0) === 0, value: String(s.failedPayments || 0) },
    { label: "Refund queue", ok: Number(s.pendingRefunds || 0) === 0, value: String(s.pendingRefunds || 0) },
  ];

  const cards = [
    [Users, "Total users", s.users, String(s.activeUsers || 0) + " active"],
    [BookOpen, "Courses", s.courses, String(s.published || 0) + " published"],
    [CreditCard, "Subscribers", s.activeSubscribers, String(s.pastDueSubscribers || 0) + " past due"],
    [IndianRupee, "Revenue", money(s.revenue), String(s.failedPayments || 0) + " failed payments"],
    [Users, "Enrollments", s.enrollments, "all-time"],
    [AlertTriangle, "Refund queue", s.pendingRefunds, "needs review"],
    [Activity, "Unread notifications", s.unread, "across users"],
    [ShieldCheck, "Admins", s.admins, "privileged accounts"],
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Command center</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Platform Overview</h1>
          <p className="mt-2 text-slate-500">Monitor content, learners, revenue, operations and platform health from one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated && <span className="text-xs text-slate-500" aria-live="polite">Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          <button type="button" onClick={() => void load()} className="btn-secondary" disabled={loading} aria-label={loading ? "Refreshing admin dashboard" : "Refresh admin dashboard"}>
            <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
          </button>
          <Link to="/admin/courses" className="btn-primary">Manage content <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([Icon, label, value, sub]: any) => (
          <div className="card p-5" key={label}>
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Icon className="h-5 w-5" /></div>
              <span className="text-xs text-slate-400">{sub}</span>
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-950">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div><h2 className="font-bold text-slate-900">Recent users</h2><p className="mt-1 text-xs text-slate-500">Newest accounts and access state.</p></div>
            <Link to="/admin/users" className="text-xs font-bold text-blue-600 hover:text-blue-700">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {(data?.recentUsers || []).map((user: any) => (
              <div key={user._id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600">{user.name?.[0]?.toUpperCase() || "U"}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
                <div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-600">{user.authProvider === "google" ? "Google" : "Email"}</p><p className="text-[11px] text-slate-400">{user.emailVerified ? "Verified" : "Pending"}</p></div>
                <span className={"badge " + (user.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{user.isActive ? "Active" : "Disabled"}</span>
              </div>
            ))}
            {!data?.recentUsers?.length && <p className="p-5 text-sm text-slate-500">No user accounts to display yet.</p>}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">System health</h2><p className="mt-1 text-xs text-slate-500">Operational signals that need attention.</p></div>
          <div className="divide-y divide-slate-100">
            {healthError ? (
              <p role="status" aria-live="polite" className="p-4 text-sm text-amber-700">{healthError} Other dashboard data remains available.</p>
            ) : checks.map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-4">
                {item.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">{item.label}</p><p className="text-xs text-slate-500">{item.value}</p></div>
              </div>
            ))}
            {!healthError && (
              <div className="p-4 text-xs text-slate-400">
                Node {health?.node || "—"} · {health?.environment || "—"} · uptime {health?.uptimeSeconds ?? "—"}s
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Recent payments</h2><p className="mt-1 text-xs text-slate-500">Latest billing activity.</p></div><Link to="/admin/billing" className="text-xs font-bold text-blue-600">Billing <ArrowRight className="inline h-3 w-3" /></Link></div>
          <div className="divide-y divide-slate-100">
            {(data?.recentPayments || []).map((payment: any) => (
              <div key={payment._id} className="flex items-center gap-3 p-4">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{payment.user?.name || "Unknown user"}</p><p className="text-xs text-slate-500">{payment.status} · {payment.provider}</p></div>
                <span className="text-sm font-bold">{money(payment.amount)}</span>
              </div>
            ))}
            {!data?.recentPayments?.length && <p className="p-5 text-sm text-slate-500">No payment activity to display yet.</p>}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Top courses</h2><p className="mt-1 text-xs text-slate-500">Highest enrollment counts.</p></div><Link to="/admin/courses" className="text-xs font-bold text-blue-600">Content <ArrowRight className="inline h-3 w-3" /></Link></div>
          <div className="divide-y divide-slate-100">
            {(data?.topCourses || []).map((course: any, index: number) => (
              <div key={course._id || index} className="flex items-center gap-3 p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">#{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{course.title || "Untitled course"}</span>
                <span className="text-xs font-bold text-slate-500">{course.enrollments} enrolled</span>
              </div>
            ))}
            {!data?.topCourses?.length && <p className="p-5 text-sm text-slate-500">No enrollment data yet.</p>}
          </div>
        </section>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Recent admin activity</h2><p className="mt-1 text-xs text-slate-500">Sensitive operational changes are audited.</p></div><Link to="/admin/audit" className="text-xs font-bold text-blue-600">Open audit log</Link></div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {(data?.recentAudit || []).map((log: any) => (
            <div key={log._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="truncate font-mono text-xs font-bold text-slate-700">{log.action}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{log.actor?.email || "system"}</p>
              <p className="mt-2 text-[11px] text-slate-400">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</p>
            </div>
          ))}
          {!data?.recentAudit?.length && <p className="text-sm text-slate-500">No recent admin actions.</p>}
        </div>
      </section>
    </div>
  );
}
