import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ExternalLink, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { adminFetch } from "@/lib/adminApi";
import { AdminAlert, AdminBadge, AdminButton, AdminCard, AdminEmptyState, AdminPageHeader, AdminSkeleton } from "@/components/admin/AdminUI";

type AdminNotification = {
  _id: string;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  createdAt: string;
  readAt?: string | null;
  metadata?: { adminAlert?: boolean; severity?: string; requiredPermission?: string } | null;
};
type NotificationResponse = { notifications?: AdminNotification[]; unreadCount?: number };

function dateLabel(value?: string) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}
function severityTone(value?: string): "danger" | "warning" | "info" | "neutral" {
  if (value === "critical") return "danger";
  if (value === "warning") return "warning";
  if (value === "info") return "info";
  return "neutral";
}
function safeAdminLink(value?: string | null) {
  if (!value || (!value.startsWith("/admin/") && value !== "/admin")) return "/admin";
  return value;
}

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/notifications?limit=100") as NotificationResponse;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load admin notifications.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const markRead = async (item: AdminNotification) => {
    if (item.readAt) return;
    try {
      const data = await adminFetch("/api/notifications/" + encodeURIComponent(item._id) + "/read", { method: "PATCH" });
      const updated = data.notification as AdminNotification | undefined;
      setNotifications((items) => items.map((entry) => entry._id === item._id ? (updated || { ...entry, readAt: new Date().toISOString() }) : entry));
      if (data.wasUnread === true) setUnreadCount((value) => Math.max(0, value - 1));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to mark notification as read."); }
  };
  const markAllRead = async () => {
    if (!unreadCount) return;
    setMarkingAll(true); setError("");
    try {
      await adminFetch("/api/notifications/read-all", { method: "PATCH" });
      const readAt = new Date().toISOString();
      setNotifications((items) => items.map((item) => item.readAt ? item : { ...item, readAt }));
      setUnreadCount(0);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to mark notifications as read."); }
    finally { setMarkingAll(false); }
  };
  const visible = useMemo(() => notifications.filter((item) => filter === "all" || !item.readAt), [notifications, filter]);
  const criticalUnread = useMemo(() => notifications.filter((item) => !item.readAt && item.metadata?.severity === "critical").length, [notifications]);

  return <div className="space-y-6">
    <AdminPageHeader eyebrow="Operations" title="Admin notifications" description="Billing, support, provider, and security alerts routed to your administrator permissions." actions={<div className="flex flex-wrap gap-2"><AdminButton variant="secondary" icon={<RefreshCcw size={16} />} onClick={() => void load()}>Refresh</AdminButton><AdminButton variant="primary" icon={<CheckCheck size={16} />} loading={markingAll} disabled={!unreadCount} onClick={() => void markAllRead()}>Mark all read</AdminButton></div>} />
    <div className="grid gap-3 sm:grid-cols-3">
      <AdminCard><p className="text-sm text-slate-500">Unread notifications</p><p className="mt-2 text-3xl font-semibold">{unreadCount}</p></AdminCard>
      <AdminCard><p className="text-sm text-slate-500">Loaded alerts</p><p className="mt-2 text-3xl font-semibold">{notifications.length}</p></AdminCard>
      <AdminCard><p className="text-sm text-slate-500">Critical unread</p><p className="mt-2 text-3xl font-semibold">{criticalUnread}</p></AdminCard>
    </div>
    {error && <AdminAlert tone="danger" title="Notification request failed">{error}</AdminAlert>}
    <AdminCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">Alert inbox</h2><p className="mt-1 text-sm text-slate-500">Only notifications belonging to your signed-in admin account appear here.</p></div>
        <div className="flex gap-2" role="group" aria-label="Filter notifications">
          <AdminButton size="sm" variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>All</AdminButton>
          <AdminButton size="sm" variant={filter === "unread" ? "primary" : "secondary"} onClick={() => setFilter("unread")}>Unread ({unreadCount})</AdminButton>
        </div>
      </div>
      {loading ? <AdminSkeleton rows={4} /> : visible.length === 0
        ? <AdminEmptyState icon={<Bell size={22} />} title={filter === "unread" ? "You’re all caught up" : "No admin notifications yet"} description={filter === "unread" ? "New alerts for your administrator permissions will appear here." : "Operational alerts will appear here when relevant events need administrator attention."} />
        : <div className="divide-y divide-slate-100">{visible.map((item) => {
          const severity = item.metadata?.severity || "info";
          const target = safeAdminLink(item.link);
          return <article key={item._id} className={"flex flex-col gap-3 py-4 sm:flex-row sm:items-start " + (!item.readAt ? "bg-slate-50/70 " : "")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3>{!item.readAt && <AdminBadge tone="info">Unread</AdminBadge>}<AdminBadge tone={severityTone(severity)}>{severity}</AdminBadge></div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.message}</p>
              <p className="mt-2 text-xs text-slate-500">{dateLabel(item.createdAt)}{item.metadata?.requiredPermission ? " · Permission: " + item.metadata.requiredPermission : ""}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link className="admin-button admin-button--secondary admin-button--sm" to={target} onClick={() => { if (!item.readAt) void markRead(item); }}><ExternalLink size={14} />Open record</Link>
              {!item.readAt && <AdminButton size="sm" variant="ghost" onClick={() => void markRead(item)}>Mark read</AdminButton>}
            </div>
          </article>;
        })}</div>}
    </AdminCard>
  </div>;
}
