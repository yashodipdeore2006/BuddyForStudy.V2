import test from "node:test";
import assert from "node:assert/strict";
import { Notification } from "../src/models/Notification.js";
import { deliveryLog } from "../src/controllers/adminPro.controller.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("notification delivery logs mask recipient PII and redact provider email addresses and URLs", async () => {
  const rawEmail = "learner@example.test";
  const sensitiveUrl = "https://provider.example.test/secret/subscription?token=private";
  const item = {
    _id: "notification-test-id",
    updatedAt: new Date("2026-10-01T10:00:00.000Z"),
    user: { name: "Learner Example", email: rawEmail },
    type: "system",
    eventKey: "event-key",
    title: "Course update",
    showInApp: true,
    emailStatus: "failed",
    emailAttempts: 2,
    emailError: "SMTP rejected " + rawEmail + " at " + sensitiveUrl,
    pushStatus: "failed",
    pushAttempts: 1,
    pushError: "Push failed for " + rawEmail + " at " + sensitiveUrl,
    metadata: { requestedChannels: ["in_app", "email", "push"] },
    retryHistory: [{
      channel: "email",
      priorAttempts: 1,
      previousError: "Failure for " + rawEmail + " at " + sensitiveUrl,
      reason: "Provider timeout, safe support detail"
    }]
  };

  const originalFind = Notification.find;
  const originalCount = Notification.countDocuments;
  let capturedFilter;
  let capturedProjection;
  let capturedSort;
  const query = {
    populate(path, fields) { capturedProjection = { path, fields }; return this; },
    sort(value) { capturedSort = value; return this; },
    skip(value) { assert.equal(value, 0); return this; },
    limit(value) { assert.equal(value, 25); return this; },
    lean: async () => [item]
  };
  Notification.find = (filter) => { capturedFilter = filter; return query; };
  Notification.countDocuments = async (filter) => {
    assert.deepEqual(filter, capturedFilter);
    return 1;
  };

  try {
    const res = responseRecorder();
    await deliveryLog({ query: {} }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedFilter, {});
    assert.deepEqual(capturedProjection, { path: "user", fields: "name email" });
    assert.deepEqual(capturedSort, { updatedAt: -1, _id: -1 });
    assert.equal(res.body.deliveries.length, 1);
    const delivery = res.body.deliveries[0];
    assert.equal(delivery.recipient.email, "l***@example.test");
    assert.equal(delivery.channels.email.error, "SMTP rejected [masked email] at [provider URL]");
    assert.equal(delivery.channels.push.error, "Push failed for [masked email] at [provider URL]");
    assert.equal(delivery.retryHistory[0].previousError, "Failure for [masked email] at [provider URL]");
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(rawEmail), false);
    assert.equal(serialized.includes("https://"), false);
    assert.equal(serialized.includes("token=private"), false);
  } finally {
    Notification.find = originalFind;
    Notification.countDocuments = originalCount;
  }
});
