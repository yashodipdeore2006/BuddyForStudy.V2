import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("inline maintenance invokes only bounded handlers and leaves full scans to standalone mode", async () => {
  const source = (await readFile(new URL("../src/jobs/maintenanceOrchestrator.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const start = source.indexOf("async function runInlineMaintenance");
  const end = source.indexOf("async function runMaintenance()", start);
  assert.ok(start >= 0 && end > start, "inline and standalone maintenance handlers should be separate");
  const inline = source.slice(start, end);

  assert.match(inline, /maxItems:\s*10/);
  assert.match(inline, /shouldContinue/);
  assert.match(inline, /'expired',\s*25/);
  assert.match(inline, /'cancelled',\s*25/);
  assert.match(inline, /processPendingAuditOutbox\(25,\s*now\)/);
  assert.match(inline, /deliverPendingNotificationEmails\(10\)/);
  assert.match(inline, /deliverPendingNotificationPush\(10\)/);
  assert.match(inline, /reconcilePendingCoursePurchaseNotifications\(now,\s*10,\s*\{\s*maxPages:\s*1,\s*fair:\s*true\s*\}\)/);
  assert.match(inline, /reconcilePendingSubscriptionActivationNotifications\(now,\s*10,\s*\{\s*maxPages:\s*1,\s*fair:\s*true\s*\}\)/);
  assert.doesNotMatch(inline, /processLearningReminders|processSubscriptionExpiryReminders|runNightlyCurationJobs/);
});

test("announcement orchestration supports a one-batch inline limit without changing standalone defaults", async () => {
  const source = (await readFile(new URL("../src/jobs/maintenanceOrchestrator.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(source, /async function runAnnouncementBatches\(\{\s*maxBatches = 5,\s*deliveryLimit = 100/);
  assert.match(source, /safeMaxBatches = Math\.max\(1,\s*Math\.min\(5/);
  assert.match(source, /processScheduledAnnouncements\(new Date\(\),\s*1,\s*100\)/);
});
