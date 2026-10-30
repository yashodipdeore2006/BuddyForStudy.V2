import test from "node:test";
import assert from "node:assert/strict";
import { JobHeartbeat } from "../src/models/JobHeartbeat.js";
import { OperationalAlert } from "../src/models/OperationalAlert.js";
import { checkWorkerHeartbeat, heartbeatWorker, markMaintenanceStarted, markMaintenanceCompleted, markMaintenanceFailed, WORKER_HEARTBEAT_STALE_AFTER_MS, WORKER_JOB_NAME } from "../src/services/jobHeartbeat.service.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

test("worker heartbeat is persisted with a stable job identity", async () => {
  let captured;
  await withMocks([[JobHeartbeat, { findOneAndUpdate: async (...args) => { captured = args; return { jobName: WORKER_JOB_NAME }; } }]], async () => {
    const result = await heartbeatWorker("running", new Date("2026-10-19T10:00:00Z"));
    assert.equal(result.jobName, WORKER_JOB_NAME);
  });
  assert.deepEqual(captured[0], { jobName: WORKER_JOB_NAME });
  assert.equal(captured[1].$set.workerStatus, "running");
  assert.equal(captured[1].$set.lastHeartbeatAt.toISOString(), "2026-10-19T10:00:00.000Z");
  assert.equal(captured[2].upsert, true);
});

test("stale or missing worker heartbeat raises a critical alert", async () => {
  let alert;
  await withMocks([
    [JobHeartbeat, { findOne: () => ({ lean: async () => ({ jobName: WORKER_JOB_NAME, workerStatus: "running", lastHeartbeatAt: new Date("2026-10-19T09:00:00Z") }) }) }],
    [OperationalAlert, { findOneAndUpdate: async (filter, update) => { alert = { filter, update }; return {}; } }]
  ], async () => {
    const result = await checkWorkerHeartbeat(new Date("2026-10-19T09:10:00Z"));
    assert.equal(result.status, "stale");
    assert.equal(result.staleAfterSeconds, WORKER_HEARTBEAT_STALE_AFTER_MS / 1000);
  });
  assert.equal(alert.filter.key, "background-worker-heartbeat-stale");
  assert.equal(alert.update.$set.severity, "critical");
  assert.equal(alert.update.$set.status, "open");
});

test("fresh worker heartbeat resolves the stale-worker alert", async () => {
  let resolved = false;
  await withMocks([
    [JobHeartbeat, { findOne: () => ({ lean: async () => ({ jobName: WORKER_JOB_NAME, workerStatus: "running", lastHeartbeatAt: new Date("2026-10-19T10:00:00Z") }) }) }],
    [OperationalAlert, { findOneAndUpdate: async (filter, update) => { resolved = filter.key === "background-worker-heartbeat-stale" && update.$set.status === "resolved"; return {}; } }]
  ], async () => {
    const result = await checkWorkerHeartbeat(new Date("2026-10-19T10:01:00Z"));
    assert.equal(result.status, "healthy");
  });
  assert.equal(resolved, true);
});


test("maintenance lifecycle records start, completion and failure counters", async () => {
  const calls = [];
  await withMocks([[JobHeartbeat, {
    findOneAndUpdate: async (filter, update) => { calls.push({ filter, update }); return {}; }
  }]], async () => {
    const startedAt = new Date("2026-10-19T10:00:00Z");
    const completedAt = new Date("2026-10-19T10:05:00Z");
    const failedAt = new Date("2026-10-19T10:10:00Z");
    await markMaintenanceStarted(startedAt);
    await markMaintenanceCompleted(completedAt);
    await markMaintenanceFailed(new Error("provider timeout"), failedAt);
  });

  assert.equal(calls[0].update.$set.lastMaintenanceStartedAt.toISOString(), "2026-10-19T10:00:00.000Z");
  assert.equal(calls[1].update.$set.lastMaintenanceCompletedAt.toISOString(), "2026-10-19T10:05:00.000Z");
  assert.equal(calls[1].update.$set.consecutiveFailures, 0);
  assert.equal(calls[2].update.$set.lastError, "provider timeout");
  assert.equal(calls[2].update.$inc.consecutiveFailures, 1);
});

test("worker shutdown clears schedulers, waits for active jobs, marks stopped and disconnects", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8");
  const start = worker.indexOf("async function shutdown(signal)");
  const end = worker.indexOf("\n}\n", start);
  const shutdown = worker.slice(start, end + 3);
  assert.match(shutdown, /clearInterval\(intervalHandle\)/);
  assert.match(shutdown, /clearInterval\(heartbeatHandle\)/);
  assert.match(shutdown, /clearInterval\(announcementHandle\)/);
  assert.match(shutdown, /while \(maintenanceInProgress \|\| announcementRunInProgress \|\| nightlyRunInProgress\)/);
  assert.match(shutdown, /heartbeatWorker\("stopped"\)/);
  assert.match(shutdown, /mongoose\.disconnect\(\)/);
});
