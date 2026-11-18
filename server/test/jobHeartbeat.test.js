import test from "node:test";
import assert from "node:assert/strict";
import { JobHeartbeat } from "../src/models/JobHeartbeat.js";
import { OperationalAlert } from "../src/models/OperationalAlert.js";
import { checkWorkerHeartbeat, heartbeatWorker, markWorkerStopping, markMaintenanceStarted, markMaintenanceCompleted, markMaintenanceFailed, WORKER_HEARTBEAT_STALE_AFTER_MS, WORKER_JOB_NAME } from "../src/services/jobHeartbeat.service.js";

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

test("standalone worker uses shared leases and drains all jobs before shutdown", async () => {
  const { readFile } = await import("node:fs/promises");
  const worker = (await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const orchestrator = (await readFile(new URL("../src/jobs/maintenanceOrchestrator.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const runner = (await readFile(new URL("../src/jobs/leasedJobRunner.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const start = worker.indexOf("async function shutdown(signal)");
  const end = worker.indexOf("\n}\n", start);
  const shutdown = worker.slice(start, end + 3);

  assert.match(worker, /env\.backgroundWorkerMode !== "standalone"/);
  assert.match(worker, /createLeasedJobRunner\(\)/);
  assert.match(worker, /JOB_LEASE_KEYS\.BACKGROUND_MAINTENANCE/);
  assert.match(worker, /JOB_LEASE_KEYS\.ANNOUNCEMENT_DISPATCH/);
  assert.match(worker, /JOB_LEASE_KEYS\.YOUTUBE_CURATION/);
  assert.match(worker, /leaseRunner\.run\(/);
  assert.match(worker, /setInterval\(\(\) => void runAnnouncementBatches\(\), announcementIntervalMs\)/);
  assert.match(worker, /setInterval\(\(\) => \{\s*void runMaintenance\(\)\.finally\(/);
  assert.match(worker, /let heartbeatInProgress = Promise\.resolve\(\)/);
  assert.match(worker, /heartbeatInProgress = heartbeatInProgress\.then\(\(\) => heartbeatWorker\("running", new Date\(\), \{/);

  assert.match(shutdown, /if \(stopping\) return;/);
  assert.match(shutdown, /clearInterval\(maintenanceHandle\)/);
  assert.match(shutdown, /clearInterval\(heartbeatHandle\)/);
  assert.match(shutdown, /clearInterval\(announcementHandle\)/);
  assert.match(shutdown, /orchestrator\.stop\(\)/);
  assert.match(shutdown, /await leaseRunner\.stop\(\)/);
  assert.match(shutdown, /await orchestrator\.waitForIdle\(\)/);
  assert.match(shutdown, /await heartbeatInProgress/);
  assert.ok(shutdown.indexOf("await leaseRunner.stop()") < shutdown.indexOf('heartbeatWorker("stopped", new Date()'));
  assert.ok(shutdown.indexOf("markWorkerStopping") < shutdown.indexOf("await leaseRunner.stop()"));
  assert.ok(shutdown.indexOf('heartbeatWorker("stopped", new Date()') < shutdown.indexOf("mongoose.disconnect()"));
  assert.match(shutdown, /mongoose\.disconnect\(\)/);
  assert.ok(worker.indexOf('process.on("SIGTERM"') < worker.lastIndexOf("await runMaintenance();"));
  assert.ok(worker.indexOf('process.on("SIGINT"') < worker.lastIndexOf("await runAnnouncementBatches();"));

  assert.match(orchestrator, /async function runMaintenance\(\{\s*shouldContinue = async \(\) => true\s*\}\s*=\s*\{\}\)/);
  assert.match(orchestrator, /async function runAnnouncementBatches\(\{\s*maxBatches = 5,\s*deliveryLimit = 100,\s*shouldContinue = async \(\) => true/);
  assert.match(orchestrator, /async function runNightlyCurationJobs/);
  assert.match(orchestrator, /runNightlyCurationJobs,\s*\n\s*runInlineMaintenance/);
  assert.match(runner, /export function createLeasedJobRunner/);
  assert.match(runner, /acquireLease\(\{ jobKey, ownerId: normalizedOwnerId, leaseDurationMs \}\)/);
  assert.match(runner, /renewLease\(\{ \.\.\.identity, leaseDurationMs \}\)/);
  assert.match(runner, /releaseLease\(identity\)/);
});


test("missing and stopped worker heartbeats raise critical alerts", async () => {
  const alerts = [];
  const now = new Date("2026-10-19T10:00:00Z");
  for (const heartbeat of [
    null,
    { jobName: WORKER_JOB_NAME, workerStatus: "stopped", lastHeartbeatAt: new Date("2026-10-19T09:59:30Z") }
  ]) {
    await withMocks([
      [JobHeartbeat, { findOne: () => ({ lean: async () => heartbeat }) }],
      [OperationalAlert, { findOneAndUpdate: async (filter, update) => { alerts.push({ filter, update }); return {}; } }]
    ], async () => {
      const result = await checkWorkerHeartbeat(now);
      assert.equal(result.status, "stale");
    });
  }
  assert.equal(alerts.length, 2);
  assert.ok(alerts.every((item) => item.filter.key === "background-worker-heartbeat-stale"));
  assert.ok(alerts.every((item) => item.update.$set.severity === "critical"));
});


test("disabled mode is intentionally healthy and resolves stale worker alerts without querying heartbeat", async () => {
  let queryCalls = 0;
  let resolved = false;
  await withMocks([
    [JobHeartbeat, { findOne: () => { queryCalls += 1; throw new Error("disabled mode must not read heartbeat"); } }],
    [OperationalAlert, {
      findOneAndUpdate: async (filter, update) => {
        resolved = filter.key === "background-worker-heartbeat-stale" && update.$set.status === "resolved";
        return {};
      }
    }]
  ], async () => {
    const result = await checkWorkerHeartbeat(new Date("2026-11-18T12:00:00Z"), WORKER_HEARTBEAT_STALE_AFTER_MS, "disabled");
    assert.equal(result.status, "disabled");
    assert.equal(result.workerStatus, "not_expected");
    assert.equal(result.mode, "disabled");
  });
  assert.equal(queryCalls, 0);
  assert.equal(resolved, true);
});

test("a fresh stopping heartbeat is reported as stopping without a critical stale alert", async () => {
  let recorded = false;
  let resolved = false;
  await withMocks([
    [JobHeartbeat, { findOne: () => ({ lean: async () => ({
      jobName: WORKER_JOB_NAME,
      workerStatus: "stopping",
      lastHeartbeatAt: new Date("2026-11-18T12:00:00Z"),
      instanceId: "worker-1"
    }) }) }],
    [OperationalAlert, {
      findOneAndUpdate: async (filter, update) => {
        if (update.$set.status === "open") recorded = true;
        if (update.$set.status === "resolved") resolved = true;
        return {};
      }
    }]
  ], async () => {
    const result = await checkWorkerHeartbeat(new Date("2026-11-18T12:01:00Z"), WORKER_HEARTBEAT_STALE_AFTER_MS, "standalone");
    assert.equal(result.status, "stopping");
    assert.equal(result.instanceId, "worker-1");
  });
  assert.equal(recorded, false);
  assert.equal(resolved, true);
});

test("worker heartbeat records mode, instance and stopping lifecycle metadata", async () => {
  const calls = [];
  await withMocks([[JobHeartbeat, {
    findOneAndUpdate: async (_filter, update) => { calls.push(update); return {}; }
  }]], async () => {
    await heartbeatWorker("running", new Date("2026-11-18T12:00:00Z"), {
      executionMode: "inline",
      instanceId: "api-1",
      started: true
    });
    await markWorkerStopping(new Date("2026-11-18T12:01:00Z"), {
      executionMode: "inline",
      instanceId: "api-1"
    });
    await heartbeatWorker("stopped", new Date("2026-11-18T12:02:00Z"), {
      executionMode: "inline",
      instanceId: "api-1"
    });
  });

  assert.equal(calls[0].$set.executionMode, "inline");
  assert.equal(calls[0].$set.instanceId, "api-1");
  assert.equal(calls[0].$set.lastStartedAt.toISOString(), "2026-11-18T12:00:00.000Z");
  assert.equal(calls[1].$set.workerStatus, "stopping");
  assert.equal(calls[1].$set.shutdownStartedAt.toISOString(), "2026-11-18T12:01:00.000Z");
  assert.equal(calls[2].$set.workerStatus, "stopped");
  assert.equal(calls[2].$set.instanceId, "api-1");
});
