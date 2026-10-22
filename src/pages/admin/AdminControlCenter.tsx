import { useEffect, useState } from "react";

// API records vary by admin endpoint; this alias keeps the response boundary explicit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDashboardRecord = Record<string, any>;
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  RefreshCcw,
  Users,
  XCircle,
} from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminCard, AdminPageHeader, AdminTabs } from "@/components/admin/AdminUI";

function money(value: number) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

export default function AdminControlCenter() {
  const [data, setData] = useState<AdminDashboardRecord | null>(null);
  const [health, setHealth] = useState<AdminDashboardRecord | null>(null);
  const [operationsHealth, setOperationsHealth] = useState<AdminDashboardRecord | null>(null);
  const [error, setError] = useState("");
  const [healthError, setHealthError] = useState("");
  const [operationalAlerts, setOperationalAlerts] = useState<AdminDashboardRecord[]>([]);
  const [alertsError, setAlertsError] = useState("");
  const [acknowledgingAlert, setAcknowledgingAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [dashboardView, setDashboardView] = useState<"overview" | "finance" | "learning" | "governance">("overview");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [overviewResult, healthResult, alertsResult, operationsHealthResult] = await Promise.allSettled([
        adminFetch("/api/admin/overview"),
        adminFetch("/api/admin/health"),
        adminFetch("/api/admin/operations/alerts?status=open&limit=10"),
        adminFetch("/api/admin/operations/system-health"),
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

      if (alertsResult.status === "fulfilled") {
        setOperationalAlerts(alertsResult.value.alerts || []);
        setAlertsError("");
      } else {
        setAlertsError("Operational alerts are temporarily unavailable.");
      }
      if (operationsHealthResult.status === "fulfilled") setOperationsHealth(operationsHealthResult.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void adminFetch("/api/admin/access").then((result) => setPermissions(result.access?.permissions || [])).catch(() => setPermissions([]));
  }, []);

  async function acknowledgeAlert(alertId: string) {
    setAcknowledgingAlert(alertId);
    try {
      await adminFetch("/api/admin/operations/alerts/" + alertId + "/acknowledge", { method: "POST" });
      setOperationalAlerts((current) => current.filter((alert) => alert._id !== alertId));
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : "Unable to acknowledge operational alert");
    } finally {
      setAcknowledgingAlert(null);
    }
  }

  if (loading && !data) {
    return <div role="status" aria-live="polite" className="flex min-h-[60vh] items-center justify-center"><RefreshCcw className="animate-spin text-blue-600" /><span className="sr-only">Loading admin dashboard</span></div>;
  }

  if (error && !data) {
    return (
      <div className="card flex flex-col items-start gap-4 p-6">
        <p role="alert" className="text-red-600">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-secondary" disabled={loading}>
          <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {loading ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
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
    [Users, "Total users", s.users, String(s.activeUsers || 0) + " active", "users.read"],
    [BookOpen, "Courses", s.courses, String(s.published || 0) + " published", "courses.read"],
    [CreditCard, "Subscribers", s.activeSubscribers, String(s.pastDueSubscribers || 0) + " past due", "billing.read"],
    [IndianRupee, "Net revenue", money(s.netRevenue ?? s.revenue), "Gross " + money(s.grossRevenue) + " · refunds " + money(s.processedRefunds), "billing.read"],
  ];
  const visibleCards = cards.filter(([, , , , permission]: AdminDashboardRecord) => permissions.includes(permission));

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Command center"
        title="Platform overview"
        description="Monitor content, learners, revenue, operations and platform health from one place."
        actions={<div className="flex flex-wrap items-center gap-2">
          {loading && data && <span role="status" aria-live="polite" className="text-xs text-blue-600">Refreshing dashboard…</span>}
          {lastUpdated && <span role="status" aria-live="polite" className="text-xs text-slate-500">Updated {lastUpdated.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>}
          <button type="button" onClick={() => void load()} className="btn-secondary" disabled={loading} aria-label={loading ? "Refreshing admin dashboard" : "Refresh admin dashboard"}>
            <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
          </button>
          {permissions.includes("courses.read") && <Link to="/admin/courses" className="btn-primary">Manage content <ArrowRight className="h-4 w-4" /></Link>}
        </div>}
      />

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <section className={"mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 " + (operationsHealth?.overallStatus === "healthy" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")} aria-live="polite">
        <div className="flex items-center gap-3">
          {operationsHealth?.overallStatus === "healthy" ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
          <div><p className="text-sm font-bold">{operationsHealth?.overallStatus === "healthy" ? "Operations healthy" : "Needs attention"}</p><p className="text-xs text-slate-600">Worker: {operationsHealth?.worker?.status || "unknown"} · failed webhooks: {operationsHealth?.queues?.webhooks?.failed ?? "—"} · failed deliveries: {Number(operationsHealth?.queues?.emailDelivery?.failed || 0) + Number(operationsHealth?.queues?.pushDelivery?.failed || 0)}</p></div>
        </div>
        <Link to="/admin/operations" className="btn-secondary">Open system operations <ArrowRight className="h-4 w-4" /></Link>
      </section>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleCards.map(([Icon, label, value, sub]: AdminDashboardRecord) => (
          <AdminCard className="admin-stat-card" key={label}>
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Icon className="h-5 w-5" /></div>
              <span className="text-xs text-slate-400">{sub}</span>
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-950">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </AdminCard>
        ))}
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div><h2 className="font-bold text-slate-900">Needs attention</h2><p className="mt-1 text-xs text-slate-500">Open background-worker and platform issues that need acknowledgement.</p></div>
          <div className="flex items-center gap-3"><AdminBadge tone={operationalAlerts.length ? "warning" : "success"}>{operationalAlerts.length} open</AdminBadge><Link to="/admin/operations" className="text-xs font-bold text-blue-600">View all</Link></div>
        </div>
        {alertsError && <p role="status" aria-live="polite" className="border-b border-slate-100 p-4 text-sm text-amber-700">{alertsError}</p>}
        {operationalAlerts.length ? (
          <div className="divide-y divide-slate-100">
            {operationalAlerts.map((alert: AdminDashboardRecord) => (
              <div key={alert._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <AlertTriangle className={"h-5 w-5 shrink-0 " + (alert.severity === "critical" ? "text-red-600" : "text-amber-600")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{alert.title || alert.key || "Operational alert"}</p>
                  <p className="mt-1 text-xs text-slate-500">{alert.message || alert.source || "Background operation reported an issue"} · seen {alert.occurrenceCount || 1} time(s)</p>
                  <p className="mt-1 text-[11px] text-slate-400">{alert.lastSeenAt ? new Date(alert.lastSeenAt).toLocaleString() : "Timestamp unavailable"}</p>
                </div>
                {permissions.includes("operations.manage") && <button type="button" className="btn-secondary shrink-0" disabled={acknowledgingAlert === alert._id} onClick={() => void acknowledgeAlert(alert._id)}>
                  {acknowledgingAlert === alert._id ? "Acknowledging…" : "Acknowledge"}
                </button>}
              </div>
            ))}
          </div>
        ) : (
          !alertsError && <p className="p-5 text-sm text-slate-500">No open operational alerts.</p>
        )}
      </section>

      <div className="mt-6">
        <AdminTabs
          ariaLabel="Dashboard work areas"
          value={dashboardView}
          onChange={setDashboardView}
          items={[
            { value: "overview", label: "Overview" },
            ...(permissions.includes("billing.read") ? [{ value: "finance" as const, label: "Finance activity" }] : []),
            ...(permissions.includes("courses.read") ? [{ value: "learning" as const, label: "Learning performance" }] : []),
            ...(permissions.includes("audit.read") ? [{ value: "governance" as const, label: "Admin activity" }] : []),
          ]}
        />
      </div>

      {dashboardView === "overview" && <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {permissions.includes("users.read") && <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div><h2 className="font-bold text-slate-900">Recent users</h2><p className="mt-1 text-xs text-slate-500">Newest accounts and access state.</p></div>
            <Link to="/admin/users" className="text-xs font-bold text-blue-600 hover:text-blue-700">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {(data?.recentUsers || []).map((user: AdminDashboardRecord) => (
              <div key={user._id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600">{user.name?.[0]?.toUpperCase() || "U"}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
                <div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-600">{user.authProvider === "google" ? "Google" : "Email"}</p><p className="text-[11px] text-slate-400">{user.emailVerified ? "Verified" : "Pending"}</p></div>
                <span className={"badge " + (user.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{user.isActive ? "Active" : "Disabled"}</span>
              </div>
            ))}
            {!data?.recentUsers?.length && <p className="p-5 text-sm text-slate-500">No user accounts to display yet.</p>}
          </div>
        </section>}

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
      </div>}

      {(dashboardView === "finance" || dashboardView === "learning") && <div className="mt-6 grid gap-6">
        {dashboardView === "finance" && permissions.includes("billing.read") && <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Recent payments</h2><p className="mt-1 text-xs text-slate-500">Latest billing activity.</p></div><Link to="/admin/billing" className="text-xs font-bold text-blue-600">Billing <ArrowRight className="inline h-3 w-3" /></Link></div>
          <div className="divide-y divide-slate-100">
            {(data?.recentPayments || []).map((payment: AdminDashboardRecord) => (
              <div key={payment._id} className="flex items-center gap-3 p-4">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{payment.user?.name || "Unknown user"}</p><p className="text-xs text-slate-500">{payment.status} · {payment.provider}</p></div>
                <span className="text-sm font-bold">{money(payment.amount)}</span>
              </div>
            ))}
            {!data?.recentPayments?.length && <p className="p-5 text-sm text-slate-500">No payment activity to display yet.</p>}
          </div>
        </section>}

        {dashboardView === "learning" && permissions.includes("courses.read") && <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Top courses</h2><p className="mt-1 text-xs text-slate-500">Highest enrollment counts.</p></div><Link to="/admin/courses" className="text-xs font-bold text-blue-600">Content <ArrowRight className="inline h-3 w-3" /></Link></div>
          <div className="divide-y divide-slate-100">
            {(data?.topCourses || []).map((course: AdminDashboardRecord, index: number) => (
              <div key={course._id || index} className="flex items-center gap-3 p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">#{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{course.title || "Untitled course"}</span>
                <span className="text-xs font-bold text-slate-500">{course.enrollments} enrolled</span>
              </div>
            ))}
            {!data?.topCourses?.length && <p className="p-5 text-sm text-slate-500">No enrollment data yet.</p>}
          </div>
        </section>}
      </div>}

      {dashboardView === "governance" && permissions.includes("audit.read") && <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Recent admin activity</h2><p className="mt-1 text-xs text-slate-500">Sensitive operational changes are audited.</p></div><Link to="/admin/audit" className="text-xs font-bold text-blue-600">Open audit log</Link></div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {(data?.recentAudit || []).map((log: AdminDashboardRecord) => (
            <div key={log._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="truncate font-mono text-xs font-bold text-slate-700">{log.action}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{log.actor?.email || "system"}</p>
              <p className="mt-2 text-[11px] text-slate-400">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</p>
            </div>
          ))}
          {!data?.recentAudit?.length && <p className="text-sm text-slate-500">No recent admin actions.</p>}
        </div>
      </section>}
    </div>
  );
}
