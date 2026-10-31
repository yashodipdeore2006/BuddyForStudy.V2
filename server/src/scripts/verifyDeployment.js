import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const API_PATHS = [
  "/health",
  "/api/health/ready",
  "/api/billing/plans",
  "/api/auth/google/config",
];
const FRONTEND_PATHS = ["/", "/login", "/pricing"];
const REQUEST_TIMEOUT_MS = 10_000;

function parsePublicHttpsUrl(value, variableName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(variableName + " is required for deployment verification.");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(variableName + " must be a valid absolute HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(variableName + " must be an HTTPS URL without credentials, query, or fragment.");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(variableName + " must not point to a loopback host.");
  }
  return url;
}

async function readJson(response, path) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(path + " did not return JSON.");
  }
  try {
    return await response.json();
  } catch {
    throw new Error(path + " returned malformed JSON.");
  }
}

async function request(fetchImpl, url, options = {}) {
  return fetchImpl(url, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Run a strict production smoke check against both independently deployed
 * services. A missing frontend URL, failed readiness check, unexpected CORS
 * response, redirect, or non-SPA deep link is a hard failure.
 */
export async function verifyDeployment({
  deploymentUrl,
  frontendDeploymentUrl,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A Fetch-compatible implementation is required.");

  const api = parsePublicHttpsUrl(deploymentUrl, "DEPLOYMENT_URL");
  const frontend = parsePublicHttpsUrl(frontendDeploymentUrl, "FRONTEND_DEPLOYMENT_URL");
  const expectedOrigin = frontend.origin;

  for (const path of API_PATHS) {
    const response = await request(fetchImpl, new URL(path, api.origin).toString(), {
      headers: { Accept: "application/json", Origin: expectedOrigin },
    });
    if (!response.ok) throw new Error("API check " + path + " failed with HTTP " + response.status + ".");
    const body = await readJson(response, path);
    if (body.success === false) throw new Error("API check " + path + " returned an unsuccessful response.");
    if (path === "/health" && body.status !== "healthy") {
      throw new Error("API liveness check returned an unexpected status.");
    }
    if (path === "/api/health/ready" && (body.status !== "ready" || body.database !== "connected")) {
      throw new Error("API readiness check did not confirm a connected database.");
    }
    if (path === "/api/auth/google/config" && typeof body.enabled !== "boolean") {
      throw new Error("Google OAuth config endpoint returned an invalid configuration response.");
    }
    if (path === "/api/health/ready") {
      const allowedOrigin = response.headers?.get?.("access-control-allow-origin");
      if (allowedOrigin !== expectedOrigin) {
        throw new Error("API CORS did not allow the configured frontend origin.");
      }
    }
    logger.log?.("PASS API", path);
  }

  for (const path of FRONTEND_PATHS) {
    const response = await request(fetchImpl, new URL(path, frontend.origin).toString(), {
      headers: { Accept: "text/html" },
    });
    const contentType = response.headers?.get?.("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      throw new Error("Frontend route " + path + " failed SPA smoke check (HTTP " + response.status + ").");
    }
    logger.log?.("PASS frontend", path);
  }

  logger.log?.("Deployment verification passed:", api.origin, frontend.origin);
  return { apiOrigin: api.origin, frontendOrigin: frontend.origin, apiChecks: API_PATHS.length, frontendChecks: FRONTEND_PATHS.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  verifyDeployment({
    deploymentUrl: process.env.DEPLOYMENT_URL,
    frontendDeploymentUrl: process.env.FRONTEND_DEPLOYMENT_URL,
  }).catch((error) => {
    console.error("Deployment verification failed:", String(error?.message || "Unknown error").slice(0, 500));
    process.exitCode = 1;
  });
}
