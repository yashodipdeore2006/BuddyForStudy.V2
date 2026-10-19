import test from "node:test";
import assert from "node:assert/strict";
import { JobHeartbeat } from "../src/models/JobHeartbeat.js";
import { OperationalAlert } from "../src/models/OperationalAlert.js";
import { checkWorkerHeartbeat, heartbeatWorker, WORKER_HEARTBEAT_STALE_AFTER_MS, WORKER_JOB_NAME } from "../src/services/jobHeartbeat.service.js";

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
    [JobHeartbeat, { findOne: async () => ({ jobName: WORKER_JOB_NAME, workerStatus: "running", lastHeartbeatAt: new Date("2026-10-19T09:00:00Z") }) }],
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
    [JobHeartbeat, { findOne: async () => ({ jobName: WORKER_JOB_NAME, workerStatus: "running", lastHeartbeatAt: new Date("2026-10-19T10:00:00Z") }) }],
    [OperationalAlert, { findOneAndUpdate: async (filter, update) => { resolved = filter.key === "background-worker-heartbeat-stale" && update.$set.status === "resolved"; return {}; } }]
  ], async () => {
    const result = await checkWorkerHeartbeat(new Date("2026-10-19T10:01:00Z"));
    assert.equal(result.status, "healthy");
  });
  assert.equal(resolved, true);
});
