import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, ServerCog } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminBadge, AdminPageHeader } from "@/components/admin/AdminUI";

type Tab = "health" | "webhooks" | "outbox" | "deliveries" | "alerts" | "integrations" | "settings";
const tabs: { id: Tab; label: string }[] = [
  { id: "health", label: "System health" }, { id: "webhooks", label: "Webhooks" },
  { id: "outbox", label: "Audit outbox" }, { id: "deliveries", label: "Delivery log" },
  { id: "alerts", label: "Alerts" }, { id: "integrations", label: "Integrations" }, { id: "settings", label: "Typed settings" }
];
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";

export default function AdminOperations() {
  const [tab, setTab] = useState<Tab>("health");
  const [health, setHealth] = useState<any>(null);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [canManageOperations, setCanManageOperations] = useState(false);
  const [acknowledgingAlert, setAcknowledgingAlert] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const results = await Promise.allSettled([
        adminFetch("/api/admin/operations/system-health"),
        adminFetch("/api/admin/operations/webhooks?status=failed&limit=50"),
        adminFetch("/api/admin/operations/outbox?limit=50"),
        adminFetch("/api/admin/operations/delivery-log?limit=50"),
        adminFetch("/api/admin/operations/alerts?status=open&limit=100"),
        adminFetch("/api/admin/operations/settings-registry")
      ]);
      const failures: string[] = [];
      if (results[0].status === "fulfilled") setHealth(results[0].value); else failures.push("system health");
      if (results[1].status === "fulfilled") setWebhooks(results[1].value.events || []); else failures.push("webhooks");
      if (results[2].status === "fulfilled") setOutbox(results[2].value.items || []); else failures.push("audit outbox");
      if (results[3].status === "fulfilled") setDeliveries(results[3].value.deliveries || []); else failures.push("delivery log");
      if (results[4].status === "fulfilled") setAlerts(results[4].value.alerts || []); else failures.push("alerts");
      if (results[5].status === "fulfilled") setSettings(results[5].value.settings || []); else failures.push("settings registry");
      setLastUpdated(new Date().toISOString());
      if (failures.length) setError("Some operations data could not be loaded: " + failures.join(", ") + ". Check your role permissions and refresh.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load operations data."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void adminFetch("/api/admin/access")
      .then((result) => setCanManageOperations(Array.isArray(result.access?.permissions) && result.access.permissions.includes("operations.manage")))
      .catch(() => setCanManageOperations(false));
  }, []);
  async function acknowledgeAlert(alertId: string) {
    setAcknowledgingAlert(alertId);
    try {
      await adminFetch("/api/admin/operations/alerts/" + alertId + "/acknowledge", { method: "POST" });
      setAlerts((current) => current.filter((item) => item._id !== alertId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to acknowledge operational alert.");
    } finally {
      setAcknowledgingAlert(null);
    }
  }

  const worker = health?.worker;
  const healthy = worker?.status === "healthy";
  const queues = health?.queues || {};
  return <div className="mx-auto max-w-7xl">
    <AdminPageHeader eyebrow="Operations & safety" title="System operations" description="Inspect worker health, queue backlogs, webhook failures, delivery outcomes, alerts and typed platform settings."
      actions={<div className="flex items-center gap-3">{lastUpdated && <span className="text-xs text-slate-500">Updated {date(lastUpdated)}</span>}<button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading} aria-label="Refresh system operations"><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button></div>} />
    {error && <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    <section className={"mt-6 rounded-2xl border p-5 " + (healthy ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/80")} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={"rounded-xl p-3 " + (healthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}><ServerCog className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-wider">Worker heartbeat</p><h2 className="mt-1 text-xl font-extrabold">{healthy ? "Background worker healthy" : "Worker needs attention"}</h2><p className="mt-1 text-sm">Last heartbeat: {date(worker?.lastHeartbeatAt)} · age {worker?.heartbeatAgeSeconds ?? "unknown"}s · alert threshold {worker?.staleAfterSeconds ?? 300}s</p></div></div><AdminBadge tone={healthy ? "success" : "danger"}>{worker?.status || "unknown"}</AdminBadge></div>
      {worker?.lastError && <p className="mt-3 text-sm text-red-800">Last worker error: {worker.lastError}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Last maintenance start" value={date(worker?.lastMaintenanceStartedAt)} /><Metric label="Last maintenance completed" value={date(worker?.lastMaintenanceCompletedAt)} /><Metric label="Consecutive failures" value={String(worker?.consecutiveFailures ?? 0)} /></div>
    </section>
    <div className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2" role="tablist" aria-label="Operations sections">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={"shrink-0 rounded-xl px-3 py-2 text-sm font-semibold " + (tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {tab === "health" && <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Failed webhooks" value={String(queues.webhooks?.failed ?? "—")} warning={Number(queues.webhooks?.failed || 0) > 0} /><Metric label="Audit outbox pending" value={String(queues.auditOutbox?.pendingOrProcessing ?? "—")} warning={Number(queues.auditOutbox?.pendingOrProcessing || 0) > 0} /><Metric label="Failed email deliveries" value={String(queues.emailDelivery?.failed ?? "—")} warning={Number(queues.emailDelivery?.failed || 0) > 0} /><Metric label="Failed push deliveries" value={String(queues.pushDelivery?.failed ?? "—")} warning={Number(queues.pushDelivery?.failed || 0) > 0} /><Metric label="Queued email deliveries" value={String(queues.emailDelivery?.pending ?? "—")} /><Metric label="Queued push deliveries" value={String(queues.pushDelivery?.pending ?? "—")} /><Metric label="Processing webhooks" value={String(queues.webhooks?.processing ?? "—")} /><Metric label="Registered settings" value={String(health?.configuration?.registeredSettings ?? "—")} />
    </div>}
    {tab === "webhooks" && <DataSection title="Failed webhook events" description="Failed Razorpay webhook events are matched to a payment by provider payment/order identifier where possible.">{webhooks.map((item) => <div key={item.id} className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-[1.1fr_1fr_1.2fr]"><div><p className="font-semibold">{item.event}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{item.eventId}</p><p className="mt-1 text-xs text-slate-400">Updated {date(item.updatedAt)}</p></div><div><AdminBadge tone="danger">{item.status}</AdminBadge><p className="mt-2 text-xs text-slate-500">Order: {item.providerOrderId || "not recorded"}</p><p className="text-xs text-slate-500">Provider payment: {item.providerPaymentId || "not recorded"}</p></div><div className="rounded-xl bg-slate-50 p-3 text-sm">{item.payment ? <><p className="font-semibold">Payment linked · {item.payment.status}</p><p className="mt-1">{item.payment.user?.name || "Unknown user"} · {item.payment.currency} {Number(item.payment.amount || 0).toLocaleString("en-IN")}</p><p className="mt-1 break-all text-xs text-slate-500">Payment ID: {item.payment.id}</p></> : <p className="text-amber-700">No matching payment found for stored provider identifiers.</p>}</div></div>)}{!webhooks.length && <Empty message="No failed webhook events found." />}</DataSection>}
    {tab === "outbox" && <DataSection title="Audit outbox" description="Pending audit records waiting for retry. Payloads are intentionally not exposed here.">{outbox.map((item) => <div key={item.id} className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto]"><div><p className="font-semibold">{item.action} <span className="font-normal text-slate-500">· {item.targetType}</span></p><p className="mt-1 break-all font-mono text-xs text-slate-500">{item.eventId}</p><p className="mt-1 text-xs text-slate-500">Created {date(item.createdAt)} · next retry {date(item.nextAttemptAt)}</p>{item.lastError && <p className="mt-2 text-sm text-red-700">{item.lastError}</p>}</div><div className="flex items-center gap-2"><AdminBadge tone="warning">{item.status}</AdminBadge><span className="text-xs text-slate-500">{item.attempts} attempts</span></div></div>)}{!outbox.length && <Empty message="Audit outbox is clear." />}</DataSection>}
    {tab === "deliveries" && <DataSection title="Notification delivery log" description="Email and push outcomes with bounded error messages; recipient addresses and message bodies are omitted.">{deliveries.map((item) => <div key={item.id} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_1fr]"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.user?.name || "Unknown user"} · {item.type} · updated {date(item.updatedAt)}</p></div><div className="grid gap-2 sm:grid-cols-2"><DeliveryStatus label="Email" status={item.emailStatus} attempts={item.emailAttempts} error={item.emailError} /><DeliveryStatus label="Push" status={item.pushStatus} attempts={item.pushAttempts} error={item.pushError} /></div></div>)}{!deliveries.length && <Empty message="No delivery attempts to display." />}</DataSection>}
    {tab === "alerts" && <DataSection title="Open operational alerts" description="Investigate the underlying issue before acknowledgement.">{alerts.map((item) => <div key={item._id} className="flex flex-wrap items-start gap-3 border-b border-slate-100 p-4"><AlertTriangle className="mt-1 h-5 w-5 text-red-600" /><div className="min-w-0 flex-1"><p className="font-semibold">{item.key}</p><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-1 text-xs text-slate-400">{item.source} · last seen {date(item.lastSeenAt)} · {item.occurrenceCount} occurrence(s)</p></div><AdminBadge tone={item.severity === "critical" ? "danger" : "warning"}>{item.severity}</AdminBadge></div>)}{!alerts.length && <Empty message="No open operational alerts." />}</DataSection>}
    {tab === "integrations" && <div className="mt-5 grid gap-4 md:grid-cols-2">{Object.entries(health?.integrations || {}).map(([name, value]: [string, any]) => <div key={name} className="card p-5"><div className="flex items-center justify-between"><h3 className="font-bold capitalize">{name}</h3>{value.configured === false ? <AdminBadge tone="danger">Not configured</AdminBadge> : <AdminBadge tone="success">{value.configured === true ? "Configured" : value.connected ? "Connected" : "Available"}</AdminBadge>}</div>{value.missing?.length > 0 && <p className="mt-3 text-sm text-red-700">Missing variables: {value.missing.join(", ")}</p>}{value.connected === false && <p className="mt-2 text-sm text-amber-700">Database connectivity is not healthy.</p>}</div>)}</div>}
    {tab === "settings" && <DataSection title="Typed settings registry" description="Registered settings include their expected type and allowed range. Values are not displayed.">{settings.map((item) => <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><p className="font-mono text-sm font-semibold">{item.key}</p><p className="mt-1 text-sm text-slate-500">{item.description}</p><p className="mt-1 text-xs text-slate-400">Type: {item.type}{item.minimum !== undefined ? " · range " + item.minimum + "–" + item.maximum : ""}</p></div><div className="flex items-center gap-2"><AdminBadge tone={item.configured && item.valueMatchesType ? "success" : item.configured ? "danger" : "neutral"}>{item.configured ? item.valueMatchesType ? "Valid" : "Type mismatch" : "Using default"}</AdminBadge><span className="text-xs text-slate-400">{date(item.updatedAt)}</span></div></div>)}</DataSection>}
  </div>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div className={"card p-4 " + (warning ? "border-amber-200" : "")}><p className="text-xs font-semibold text-slate-500">{label}</p><p className={"mt-2 text-2xl font-extrabold " + (warning ? "text-amber-700" : "text-slate-900")}>{value}</p></div>; }
function DataSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="card mt-5 overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>{children}</section>; }
function Empty({ message }: { message: string }) { return <p className="p-8 text-center text-sm text-slate-500">{message}</p>; }
function DeliveryStatus({ label, status, attempts, error }: { label: string; status: string; attempts: number; error?: string }) { const tone = status === "failed" ? "danger" : status === "sent" ? "success" : "neutral"; return <div className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{label}</span><AdminBadge tone={tone}>{status}</AdminBadge></div><p className="mt-1 text-xs text-slate-500">{attempts || 0} attempts</p>{error && <p className="mt-1 text-xs text-red-700">{error}</p>}</div>; }
