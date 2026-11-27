import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("standalone worker uses shared MongoDB leases for each scheduler category", async () => {
  const worker = await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8");
  assert.match(worker, /env\.backgroundWorkerMode !== "standalone"/);
  assert.match(worker, /createLeasedJobRunner\(\)/);
  assert.match(worker, /JOB_LEASE_KEYS\.BACKGROUND_MAINTENANCE/);
  assert.match(worker, /JOB_LEASE_KEYS\.ANNOUNCEMENT_DISPATCH/);
  assert.match(worker, /JOB_LEASE_KEYS\.YOUTUBE_CURATION/);
  assert.match(worker, /leaseRunner\.run\(/);
});

test("standalone worker preserves its original maintenance and announcement cadence", async () => {
  const worker = await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8");
  assert.match(worker, /const maintenanceIntervalMs = 15 \* 60 \* 1000/);
  assert.match(worker, /const announcementIntervalMs = 30 \* 1000/);
  assert.match(worker, /setInterval\(\(\) => \{\s*void runMaintenance\(\)\.finally\(\(\) => \{\s*if \(!stopping\) void runNightlyCurationJobs\(\);\s*\}\);\s*\}, maintenanceIntervalMs\)/);
  assert.match(worker, /setInterval\(\(\) => void runAnnouncementBatches\(\), announcementIntervalMs\)/);
  assert.match(worker, /await runMaintenance\(\);\s*if \(!stopping\) await runAnnouncementBatches\(\);\s*if \(!stopping\) await runNightlyCurationJobs\(\);/);
});

test("standalone shutdown stops new ticks, drains leased jobs and then disconnects MongoDB", async () => {
  const worker = await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8");
  // Git may check this file out with CRLF on Windows; normalize before slicing.
  const normalizedWorker = worker.replace(/\r\n/g, "\n");
  const start = normalizedWorker.indexOf("async function shutdown(signal)");
  const end = normalizedWorker.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start);
  const shutdown = normalizedWorker.slice(start, end + 3);
  assert.match(shutdown, /clearInterval\(maintenanceHandle\)/);
  assert.match(shutdown, /clearInterval\(heartbeatHandle\)/);
  assert.match(shutdown, /clearInterval\(announcementHandle\)/);
  assert.match(shutdown, /orchestrator\.stop\(\)/);
  assert.match(shutdown, /await leaseRunner\.stop\(\)/);
  assert.match(shutdown, /await orchestrator\.waitForIdle\(\)/);
  assert.match(shutdown, /await heartbeatInProgress/);
  assert.match(shutdown, /heartbeatWorker\("stopped",\s*new Date\(\),/);
  assert.match(shutdown, /mongoose\.disconnect\(\)/);
  assert.ok(shutdown.indexOf("await leaseRunner.stop()") < shutdown.indexOf("mongoose.disconnect()"));
});

test("full standalone maintenance checks lease ownership and passes it into long-running scans", async () => {
  const orchestrator = await readFile(new URL("../src/jobs/maintenanceOrchestrator.js", import.meta.url), "utf8");
  const start = orchestrator.indexOf("async function runMaintenance");
  const end = orchestrator.indexOf("async function runAnnouncementBatches", start);
  const maintenance = orchestrator.slice(start, end);
  assert.match(maintenance, /runMaintenance\(\{\s*shouldContinue = async \(\) => true\s*\}\s*=\s*\{\}\)/);
  assert.match(maintenance, /recoverExpiredRoadmapAdmissions\(\{\s*now,\s*shouldContinue\s*\}\)/);
  assert.match(maintenance, /processPendingAuditOutbox\(100,\s*now,\s*\{\s*shouldContinue\s*\}\)/);
  assert.match(maintenance, /processLearningReminders\(now,\s*500,\s*\{\s*shouldContinue\s*\}\)/);
  assert.match(maintenance, /reconcilePendingCoursePurchaseNotifications\(now,\s*100,\s*\{\s*shouldContinue\s*\}\)/);
  assert.match(maintenance, /reconcilePendingSubscriptionActivationNotifications\(now,\s*100,\s*\{\s*shouldContinue\s*\}\)/);
  assert.match(maintenance, /processSubscriptionExpiryReminders\(now,\s*\{\s*shouldContinue\s*\}\)/);
  assert.match(maintenance, /if \(!\(await shouldContinue\(\)\)\) return \{ skipped: "lease_lost" \};/);
});

test("nightly curation is separated from maintenance and has its own lease entry point", async () => {
  const orchestrator = await readFile(new URL("../src/jobs/maintenanceOrchestrator.js", import.meta.url), "utf8");
  const worker = await readFile(new URL("../src/jobs/worker.js", import.meta.url), "utf8");
  assert.match(orchestrator, /runNightlyCurationJobs,\s*\n\s*runInlineMaintenance/);
  assert.doesNotMatch(orchestrator.slice(
    orchestrator.indexOf("async function runMaintenance"),
    orchestrator.indexOf("async function runAnnouncementBatches")
  ), /runNightlyCurationJobs\(now\)/);
  assert.match(worker, /JOB_LEASE_KEYS\.YOUTUBE_CURATION/);
});


test("long-running notification scans accept lease checkpoints between pages and records", async () => {
  const service = await readFile(new URL("../src/services/notification.service.js", import.meta.url), "utf8");
  for (const functionName of [
    "processSubscriptionExpiryReminders",
    "reconcilePendingCoursePurchaseNotifications",
    "reconcilePendingSubscriptionActivationNotifications",
    "processLearningReminders"
  ]) {
    const start = service.indexOf("export async function " + functionName);
    assert.ok(start >= 0, functionName + " should exist");
    const nextExport = service.indexOf("export async function ", start + 1);
    const section = service.slice(start, nextExport < 0 ? undefined : nextExport);
    assert.match(section, /options\.shouldContinue\?\.\(\)/, functionName + " should check the lease before continuing");
  }
});

test("audit outbox processing accepts the lease checkpoint for each retry claim", async () => {
  const service = await readFile(new URL("../src/services/auditOutbox.service.js", import.meta.url), "utf8");
  assert.match(service, /if \(await options\.shouldContinue\?\.\(\) === false\) break;/);
  assert.match(service, /if \(await options\.shouldContinue\?\.\(\) !== false\)/);
});
