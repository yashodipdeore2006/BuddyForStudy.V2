/**
 * Parse a user-supplied public resource URL only when it uses HTTP(S).
 * Reject malformed URLs, script/file schemes, non-HTTP protocol prefixes,
 * missing hosts, and credential-bearing URLs that make links deceptive.
 */
export function parseSafeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}
