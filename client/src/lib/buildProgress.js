const TERMINAL_STATES = new Set(["ready", "low_confidence", "failed", "quota_limited", "unavailable"]);

/** Derive honest learner-facing progress from the async roadmap API. */
export function getBuildProgress(status = "queued", nodes = []) {
  const normalizedStatus = String(status || "queued").toLowerCase();
  const resourceNodes = (Array.isArray(nodes) ? nodes : []).filter((node) => node && node.type !== "quiz");
  const total = resourceNodes.length;
  const completed = resourceNodes.filter((node) => TERMINAL_STATES.has(String(node.state || "").toLowerCase())).length;
  const ready = resourceNodes.filter((node) => String(node.state || "").toLowerCase() === "ready").length;
  const attention = resourceNodes.filter((node) => ["low_confidence", "failed", "quota_limited", "unavailable"].includes(String(node.state || "").toLowerCase())).length;
  const remaining = Math.max(0, total - completed);
  let stage = "curriculum";
  if (normalizedStatus === "queued") stage = "queued";
  else if (normalizedStatus === "failed" || normalizedStatus === "cancelled") stage = "failed";
  else if (normalizedStatus === "ready") stage = "complete";
  else if (total > 0 && remaining === 0) stage = "finalizing";
  else if (total > 0) stage = "resources";
  return { stage, total, completed, ready, attention, remaining, progressValue: total > 0 ? Math.round((completed / total) * 100) : null, isIndeterminate: total === 0 && normalizedStatus !== "ready" };
}
