import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Notification } from "../src/models/Notification.js";
import { retryNotificationDelivery } from "../src/services/notification.service.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); }
  finally { for (const { target, key, original } of originals.reverse()) target[key] = original; }
}

test("manual notification retry records actor, reason and bounded retry history", async () => {
  let capturedFilter;
  let capturedPipeline;
  const notification = {
    _id: "507f1f77bcf86cd799439012",
    retryHistory: [{ channel: "email" }]
  };
  await withMocks([
    [Notification, {
      findOneAndUpdate: (filter, pipeline, options) => {
        capturedFilter = filter;
        capturedPipeline = pipeline;
        assert.equal(options.updatePipeline, true);
        return { lean: async () => notification };
      }
    }]
  ], async () => {
    const result = await retryNotificationDelivery(notification._id, "email", {
      reason: "Provider incident resolved; retry approved.",
      actorId: "507f1f77bcf86cd799439011"
    });
    assert.equal(result.status, "pending");
    assert.equal(result.retryCount, 1);
    assert.equal(result.channel, "email");
  });

  assert.equal(capturedFilter.emailStatus, "failed");
  assert.equal(capturedFilter.$expr.$lt[1], 3);
  const retryEntry = capturedPipeline[0].$set.retryHistory.$concatArrays[1][0];
  assert.equal(retryEntry.channel.$literal, "email");
  assert.equal(retryEntry.actorId.$literal, "507f1f77bcf86cd799439011");
  assert.equal(retryEntry.reason.$literal, "Provider incident resolved; retry approved.");
});

test("manual notification retry refuses a fourth retry for the same channel", async () => {
  const notificationId = "507f1f77bcf86cd799439013";
  await withMocks([
    [Notification, {
      findOneAndUpdate: () => ({ lean: async () => null }),
      findById: () => ({
        select() { return this; },
        lean: async () => ({ emailStatus: "failed", retryHistory: [{ channel: "email" }, { channel: "email" }, { channel: "email" }] })
      })
    }]
  ], async () => {
    await assert.rejects(
      retryNotificationDelivery(notificationId, "email", { reason: "Retry after provider recovery" }),
      (error) => error.status === 409 && /retry limit reached/i.test(error.message)
    );
  });
});

test("admin manual retry requires a bounded reason and records an audit event", async () => {
  const source = await readFile(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function retryNotificationDeliveryAdmin");
  const end = source.indexOf("\nexport async function ", start + 1);
  const handler = source.slice(start, end);
  assert.match(handler, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(handler, /audit\(req, "notification\.delivery\.retried"/);
  assert.match(handler, /actorId: req\.user\?\.user\?\._id \|\| req\.user\?\.userId/);
});
