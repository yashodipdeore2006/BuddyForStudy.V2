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

function healthyFetcher(overrides = {}) {
  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin === apiOrigin) {
      if (url.pathname === "/health") return response(200, { success: true, status: "healthy" }, { "content-type": "application/json" });
      if (url.pathname === "/api/health/ready") {
        return response(overrides.readinessStatus || 200, overrides.readinessBody || { success: true, status: "ready", database: "connected" }, {
          "content-type": "application/json",
          "access-control-allow-origin": overrides.corsOrigin || frontendOrigin,
        });
      }
      if (url.pathname === "/api/billing/plans") return response(200, { success: true, plans: [] }, { "content-type": "application/json" });
      if (url.pathname === "/api/auth/google/config") return response(200, { enabled: true, clientId: "test-client" }, { "content-type": "application/json" });
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

test("deployment verification checks API readiness, CORS, billing, OAuth, and frontend deep links", async () => {
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
    frontendChecks: 3,
  });
  assert.equal(calls.length, 7);
  assert.equal(calls.find((call) => call.url.endsWith("/api/health/ready")).options.headers.Origin, frontendOrigin);
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
  await assert.rejects(
    verifyDeployment({
      deploymentUrl: apiOrigin,
      frontendDeploymentUrl: frontendOrigin,
      fetchImpl: healthyFetcher({ readinessStatus: 503, readinessBody: { success: false, message: "Database is not ready" } }),
      logger: {},
    }),
    /failed with HTTP 503/,
  );
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
