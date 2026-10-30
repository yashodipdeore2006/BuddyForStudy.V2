import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildManualNotificationRetryFilter,
  buildManualNotificationRetryPipeline
} from "../src/services/notification.service.js";

test("manual notification retry filter only claims failed channel deliveries below the three-retry limit", () => {
  const email = buildManualNotificationRetryFilter("notification-1", "email");
  const push = buildManualNotificationRetryFilter("notification-2", "push");
  assert.equal(email._id, "notification-1");
  assert.equal(email.emailStatus, "failed");
  assert.equal(email.$expr.$lt[1], 3);
  assert.equal(push._id, "notification-2");
  assert.equal(push.pushStatus, "failed");
  assert.equal(push.$expr.$lt[1], 3);
  assert.throws(() => buildManualNotificationRetryFilter("notification-3", "sms"), /channel must be email or push/i);
});

test("manual retry pipeline records actor and reason while resetting only the selected channel", () => {
  const pipeline = buildManualNotificationRetryPipeline(
    "email",
    "507f1f77bcf86cd799439011",
    "Provider incident resolved; retry approved."
  );
  const set = pipeline[0].$set;
  const entry = set.retryHistory.$concatArrays[1][0];
  assert.equal(entry.channel.$literal, "email");
  assert.equal(entry.actorId.$literal, "507f1f77bcf86cd799439011");
  assert.equal(entry.reason.$literal, "Provider incident resolved; retry approved.");
  assert.equal(set.emailStatus, "pending");
  assert.equal(set.emailAttempts, 0);
  assert.equal(set.emailLastAttemptAt, null);
  assert.equal(set.pushStatus, undefined);
  assert.equal(set.pushAttempts, undefined);
});

test("manual push retry resets only push delivery state and bounds the recorded reason", () => {
  const pipeline = buildManualNotificationRetryPipeline("push", "admin-1", "x".repeat(700));
  const set = pipeline[0].$set;
  const entry = set.retryHistory.$concatArrays[1][0];
  assert.equal(entry.channel.$literal, "push");
  assert.equal(entry.reason.$literal.length, 500);
  assert.equal(set.pushStatus, "pending");
  assert.equal(set.pushAttempts, 0);
  assert.equal(set.emailStatus, undefined);
});

test("admin manual retry requires a bounded reason and records an audit event", async () => {
  const source = await readFile(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function retryNotificationDeliveryAdmin");
  const end = source.indexOf("\nexport async function ", start + 1);
  const handler = source.slice(start, end);
  assert.match(handler, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(handler, /audit\(req, "notification\.delivery\.retried"/);
  assert.match(handler, /actorId: req\.user\?\.user\?\._id \|\| req\.user\?\.userId/);
  assert.match(handler, /Only failed deliveries can be retried/);
});
