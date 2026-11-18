import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BACKGROUND_JOB_LEASES,
  classifyJobLease,
  checkBackgroundJobLeases,
  getBackgroundOperationsHealth
} from "../src/services/backgroundOperationsHealth.service.js";

const NOW = new Date("2026-11-18T12:00:00.000Z");

function lease(jobKey, overrides = {}) {
  return {
    jobKey,
    ownerId: "test-instance",
    leaseToken: "never-return-this-token",
    leaseUntil: new Date(NOW.getTime() - 60_000),
    renewedAt: new Date(NOW.getTime() - 180_000),
    acquiredAt: new Date(NOW.getTime() - 300_000),
    releasedAt: null,
    fencingToken: 3,
    ...overrides
  };
}

test("lease classification distinguishes active, released, legacy released, expired and idle", () => {
  assert.equal(classifyJobLease(null, NOW), "idle");
  assert.equal(classifyJobLease(lease("active", {
    leaseUntil: new Date(NOW.getTime() + 60_000),
    releasedAt: null
  }), NOW), "active");
  assert.equal(classifyJobLease(lease("released", {
    releasedAt: new Date(NOW.getTime() - 60_000)
  }), NOW), "released");
  assert.equal(classifyJobLease(lease("legacy-released", {
    renewedAt: new Date(NOW.getTime() - 60_000),
    leaseUntil: new Date(NOW.getTime() - 60_000),
    releasedAt: null
  }), NOW), "released");
  assert.equal(classifyJobLease(lease("expired"), NOW), "expired");
});

test("active and released job leases resolve alerts while crashed leases raise warnings", async () => {
  const activeKey = BACKGROUND_JOB_LEASES[0].jobKey;
  const releasedKey = BACKGROUND_JOB_LEASES[1].jobKey;
  const expiredKey = BACKGROUND_JOB_LEASES[2].jobKey;
  const recorded = [];
  const resolved = [];
  const jobs = await checkBackgroundJobLeases(NOW, "standalone", {
    findLeases: async () => [
      lease(activeKey, { leaseUntil: new Date(NOW.getTime() + 30_000) }),
      lease(releasedKey, { releasedAt: new Date(NOW.getTime() - 1_000) }),
      lease(expiredKey)
    ],
    recordAlert: async (alert) => recorded.push(alert),
    resolveAlert: async (key) => resolved.push(key)
  });

  assert.deepEqual(jobs.map((job) => job.status), ["active", "released", "expired"]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].key, "background-job-lease-expired:" + expiredKey);
  assert.equal(recorded[0].severity, "warning");
  assert.deepEqual(resolved.sort(), [
    "background-job-lease-expired:" + activeKey,
    "background-job-lease-expired:" + releasedKey
  ].sort());
  assert.equal(jobs[0].remainingSeconds, 30);
  assert.equal("ownerId" in jobs[0], false);
  assert.equal("leaseToken" in jobs[0], false);
});

test("disabled mode reports old expired leases as not expected and suppresses lease alerts", async () => {
  const recorded = [];
  const resolved = [];
  const jobs = await checkBackgroundJobLeases(NOW, "disabled", {
    findLeases: async () => [lease(BACKGROUND_JOB_LEASES[0].jobKey)],
    recordAlert: async (alert) => recorded.push(alert),
    resolveAlert: async (key) => resolved.push(key)
  });

  assert.equal(jobs[0].status, "not_expected");
  assert.equal(recorded.length, 0);
  assert.equal(resolved.length, BACKGROUND_JOB_LEASES.length);
});

test("overall background health is healthy, degraded, stopping or disabled based on mode and leases", async () => {
  const healthy = await getBackgroundOperationsHealth({
    now: NOW,
    mode: "inline",
    workerCheck: async () => ({ status: "healthy" }),
    leaseCheck: async () => [{ status: "active" }, { status: "released" }]
  });
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.mode, "inline");

  const degraded = await getBackgroundOperationsHealth({
    now: NOW,
    mode: "standalone",
    workerCheck: async () => ({ status: "healthy" }),
    leaseCheck: async () => [{ status: "expired" }]
  });
  assert.equal(degraded.status, "degraded");

  const stopping = await getBackgroundOperationsHealth({
    now: NOW,
    mode: "standalone",
    workerCheck: async () => ({ status: "stopping" }),
    leaseCheck: async () => [{ status: "released" }]
  });
  assert.equal(stopping.status, "stopping");

  const disabled = await getBackgroundOperationsHealth({
    now: NOW,
    mode: "disabled",
    workerCheck: async () => ({ status: "disabled" }),
    leaseCheck: async () => [{ status: "not_expected" }]
  });
  assert.equal(disabled.status, "disabled");
});

test("operational health endpoint requires an authenticated administrator", async () => {
  const routes = await readFile(new URL("../src/routes/health.routes.js", import.meta.url), "utf8");
  const routeAt = routes.indexOf('router.get("/operations"');
  assert.ok(routeAt >= 0);
  assert.match(routes.slice(routeAt), /authMiddleware,\s*adminMiddleware,\s*controller\.operations/);
  assert.doesNotMatch(routes.slice(routeAt), /controller\.operations\);/);
});
