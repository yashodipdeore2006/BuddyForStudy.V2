import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const API_PATHS = [
  "/api/health",
  "/api/health/ready",
  "/api/billing/plans",
  "/api/auth/google/config",
];
const FRONTEND_PATHS = ["/", "/login", "/pricing"];
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 750;
const WORKER_MODES = new Set(["inline", "standalone", "disabled"]);

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

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status >= 500;
}

async function request(fetchImpl, url, options = {}, {
  timeoutMs = REQUEST_TIMEOUT_MS,
  retryAttempts = DEFAULT_RETRY_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  sleepImpl = sleep,
} = {}) {
  let lastError;
  const pathname = new URL(url).pathname;

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!isRetryableStatus(response.status) || attempt === retryAttempts) return response;
      lastError = new Error("HTTP " + response.status);
    } catch (error) {
      lastError = error;
      if (attempt === retryAttempts) break;
    }

    await sleepImpl(retryDelayMs * (2 ** attempt));
  }

  throw new Error(
    "Request to " + pathname + " failed after " + (retryAttempts + 1) +
    " attempts: " + String(lastError?.message || "request failed").slice(0, 200)
  );
}

function validateRetryConfiguration(retryAttempts, retryDelayMs, requestTimeoutMs) {
  if (!Number.isInteger(retryAttempts) || retryAttempts < 0 || retryAttempts > 5) {
    throw new TypeError("retryAttempts must be an integer from 0 to 5.");
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 10_000) {
    throw new TypeError("retryDelayMs must be between 0 and 10000 milliseconds.");
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60_000) {
    throw new TypeError("requestTimeoutMs must be between 1 and 60000 milliseconds.");
  }
}

function verifyOperationsHealth(body, expectedWorkerMode) {
  if (!body || body.success === false || !body.background || typeof body.background !== "object") {
    throw new Error("Authenticated operations health returned an invalid response.");
  }

  const background = body.background;
  if (background.mode !== expectedWorkerMode) {
    throw new Error("Background worker mode does not match EXPECTED_BACKGROUND_WORKER_MODE.");
  }

  const expectedStatus = expectedWorkerMode === "disabled" ? "disabled" : "healthy";
  if (body.status !== expectedStatus || background.status !== expectedStatus) {
    throw new Error("Background operations are not healthy for the configured worker mode.");
  }

  if (!background.worker || typeof background.worker !== "object") {
    throw new Error("Background operations response is missing worker heartbeat details.");
  }
  if (background.worker.mode !== expectedWorkerMode) {
    throw new Error("Worker heartbeat mode does not match EXPECTED_BACKGROUND_WORKER_MODE.");
  }
  if (background.worker.status !== expectedStatus) {
    throw new Error("Worker heartbeat is not healthy for the configured worker mode.");
  }
  if (!Array.isArray(background.jobs)) {
    throw new Error("Background operations response is missing job lease details.");
  }
  if (expectedWorkerMode !== "disabled" && background.jobs.some((job) => job.status === "expired")) {
    throw new Error("One or more background job leases are expired.");
  }
}

/**
 * Run read-only smoke checks against independently deployed API and frontend
 * services. Requests are bounded and retry transient cold-start/network/5xx
 * failures. An operations check is added when an admin token is supplied or
 * REQUIRE_OPERATIONS_HEALTH=true; it performs GET only and never logs the token.
 */
export async function verifyDeployment({
  deploymentUrl,
  frontendDeploymentUrl,
  operationsAdminToken = "",
  expectedGoogleClientId = "",
  expectedBackgroundWorkerMode = "",
  expectedReleaseSha = "",
  requireOperationsHealth = false,
  fetchImpl = globalThis.fetch,
  logger = console,
  retryAttempts = DEFAULT_RETRY_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  sleepImpl = sleep,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A Fetch-compatible implementation is required.");
  validateRetryConfiguration(retryAttempts, retryDelayMs, requestTimeoutMs);

  const api = parsePublicHttpsUrl(deploymentUrl, "DEPLOYMENT_URL");
  const frontend = parsePublicHttpsUrl(frontendDeploymentUrl, "FRONTEND_DEPLOYMENT_URL");
  const expectedOrigin = frontend.origin;
  const token = typeof operationsAdminToken === "string" ? operationsAdminToken.trim() : "";
  const workerMode = String(expectedBackgroundWorkerMode || "").trim().toLowerCase();
  const releaseSha = String(expectedReleaseSha || "").trim().toLowerCase();
  const shouldCheckOperations = Boolean(token) || requireOperationsHealth;

  if (releaseSha && !/^[a-f0-9]{40}$/.test(releaseSha)) {
    throw new TypeError("EXPECTED_RELEASE_SHA must be a full 40-character Git commit SHA.");
  }

  if (requireOperationsHealth && !token) {
    throw new Error("OPERATIONS_ADMIN_TOKEN is required when REQUIRE_OPERATIONS_HEALTH=true.");
  }
  if (shouldCheckOperations && !WORKER_MODES.has(workerMode)) {
    throw new Error("EXPECTED_BACKGROUND_WORKER_MODE must be inline, standalone, or disabled when operations health is required.");
  }

  const requestOptions = { timeoutMs: requestTimeoutMs, retryAttempts, retryDelayMs, sleepImpl };

  for (const path of API_PATHS) {
    const response = await request(fetchImpl, new URL(path, api.origin).toString(), {
      headers: { Accept: "application/json", Origin: expectedOrigin },
    }, requestOptions);
    if (!response.ok) throw new Error("API check " + path + " failed with HTTP " + response.status + ".");
    const body = await readJson(response, path);
    if (body.success === false) throw new Error("API check " + path + " returned an unsuccessful response.");

    // The API liveness controller's current public contract is status="ok".
    if (path === "/api/health" && body.status !== "ok") {
      throw new Error("API liveness check returned an unexpected status.");
    }
    if (path === "/api/health" && releaseSha && body.releaseSha !== releaseSha) {
      throw new Error("API release SHA does not match EXPECTED_RELEASE_SHA.");
    }
    if (path === "/api/health/ready" && (body.status !== "ready" || body.database !== "connected")) {
      throw new Error("API readiness check did not confirm a connected database.");
    }
    if (path === "/api/auth/google/config") {
      if (typeof body.enabled !== "boolean") {
        throw new Error("Google OAuth config endpoint returned an invalid configuration response.");
      }
      const expectedClientId = String(expectedGoogleClientId || "").trim();
      if (expectedClientId && (body.enabled !== true || body.clientId !== expectedClientId)) {
        throw new Error("Google OAuth is not enabled with the expected client ID.");
      }
    }
    if (path === "/api/health/ready") {
      const allowedOrigin = response.headers?.get?.("access-control-allow-origin");
      if (allowedOrigin !== expectedOrigin) {
        throw new Error("API CORS did not allow the configured frontend origin.");
      }
    }
    logger.log?.("PASS API", path);
  }

  let operationsChecks = 0;
  if (shouldCheckOperations) {
    const path = "/api/health/operations";
    const response = await request(fetchImpl, new URL(path, api.origin).toString(), {
      headers: {
        Accept: "application/json",
        Origin: expectedOrigin,
        Authorization: "Bearer " + token,
      },
    }, requestOptions);
    if (!response.ok) {
      throw new Error("Authenticated operations health check failed with HTTP " + response.status + ".");
    }
    const body = await readJson(response, path);
    verifyOperationsHealth(body, workerMode);
    operationsChecks = 1;
    logger.log?.("PASS API", path);
  }

  for (const path of FRONTEND_PATHS) {
    const response = await request(fetchImpl, new URL(path, frontend.origin).toString(), {
      headers: { Accept: "text/html" },
    }, requestOptions);
    const contentType = response.headers?.get?.("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      throw new Error("Frontend route " + path + " failed SPA smoke check (HTTP " + response.status + ").");
    }
    logger.log?.("PASS frontend", path);
  }

  let releaseManifestChecks = 0;
  if (releaseSha) {
    const path = "/release.json";
    const response = await request(fetchImpl, new URL(path, frontend.origin).toString(), {
      headers: { Accept: "application/json" },
    }, requestOptions);
    if (!response.ok) {
      throw new Error("Frontend release manifest check failed with HTTP " + response.status + ".");
    }
    const manifest = await readJson(response, path);
    if (manifest.commit !== releaseSha) {
      throw new Error("Frontend release SHA does not match EXPECTED_RELEASE_SHA.");
    }
    releaseManifestChecks = 1;
    logger.log?.("PASS frontend release manifest", path);
  }

  logger.log?.("Deployment verification passed:", api.origin, frontend.origin);
  return {
    apiOrigin: api.origin,
    frontendOrigin: frontend.origin,
    apiChecks: API_PATHS.length,
    operationsChecks,
    frontendChecks: FRONTEND_PATHS.length,
    releaseSha: releaseSha || null,
    releaseManifestChecks,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  verifyDeployment({
    deploymentUrl: process.env.DEPLOYMENT_URL,
    frontendDeploymentUrl: process.env.FRONTEND_DEPLOYMENT_URL,
    operationsAdminToken: process.env.OPERATIONS_ADMIN_TOKEN,
    expectedGoogleClientId: process.env.EXPECTED_GOOGLE_CLIENT_ID,
    expectedBackgroundWorkerMode: process.env.EXPECTED_BACKGROUND_WORKER_MODE,
    expectedReleaseSha: process.env.EXPECTED_RELEASE_SHA,
    requireOperationsHealth: process.env.REQUIRE_OPERATIONS_HEALTH === "true",
  }).catch((error) => {
    console.error("Deployment verification failed:", String(error?.message || "Unknown error").slice(0, 500));
    process.exitCode = 1;
  });
}
