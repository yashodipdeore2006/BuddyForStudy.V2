import test from "node:test";
import assert from "node:assert/strict";
import { createLeasedJobRunner } from "../src/jobs/leasedJobRunner.js";
import { DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS } from "../src/services/jobLease.service.js";

function fakeTimers() {
  const timers = [];
  return {
    timers,
    setIntervalFn(callback, intervalMs) {
      const timer = { callback, intervalMs, cleared: false, unrefCalled: false, unref() { this.unrefCalled = true; } };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn(timer) { timer.cleared = true; }
  };
}

function deps(overrides = {}) {
  return {
    async acquireJobLease() { return { leaseToken: "lease-token", fencingToken: 1 }; },
    async isJobLeaseOwned() { return true; },
    async renewJobLease() { return { renewed: true }; },
    async releaseJobLease() { return true; },
    ...overrides
  };
}

test("shared lease runner executes handler and releases the exact owner token", async () => {
  const calls = [];
  const timer = fakeTimers();
  const runner = createLeasedJobRunner({
    ownerId: "standalone-worker-1",
    ...timer,
    dependencies: deps({
      async acquireJobLease(args) {
        calls.push(["acquire", args]);
        return { leaseToken: "token-1", fencingToken: 1 };
      },
      async isJobLeaseOwned(args) {
        calls.push(["check", args]);
        return true;
      },
      async releaseJobLease(args) {
        calls.push(["release", args]);
        return true;
      }
    }),
    logger: { warn() {}, error() {} }
  });

  const result = await runner.run("background-maintenance", async ({ shouldContinue, lease }) => {
    assert.equal(lease.fencingToken, 1);
    assert.equal(await shouldContinue(), true);
    return { completed: true };
  });

  assert.deepEqual(result, { completed: true });
  assert.deepEqual(calls.find(([name]) => name === "release")[1], {
    jobKey: "background-maintenance",
    ownerId: "standalone-worker-1",
    leaseToken: "token-1"
  });
  assert.ok(timer.timers[0].cleared);
  assert.equal(runner.isBusy(), false);
});

test("shared lease runner skips work when another process owns the job", async () => {
  let handlerCalls = 0;
  const runner = createLeasedJobRunner({
    ownerId: "worker-contended",
    dependencies: deps({ async acquireJobLease() { return null; } }),
    logger: { warn() {}, error() {} }
  });
  assert.deepEqual(
    await runner.run("announcement-dispatch", async () => { handlerCalls += 1; }),
    { skipped: "lease_held_by_another_instance" }
  );
  assert.equal(handlerCalls, 0);
});

test("shared lease runner prevents duplicate local runs for the same job key", async () => {
  let releaseHandler;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { releaseHandler = resolve; });
  const runner = createLeasedJobRunner({
    ownerId: "worker-local-overlap",
    dependencies: deps(),
    logger: { warn() {}, error() {} }
  });
  const first = runner.run("background-maintenance", async () => {
    started();
    await gate;
    return { completed: true };
  });
  await startedPromise;
  const second = await runner.run("background-maintenance", async () => ({ duplicate: true }));
  assert.deepEqual(second, { skipped: "local_run_active" });
  releaseHandler();
  assert.deepEqual(await first, { completed: true });
});

test("lease renewal loss stops the next handler batch", async () => {
  const timer = fakeTimers();
  let resume;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { resume = resolve; });
  let continued;
  let releaseCount = 0;

  const runner = createLeasedJobRunner({
    ownerId: "worker-renewal-loss",
    ...timer,
    dependencies: deps({
      async renewJobLease() { return null; },
      async releaseJobLease() { releaseCount += 1; return true; }
    }),
    logger: { warn() {}, error() {} }
  });

  const running = runner.run("background-maintenance", async ({ shouldContinue }) => {
    started();
    await gate;
    continued = await shouldContinue();
    return { stoppedBeforeNextBatch: !continued };
  });
  await startedPromise;

  const renewalTimer = timer.timers.find((item) => item.intervalMs === DEFAULT_JOB_LEASE_RENEWAL_INTERVAL_MS);
  assert.ok(renewalTimer);
  renewalTimer.callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resume();

  const result = await running;
  assert.equal(continued, false);
  assert.equal(result.leaseLost, true);
  assert.equal(releaseCount, 1);
});

test("stopping the runner prevents new work and waits for the active lease to release", async () => {
  let resume;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { resume = resolve; });
  let released = false;
  const runner = createLeasedJobRunner({
    ownerId: "worker-shutdown",
    dependencies: deps({
      async releaseJobLease() { released = true; return true; }
    }),
    logger: { warn() {}, error() {} }
  });

  const active = runner.run("background-maintenance", async ({ shouldContinue }) => {
    started();
    await gate;
    assert.equal(await shouldContinue(), false);
    return { stopped: true };
  });
  await startedPromise;

  const stopping = runner.stop();
  assert.equal((await runner.run("announcement-dispatch", async () => ({}))).skipped, "stopping");
  resume();
  await stopping;
  await active;
  assert.equal(released, true);
  assert.equal(runner.isBusy(), false);
});

test("shared lease runner reports lease acquisition errors without running the handler", async () => {
  let handlerCalls = 0;
  const runner = createLeasedJobRunner({
    ownerId: "worker-db-error",
    dependencies: deps({
      async acquireJobLease() { throw new Error("Mongo unavailable"); }
    }),
    logger: { warn() {}, error() {} }
  });
  assert.deepEqual(
    await runner.run("background-maintenance", async () => { handlerCalls += 1; }),
    { skipped: "lease_acquisition_failed" }
  );
  assert.equal(handlerCalls, 0);
});

test("shared lease runner validates owner and lease timing configuration", () => {
  assert.throws(() => createLeasedJobRunner({ ownerId: "" }), /ownerId/);
  assert.throws(() => createLeasedJobRunner({ leaseDurationMs: 1000, leaseRenewalIntervalMs: 1000 }), /leaseRenewalIntervalMs/);
});
