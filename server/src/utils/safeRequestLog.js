export function safeRequestLog(tokens, req, res) {
  const segments = String(req?.path || "/").split("/").filter(Boolean);
  const route = segments.length >= 2
    ? "/" + segments.slice(0, 2).join("/") + (segments.length > 2 ? "/*" : "")
    : "/" + (segments[0] || "");
  const responseTime = Number(tokens["response-time"](req, res) || 0);
  const status = Number(tokens.status(req, res) || res?.statusCode || 0);
  const rawLength = tokens.res(req, res, "content-length");
  const contentLength = rawLength && Number.isFinite(Number(rawLength)) ? Number(rawLength) : null;

  // Deliberately exclude query strings, request/response bodies, IPs, referers and user agents.
  return JSON.stringify({
    method: String(tokens.method(req, res) || "UNKNOWN").slice(0, 10),
    route,
    status,
    responseTimeMs: Number.isFinite(responseTime) ? responseTime : 0,
    contentLength
  });
}
