export function getReminderClock(date, timezone) {
  const makeParts = (timeZone) => new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  let parts;
  try { parts = makeParts(timezone || "Asia/Kolkata"); }
  catch { parts = makeParts("UTC"); }
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { ...values, hour: Number(values.hour), dateKey: values.year + "-" + values.month + "-" + values.day };
}

export function isWithinQuietHours(hour, quietHoursStart = 22, quietHoursEnd = 8) {
  const current = Number(hour), start = Number(quietHoursStart), end = Number(quietHoursEnd);
  if (![current, start, end].every(Number.isInteger) || current < 0 || current > 23 || start < 0 || start > 23 || end < 0 || end > 23) return false;
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function isReminderHourDue(date, timezone, reminderHour, quietHoursStart = 22, quietHoursEnd = 8) {
  const clock = getReminderClock(date, timezone);
  return clock.hour === Number(reminderHour) && !isWithinQuietHours(clock.hour, quietHoursStart, quietHoursEnd);
}

export function hasBeenInactive(now, lastActivity, inactiveDays) {
  if (!lastActivity) return false;
  const activityTime = new Date(lastActivity).getTime();
  if (!Number.isFinite(activityTime)) return false;
  const threshold = Math.max(1, Number(inactiveDays) || 1) * 24 * 60 * 60 * 1000;
  return now.getTime() - activityTime >= threshold;
}

export function learningReminderEventKey(userId, localDateKey) {
  return "learning-reminder:" + String(userId) + ":" + String(localDateKey);
}

export function getSubscriptionExpiryReminderWindow(now, daysBefore = 3, toleranceMs = 60 * 60 * 1000) {
  const days = Math.max(1, Math.min(14, Math.trunc(Number(daysBefore) || 3)));
  const target = now.getTime() + days * 24 * 60 * 60 * 1000;
  return { start: new Date(target - toleranceMs), end: new Date(target + toleranceMs) };
}

export function subscriptionExpiryReminderEventKey(subscriptionId, periodEnd) {
  const date = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
  const periodKey = Number.isNaN(date.getTime()) ? "unknown" : date.toISOString();
  return "subscription-expiring:" + String(subscriptionId) + ":" + periodKey;
}

