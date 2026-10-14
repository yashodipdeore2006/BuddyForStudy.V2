import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BookOpen, TrendingUp, Award, Info, CreditCard, CheckCheck, Loader2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

const iconByType: Record<string, typeof Bell> = {
  course: BookOpen,
  billing: CreditCard,
  promotion: TrendingUp,
  security: Award,
  system: Bell,
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = async () => {
    setError("");
    try {
      const data = await apiFetch("/api/notifications?limit=100");
      setNotifications(data.notifications || []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const markRead = async (notificationId: string) => {
    try {
      const data = await apiFetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
      });
      setNotifications((items) =>
        items.map((item) => (item._id === notificationId ? data.notification : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notification as read.");
    }
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    setMarkingAll(true);
    try {
      await apiFetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifications((items) => items.map((item) => ({ ...item, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  const hasNotifications = useMemo(() => notifications.length > 0, [notifications]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Notifications"
        subtitle="Stay updated on your learning activity and platform announcements."
        action={unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={markingAll}
            className="btn-secondary"
          >
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark all read
          </button>
        ) : undefined}
      />

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="card flex min-h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : !hasNotifications ? (
          <div className="card">
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="No notifications yet"
              description="You'll see updates about your courses, projects, and platform announcements here."
              action={
                <Link to="/courses" className="btn-primary">
                  Browse Courses
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const Icon = iconByType[notification.type] || Info;
              const unread = !notification.readAt;

              const content = (
                <>
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${unread ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className={`text-sm ${unread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                        {notification.title}
                      </h3>
                      <span className="flex-shrink-0 text-xs text-slate-400">
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{notification.message}</p>
                  </div>
                  {unread && <span className="mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-blue-600" />}
                </>
              );

              if (notification.link) {
                return (
                  <Link
                    key={notification._id}
                    to={notification.link}
                    onClick={() => {
                      if (unread) void markRead(notification._id);
                    }}
                    className="card flex items-start gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={notification._id}
                  type="button"
                  onClick={() => unread && void markRead(notification._id)}
                  className="card flex w-full items-start gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {content}
                </button>
              );
            })}

            <div className="card flex items-start gap-4 border-dashed border-2 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <Info className="h-5 w-5" />
              </div>
              <p className="text-sm leading-6 text-slate-500">
                Notifications are scoped to your account and are never exposed to other users.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
