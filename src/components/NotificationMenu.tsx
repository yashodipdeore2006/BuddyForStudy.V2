import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, BookOpen, CheckCheck, CreditCard, Info, Loader2, Sparkles, TrendingUp, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { routes, resolveNotificationRoute } from "@/lib/routes";

const iconByType: Record<string, typeof Bell> = {
  course: BookOpen,
  billing: CreditCard,
  promotion: TrendingUp,
  security: Sparkles,
  system: Bell,
};

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type NotificationItem = {
  _id: string;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  read?: boolean;
  readAt?: string | null;
  isRead?: boolean;
  createdAt?: string;
  created_at?: string;
  actionUrl?: string;
  link?: string;
  metadata?: Record<string, unknown>;
};

export default function NotificationMenu() {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/notifications?limit=20");
      setNotifications(data.notifications || []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setExpandedId(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setExpandedId(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const markRead = async (notificationId: string) => {
    const current = notifications.find((item) => item._id === notificationId);
    if (!current || current.readAt) return;

    setNotifications((items) =>
      items.map((item) =>
        item._id === notificationId ? { ...item, readAt: new Date().toISOString() } : item
      )
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    try {
      await apiFetch(`/api/notifications/${notificationId}/read`, { method: "PATCH" });
    } catch {
      setNotifications((items) =>
        items.map((item) => (item._id === notificationId ? current : item))
      );
      setUnreadCount((count) => count + 1);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    await markRead(notification._id);

    const destination = resolveNotificationRoute(notification.link);
    if (destination) {
      setOpen(false);
      setExpandedId(null);
      navigate(destination);
      return;
    }

    setExpandedId((current) => current === notification._id ? null : notification._id);
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    setMarkingAll(true);
    try {
      await apiFetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifications((items) =>
        items.map((item) => ({ ...item, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100"
        aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[60] mt-3 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Notifications</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={markingAll}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                >
                  {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                  <span className="sr-only">Mark all as read</span>
                  {!markingAll && <span className="ml-1">Read all</span>}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="max-h-[min(62vh,390px)] overflow-y-auto p-2">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Important updates will appear here.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = notification.type ? iconByType[notification.type] || Info : Info;
                const unread = !notification.readAt;
                const expanded = expandedId === notification._id;

                return (
                  <button
                    key={notification._id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                      unread ? "bg-blue-50/70 hover:bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      unread ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className={`min-w-0 flex-1 text-xs leading-5 ${
                          unread ? "font-extrabold text-slate-900" : "font-bold text-slate-700"
                        }`}>
                          {notification.title}
                        </p>
                        <span className="flex-shrink-0 text-[10px] font-medium text-slate-400">
                          {formatRelativeTime(notification.createdAt ?? notification.created_at ?? "")}
                        </span>
                      </div>
                      <p className={`mt-0.5 text-[11px] leading-5 text-slate-500 ${
                        expanded ? "" : "line-clamp-2"
                      }`}>
                        {notification.message}
                      </p>
                      {notification.link && (
                        <span className="mt-1 inline-block text-[10px] font-extrabold text-blue-600">
                          Open
                        </span>
                      )}
                    </div>
                    {unread && <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-2">
            <Link
              to={routes.notifications()}
              onClick={() => {
                setOpen(false);
                setExpandedId(null);
              }}
              className="flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-extrabold text-blue-600 hover:bg-white"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
