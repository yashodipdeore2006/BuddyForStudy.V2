const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|token|api.?key|credential|email|phone|address|session|jwt|signature|payment|card|customer|user.?id)/i;

function scrubObject(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubObject(item, depth + 1));
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (["data", "body", "query_string", "cookies", "env"].includes(key.toLowerCase())) continue;
    clean[key] = scrubObject(item, depth + 1);
  }
  return clean;
}

function redactUrl(value) {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.origin + parsed.pathname;
  } catch {
    return value.split(/[?#]/, 1)[0].slice(0, 500);
  }
}

/**
 * Minimize PII and secret exposure in Sentry events. Keep stack frames,
 * exception types, and non-sensitive runtime context, but strip request
 * payloads, query strings, credentials, user identifiers, and raw exception
 * messages that may contain provider/database response data.
 */
export function sanitizeSentryEvent(event) {
  if (!event || typeof event !== "object") return event;
  const clean = { ...event };
  delete clean.user;
  delete clean.extra;
  if (clean.request && typeof clean.request === "object") {
    const request = { ...clean.request };
    request.url = redactUrl(request.url);
    delete request.data;
    delete request.query_string;
    delete request.cookies;
    delete request.env;
    const headers = request.headers && typeof request.headers === "object" ? request.headers : {};
    request.headers = Object.fromEntries(
      Object.entries(headers).filter(([key]) => ["content-type", "accept"].includes(key.toLowerCase()))
    );
    clean.request = request;
  }
  if (Array.isArray(clean.exception?.values)) {
    clean.exception = {
      ...clean.exception,
      values: clean.exception.values.map((item) => ({
        ...item,
        value: item?.value ? "[redacted exception message]" : item?.value,
        mechanism: item?.mechanism ? scrubObject(item.mechanism) : item?.mechanism
      }))
    };
  }
  if (clean.message) clean.message = "[redacted event message]";
  if (Array.isArray(clean.breadcrumbs)) {
    clean.breadcrumbs = clean.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      message: breadcrumb?.message ? "[redacted breadcrumb message]" : breadcrumb?.message,
      data: breadcrumb?.data ? scrubObject(breadcrumb.data) : breadcrumb?.data
    }));
  }
  if (clean.contexts) clean.contexts = scrubObject(clean.contexts);
  if (clean.tags) clean.tags = scrubObject(clean.tags);
  return clean;
}
