const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Production accepts only the configured client origin. Development also
 * accepts loopback origins on ephemeral ports, because Vite may select 5174,
 * 5175, etc. when its preferred port is occupied.
 */
export function isAllowedClientOrigin(origin, { nodeEnv = "development", clientUrl = "" } = {}) {
  // Requests without Origin are usually server-to-server or command-line checks.
  if (!origin) return true;

  const requestOrigin = parseOrigin(origin);
  if (!requestOrigin) return false;

  const configuredOrigin = parseOrigin(clientUrl);
  if (configuredOrigin && requestOrigin.origin === configuredOrigin.origin) return true;

  if (nodeEnv !== "production" &&
      requestOrigin.protocol === "http:" &&
      LOCAL_DEVELOPMENT_HOSTS.has(requestOrigin.hostname)) {
    return true;
  }

  return false;
}
