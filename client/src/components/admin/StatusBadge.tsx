import { AdminBadge } from "./AdminUI";

export type StatusDomain = "user" | "course" | "enrollment" | "enrollmentSource" | "payment" | "subscription" | "refund" | "paymentIssue" | "notificationDelivery" | "webhook" | "alertSeverity" | "alertStatus" | "announcement" | "review";
const STATUS_MAP: Record<StatusDomain, Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }>> = {
  user: { active: { label: "Active", tone: "success" }, inactive: { label: "Inactive", tone: "neutral" } },
  course: { published: { label: "Published", tone: "success" }, draft: { label: "Draft", tone: "warning" }, archived: { label: "Archived", tone: "neutral" } },
  enrollment: { active: { label: "Active", tone: "info" }, completed: { label: "Completed", tone: "success" }, cancelled: { label: "Cancelled", tone: "neutral" } },
  enrollmentSource: { self: { label: "Self", tone: "neutral" }, admin: { label: "Admin", tone: "info" } },
  payment: { paid: { label: "Paid", tone: "success" }, created: { label: "Created", tone: "neutral" }, pending: { label: "Pending", tone: "warning" }, failed: { label: "Failed", tone: "danger" }, refunded: { label: "Refunded", tone: "info" }, partially_refunded: { label: "Partially refunded", tone: "info" }, cancelled: { label: "Cancelled", tone: "neutral" } },
  subscription: { active: { label: "Active", tone: "success" }, trialing: { label: "Trialing", tone: "info" }, past_due: { label: "Past due", tone: "warning" }, cancelled: { label: "Cancelled", tone: "neutral" }, expired: { label: "Expired", tone: "neutral" } },
  refund: { pending: { label: "Pending", tone: "warning" }, approved: { label: "Approved", tone: "info" }, rejected: { label: "Rejected", tone: "danger" }, processed: { label: "Processed", tone: "success" } },
  paymentIssue: { open: { label: "Open", tone: "danger" }, in_review: { label: "In review", tone: "warning" }, resolved: { label: "Resolved", tone: "success" }, closed: { label: "Closed", tone: "neutral" } },
  notificationDelivery: { sent: { label: "Sent", tone: "success" }, pending: { label: "Pending", tone: "warning" }, failed: { label: "Failed", tone: "danger" }, skipped: { label: "Skipped", tone: "neutral" } },
  webhook: { processed: { label: "Processed", tone: "success" }, processing: { label: "Processing", tone: "info" }, failed: { label: "Failed", tone: "danger" } },
  alertSeverity: { info: { label: "Info", tone: "info" }, warning: { label: "Warning", tone: "warning" }, critical: { label: "Critical", tone: "danger" } },
  alertStatus: { open: { label: "Open", tone: "danger" }, acknowledged: { label: "Acknowledged", tone: "warning" }, resolved: { label: "Resolved", tone: "success" } },
  announcement: { draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Scheduled", tone: "info" }, sending: { label: "Sending", tone: "info" }, sent: { label: "Sent", tone: "success" }, failed: { label: "Failed", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" } },
  review: { visible: { label: "Visible", tone: "success" }, hidden: { label: "Hidden", tone: "neutral" }, reported: { label: "Reported", tone: "warning" } }
};

export function StatusBadge({ domain, value, label }: { domain: StatusDomain; value: string | boolean; label?: string }) {
  const key = typeof value === "boolean" ? (value ? "active" : "inactive") : String(value || "").toLowerCase();
  const status = STATUS_MAP[domain][key] || { label: label || String(value || "Unknown").replace(/_/g, " "), tone: "neutral" as const };
  return <AdminBadge tone={status.tone}>{label || status.label}</AdminBadge>;
}
