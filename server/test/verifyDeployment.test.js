import test from "node:test";
import assert from "node:assert/strict";
import { verifyDeployment } from "../src/scripts/verifyDeployment.js";

const apiOrigin = "https://api.buddyforstudy.example";
const frontendOrigin = "https://buddyforstudy.example";

function response(status, body, headers = {}) {
  const values = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: values,
    async json() { return body; },
  };
}

function healthyOperationsBody(overrides = {}) {
  const background = {
    mode: "inline",
    status: "healthy",
    worker: { mode: "inline", status: "healthy", consecutiveFailures: 0 },
    jobs: [],
    ...overrides.background
  };
  return {
    success: true,
    message: "Operation successful",
    status: background.status,
    background
  };
}

function healthyFetcher(overrides = {}) {
  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin === apiOrigin) {
      if (url.pathname === "/health") return response(200, { success: true, status: "ok" }, { "content-type": "application/json" });
      if (url.pathname === "/api/health/ready") {
        return response(overrides.readinessStatus || 200, overrides.readinessBody || { success: true, status: "ready", database: "connected" }, {
          "content-type": "application/json",
          "access-control-allow-origin": overrides.corsOrigin || frontendOrigin,
        });
      }
      if (url.pathname === "/api/billing/plans") return response(200, { success: true, plans: [] }, { "content-type": "application/json" });
      if (url.pathname === "/api/auth/google/config") {
        return response(200, overrides.googleConfigBody || { enabled: true, clientId: "test-client" }, { "content-type": "application/json" });
      }
      if (url.pathname === "/api/health/operations") {
        return response(200, overrides.operationsBody || healthyOperationsBody(), { "content-type": "application/json" });
      }
    }
    if (url.origin === frontendOrigin && ["/", "/login", "/pricing"].includes(url.pathname)) {
      return response(200, "<!doctype html><html></html>", { "content-type": "text/html; charset=utf-8" });
    }
    return response(404, {}, { "content-type": "application/json" });
  };
}

test("deployment verification requires HTTPS API and frontend origins", async () => {
  await assert.rejects(
    verifyDeployment({ deploymentUrl: apiOrigin, fetchImpl: healthyFetcher() }),
    /FRONTEND_DEPLOYMENT_URL is required/,
  );
  await assert.rejects(
    verifyDeployment({ deploymentUrl: "http://api.example.test", frontendDeploymentUrl: frontendOrigin, fetchImpl: healthyFetcher() }),
    /DEPLOYMENT_URL must be an HTTPS URL/,
  );
  await assert.rejects(
    verifyDeployment({ deploymentUrl: "https://localhost:5000", frontendDeploymentUrl: frontendOrigin, fetchImpl: healthyFetcher() }),
    /loopback host/,
  );
  await assert.rejects(
    verifyDeployment({ deploymentUrl: "https://api.example.test/base-path", frontendDeploymentUrl: frontendOrigin, fetchImpl: healthyFetcher() }),
    /must be an HTTPS URL without credentials, query, or fragment/,
  );
});

test("deployment verification matches the API liveness contract and checks API, CORS, OAuth, billing and frontend deep links", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return healthyFetcher()(url, options);
  };
  const result = await verifyDeployment({
    deploymentUrl: apiOrigin,
    frontendDeploymentUrl: frontendOrigin,
    fetchImpl,
    logger: {},
  });
  assert.deepEqual(result, {
    apiOrigin,
    frontendOrigin,
    apiChecks: 4,
    operationsChecks: 0,
    frontendChecks: 3,
  });
  assert.equal(calls.length, 7);
  assert.equal(calls.find((call) => call.url.endsWith("/api/health/ready")).options.headers.Origin, frontendOrigin);
  assert.equal(calls.find((call) => call.url.endsWith("/health")).url, apiOrigin + "/health");
});

test("deployment verification fails when frontend CORS is not allowed", async () => {
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      fetchImpl: healthyFetcher({ corsOrigin: "https://unexpected.example" }),
      logger: {},
    }),
    /CORS did not allow/,
  );
});

test("deployment verification fails when API database readiness is unavailable", async () => {
  let readinessCalls = 0;
  const fetchImpl = async (input, options) => {
    if (new URL(input).pathname === "/api/health/ready") readinessCalls += 1;
    return healthyFetcher({
      readinessStatus: 503,
      readinessBody: { success: false, message: "Database is not ready" }
    })(input, options);
  };
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      fetchImpl,
      retryAttempts: 2,
      retryDelayMs: 0,
      sleepImpl: async () => {},
      logger: {},
    }),
    /failed with HTTP 503/,
  );
  assert.equal(readinessCalls, 3, "transient server failures should be retried twice");
});

test("deployment verification fails when a frontend deep link does not return HTML", async () => {
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin === frontendOrigin && url.pathname === "/login") {
      return response(404, {}, { "content-type": "application/json" });
    }
    return healthyFetcher()(input, options);
  };
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      fetchImpl,
      logger: {},
    }),
    /Frontend route \/login failed SPA smoke check/,
  );
});

test("a transient cold-start response is retried before the API check proceeds", async () => {
  let healthCalls = 0;
  const delays = [];
  const fetchImpl = async (input, options) => {
    if (new URL(input).pathname === "/health") {
      healthCalls += 1;
      if (healthCalls === 1) return response(503, { success: false }, { "content-type": "application/json" });
    }
    return healthyFetcher()(input, options);
  };

  await verifyDeployment({
    deploymentUrl: apiOrigin,
    frontendDeploymentUrl: frontendOrigin,
    fetchImpl,
    retryAttempts: 2,
    retryDelayMs: 25,
    sleepImpl: async (milliseconds) => delays.push(milliseconds),
    logger: {},
  });

  assert.equal(healthCalls, 2);
  assert.deepEqual(delays, [25]);
});

test("a transient network failure is retried without leaking request credentials", async () => {
  let healthCalls = 0;
  const fetchImpl = async (input, options) => {
    if (new URL(input).pathname === "/health") {
      healthCalls += 1;
      if (healthCalls === 1) throw new Error("ECONNRESET");
    }
    return healthyFetcher()(input, options);
  };
  const logged = [];
  await verifyDeployment({
    deploymentUrl: apiOrigin,
    frontendDeploymentUrl: frontendOrigin,
    fetchImpl,
    retryAttempts: 1,
    retryDelayMs: 0,
    sleepImpl: async () => {},
    logger: { log: (...args) => logged.push(args) },
  });
  assert.equal(healthCalls, 2);
  assert.ok(logged.every((entry) => !JSON.stringify(entry).includes("Authorization")));
});

test("expected Google OAuth client ID must be enabled and match exactly", async () => {
  await verifyDeployment({
    deploymentUrl: apiOrigin,
    frontendDeploymentUrl: frontendOrigin,
    expectedGoogleClientId: "test-client",
    fetchImpl: healthyFetcher(),
    logger: {},
  });

  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      expectedGoogleClientId: "different-client",
      fetchImpl: healthyFetcher(),
      logger: {},
    }),
    /Google OAuth is not enabled with the expected client ID/,
  );
});

test("authenticated operations check verifies worker mode, heartbeat and lease health", async () => {
  const calls = [];
  const token = "short-lived-test-admin-token";
  const fetchImpl = async (input, options = {}) => {
    calls.push({ url: String(input), options });
    return healthyFetcher()(input, options);
  };
  const result = await verifyDeployment({
    deploymentUrl: apiOrigin,
    frontendDeploymentUrl: frontendOrigin,
    operationsAdminToken: token,
    expectedBackgroundWorkerMode: "inline",
    fetchImpl,
    logger: {},
  });

  const operationsCall = calls.find((call) => call.url.endsWith("/api/health/operations"));
  assert.ok(operationsCall);
  assert.equal(operationsCall.options.headers.Authorization, "Bearer " + token);
  assert.equal(operationsCall.options.headers.Origin, frontendOrigin);
  assert.equal(operationsCall.options.method, undefined, "operations verification must remain read-only GET");
  assert.equal(result.operationsChecks, 1);
});

test("authenticated operations check fails when worker mode or heartbeat health differs from expectation", async () => {
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      operationsAdminToken: "short-lived-test-admin-token",
      expectedBackgroundWorkerMode: "standalone",
      fetchImpl: healthyFetcher(),
      logger: {},
    }),
    /Background worker mode does not match/,
  );

  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      operationsAdminToken: "short-lived-test-admin-token",
      expectedBackgroundWorkerMode: "inline",
      fetchImpl: healthyFetcher({
        operationsBody: healthyOperationsBody({
          status: "degraded",
          worker: { mode: "inline", status: "stale" }
        })
      }),
      logger: {},
    }),
    /Background operations are not healthy/,
  );
});

test("required operations verification fails closed when a temporary admin token is missing", async () => {
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      requireOperationsHealth: true,
      expectedBackgroundWorkerMode: "inline",
      fetchImpl: healthyFetcher(),
      logger: {},
    }),
    /OPERATIONS_ADMIN_TOKEN is required/,
  );
});

test("disabled background mode is accepted only when the endpoint reports disabled consistently", async () => {
  await verifyDeployment({
    deploymentUrl: apiOrigin,
    frontendDeploymentUrl: frontendOrigin,
    operationsAdminToken: "short-lived-test-admin-token",
    expectedBackgroundWorkerMode: "disabled",
    fetchImpl: healthyFetcher({
      operationsBody: healthyOperationsBody({
        mode: "disabled",
        status: "disabled",
        worker: { mode: "disabled", status: "disabled" },
        jobs: [{ status: "not_expected" }]
      })
    }),
    logger: {},
  });
});

test("invalid retry configuration is rejected before network requests", async () => {
  let calls = 0;
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      retryAttempts: 6,
      fetchImpl: async () => { calls += 1; return response(200, {}); },
    }),
    /retryAttempts must be an integer from 0 to 5/,
  );
  assert.equal(calls, 0);
});
