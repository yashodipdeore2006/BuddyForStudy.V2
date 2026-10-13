import { OperationalAlert } from "../models/OperationalAlert.js";
import { AuditLog } from "../models/AuditLog.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

export async function operationalAlerts(req, res, next) {
  try {
    const status = ["open", "acknowledged", "resolved"].includes(String(req.query.status || "")) ? String(req.query.status) : "";
    const filter = status ? { status } : {};
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const [alerts, openCount] = await Promise.all([
      OperationalAlert.find(filter).populate("acknowledgedBy", "name email").sort({ lastSeenAt: -1 }).limit(limit).lean(),
      OperationalAlert.countDocuments({ status: "open" })
    ]);
    return success(res, { alerts, openCount });
  } catch (error) { next(error); }
}

export async function acknowledgeOperationalAlert(req, res, next) {
  try {
    if (!isValidObjectId(req.params.alertId)) return failure(res, "Invalid alertId", 400);
    const alert = await OperationalAlert.findById(req.params.alertId);
    if (!alert) return failure(res, "Operational alert not found", 404);
    if (alert.status === "resolved") return failure(res, "Resolved alerts cannot be acknowledged", 409);
    const before = { status: alert.status, severity: alert.severity, occurrenceCount: alert.occurrenceCount };
    alert.status = "acknowledged";
    alert.acknowledgedBy = req.user?.user?._id || null;
    alert.acknowledgedAt = new Date();
    await alert.save();
    await AuditLog.create({
      actor: req.user?.user?._id || null,
      action: "operational_alert.acknowledged",
      targetType: "OperationalAlert",
      targetId: String(alert._id),
      reason: "Admin acknowledged operational alert",
      before,
      after: { status: alert.status, severity: alert.severity, occurrenceCount: alert.occurrenceCount },
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get("user-agent") || "").slice(0, 500)
    });
    return success(res, { alert }, "Operational alert acknowledged");
  } catch (error) { next(error); }
}
