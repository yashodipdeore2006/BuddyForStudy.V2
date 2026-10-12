const SENSITIVE_KEY = /password|secret|token|authorization|cookie|api.?key|client.?secret|private.?key|smtp.?pass|webhook.?secret|credential/i;
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;

export function sanitizeAuditSnapshot(value, depth = 0) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (value instanceof Date) return value.toISOString();
  if (depth >= 6) return "[truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditSnapshot(item, depth + 1));
  }

  if (typeof value !== "object") return String(value).slice(0, MAX_STRING_LENGTH);

  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeAuditSnapshot(item, depth + 1);
  }
  return output;
}
