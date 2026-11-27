import test from "node:test";
import assert from "node:assert/strict";
import {
  createInlineBackgroundScheduler,
  INLINE_ANNOUNCEMENT_INTERVAL_MS,
  INLINE_HEARTBEAT_INTERVAL_MS,
  INLINE_MAINTENANCE_INTERVAL_MS
} from "../src/jobs/inlineBackgroundScheduler.js";
import { JOB_LEASE_KEYS, DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS } from "../src/services/jobLease.service.js";

function createFakeTimers() {
  const timers = [];
  return {
    timers,
    setIntervalFn(callback, intervalMs) {
      const timer = {
        callback,
        intervalMs,
        cleared: false,
        unrefCalled: false,
        unref() { this.unrefCalled = true; }
      };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn(timer) {
      if (timer) timer.cleared = true;
    }
  };
}

async function waitForIdle(scheduler) {
  for (let attempt = 0; attempt < 50 && scheduler.isBusy(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(scheduler.isBusy(), false, "scheduled jobs should settle");
}

let orchestratorWasStopped = false;

function createOrchestrator(overrides = {}) {
  return {
    runInlineMaintenance: async () => ({ completed: true }),
    runAnnouncementBatches: async () => ({ batches: 1 }),
    stop() { orchestratorWasStopped = true; },
    async waitForIdle() {},
    ...overrides
  };
}

test("inline scheduler starts bounded timers and executes startup passes under separate leases", async () => {
  const fakeTimers = createFakeTimers();
  const leaseAcquisitions = [];
  const leaseReleases = [];
  const heartbeatStatuses = [];
  const jobCalls = [];
  const orchestrator = createOrchestrator({
    async runInlineMaintenance({ shouldContinue }) {
      assert.equal(await shouldContinue(), true);
      jobCalls.push("maintenance");
      return { completed: true };
    },
    async runAnnouncementBatches(options) {
      assert.equal(options.maxBatches, 1);
      assert.equal(options.deliveryLimit, 10);
      assert.equal(await options.shouldContinue(), true);
      jobCalls.push("announcements");
      return { batches: 1 };
    }
  });

  const scheduler = createInlineBackgroundScheduler({
    ownerId: "api-instance-test",
    orchestrator,
    ...fakeTimers,
    dependencies: {
      async acquireJobLease(args) {
        leaseAcquisitions.push(args.jobKey);
        return { leaseToken: "token:" + args.jobKey, fencingToken: 1 };
      },
      async isJobLeaseOwned() { return true; },
      async renewJobLease() { return { renewed: true }; },
      async releaseJobLease(args) { leaseReleases.push(args.jobKey); return true; },
      async heartbeatWorker(status) { heartbeatStatuses.push(status); },
      async markWorkerStopping() { heartbeatStatuses.push("stopping"); }
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  const startResult = await scheduler.start();
  await waitForIdle(scheduler);

  assert.equal(startResult.started, true);
  assert.equal(scheduler.isRunning(), true);
  assert.deepEqual(jobCalls.sort(), ["announcements", "maintenance"]);
  assert.deepEqual(leaseAcquisitions.sort(), [
    JOB_LEASE_KEYS.ANNOUNCEMENT_DISPATCH,
    JOB_LEASE_KEYS.BACKGROUND_MAINTENANCE
  ]);
  assert.deepEqual(leaseReleases.sort(), leaseAcquisitions);
  assert.ok(fakeTimers.timers.some((timer) => timer.intervalMs === INLINE_MAINTENANCE_INTERVAL_MS));
  assert.ok(fakeTimers.timers.some((timer) => timer.intervalMs === INLINE_ANNOUNCEMENT_INTERVAL_MS));
  assert.ok(fakeTimers.timers.some((timer) => timer.intervalMs === INLINE_HEARTBEAT_INTERVAL_MS));
  assert.ok(fakeTimers.timers.every((timer) => timer.unrefCalled));

  await scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
  assert.equal(orchestratorWasStopped, true);
  assert.equal(heartbeatStatuses.at(-1), "stopped");
  assert.ok(fakeTimers.timers.every((timer) => timer.cleared));
});

test("inline scheduler does not execute a handler when another process owns the lease", async () => {
  let handlerCalls = 0;
  const scheduler = createInlineBackgroundScheduler({
    ownerId: "api-instance-contended",
    orchestrator: createOrchestrator({
      async runInlineMaintenance() { handlerCalls += 1; }
    }),
    dependencies: {
      async acquireJobLease() { return null; },
      async isJobLeaseOwned() { return false; },
      async renewJobLease() { return null; },
      async releaseJobLease() { return false; },
      async heartbeatWorker() {},
      async markWorkerStopping() {}
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await scheduler.runMaintenance();
  assert.deepEqual(result, { skipped: "lease_held_by_another_instance" });
  assert.equal(handlerCalls, 0);
  assert.equal(scheduler.isBusy(), false);
});

test("inline scheduler skips work when ownership verification fails", async () => {
  let handlerCalls = 0;
  let releases = 0;
  const scheduler = createInlineBackgroundScheduler({
    ownerId: "api-instance-stale",
    orchestrator: createOrchestrator({
      async runInlineMaintenance() { handlerCalls += 1; }
    }),
    dependencies: {
      async acquireJobLease() { return { leaseToken: "stale-token" }; },
      async isJobLeaseOwned() { return false; },
      async renewJobLease() { return null; },
      async releaseJobLease() { releases += 1; return true; },
      async heartbeatWorker() {}
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await scheduler.runMaintenance();
  assert.deepEqual(result, { skipped: "lease_not_owned" });
  assert.equal(handlerCalls, 0);
  assert.equal(releases, 1);
});

test("lease renewal failure tells an active handler to stop before its next batch", async () => {
  const fakeTimers = createFakeTimers();
  let resumeHandler;
  let handlerStartedResolve;
  const handlerStarted = new Promise((resolve) => { handlerStartedResolve = resolve; });
  const handlerGate = new Promise((resolve) => { resumeHandler = resolve; });
  let handlerContinued = null;
  let releaseCount = 0;

  const orchestrator = createOrchestrator({
    async runInlineMaintenance({ shouldContinue }) {
      handlerStartedResolve();
      await handlerGate;
      handlerContinued = await shouldContinue();
      return { stoppedAfterLeaseLoss: !handlerContinued };
    }
  });

  const scheduler = createInlineBackgroundScheduler({
    ownerId: "api-instance-renewal-failure",
    orchestrator,
    ...fakeTimers,
    dependencies: {
      async acquireJobLease() { return { leaseToken: "lease-token" }; },
      async isJobLeaseOwned() { return true; },
      async renewJobLease() { return null; },
      async releaseJobLease() { releaseCount += 1; return true; },
      async heartbeatWorker() {}
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  const run = scheduler.runMaintenance();
  await handlerStarted;
  const renewalTimer = fakeTimers.timers.find((timer) => timer.intervalMs === DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS);
  assert.ok(renewalTimer, "a lease renewal timer should be started");
  renewalTimer.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resumeHandler();

  const result = await run;
  assert.equal(handlerContinued, false);
  assert.equal(result.leaseLost, true);
  assert.equal(releaseCount, 1);
});

test("inline scheduler rejects invalid owner identity and incompatible orchestrators", () => {
  assert.throws(() => createInlineBackgroundScheduler({ ownerId: "" }), /ownerId/);
  assert.throws(() => createInlineBackgroundScheduler({ orchestrator: {} }), /maintenance orchestrator/);
});


test("inline shutdown drains an in-flight heartbeat before recording stopping", async () => {
  const fakeTimers = createFakeTimers();
  const heartbeatStatuses = [];
  let releasePulse;
  let pulseStartedResolve;
  const pulseStarted = new Promise((resolve) => { pulseStartedResolve = resolve; });
  const pulseGate = new Promise((resolve) => { releasePulse = resolve; });
  let heartbeatCall = 0;

  const scheduler = createInlineBackgroundScheduler({
    ownerId: "api-instance-heartbeat-drain",
    orchestrator: createOrchestrator(),
    ...fakeTimers,
    dependencies: {
      async heartbeatWorker(status) {
        heartbeatStatuses.push(status);
        heartbeatCall += 1;
        if (heartbeatCall === 2) {
          pulseStartedResolve();
          await pulseGate;
        }
      },
      async markWorkerStopping() { heartbeatStatuses.push("stopping"); },
      async acquireJobLease() { return null; },
      async isJobLeaseOwned() { return false; },
      async renewJobLease() { return null; },
      async releaseJobLease() { return false; }
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  await scheduler.start();
  await waitForIdle(scheduler);
  const heartbeatTimer = fakeTimers.timers.find((timer) => timer.intervalMs === INLINE_HEARTBEAT_INTERVAL_MS);
  assert.ok(heartbeatTimer);
  heartbeatTimer.callback();
  await pulseStarted;

  const stopPromise = scheduler.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(heartbeatStatuses.includes("stopping"), false);

  releasePulse();
  await stopPromise;
  assert.deepEqual(heartbeatStatuses, ["running", "running", "stopping", "stopped"]);
});
