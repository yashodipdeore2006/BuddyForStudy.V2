import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy-test";
process.env.JWT_SECRET ||= "test-only-secret";

const { isWebPushConfigured } = await import("./webPush.service.js");

test("Web Push is available only when all VAPID settings are present", () => {
  const complete = {
    webPushVapidPublicKey: "public-key",
    webPushVapidPrivateKey: "private-key",
    webPushSubject: "mailto:admin@example.com"
  };
  assert.equal(isWebPushConfigured(complete), true);
  assert.equal(isWebPushConfigured({ ...complete, webPushVapidPublicKey: "" }), false);
  assert.equal(isWebPushConfigured({ ...complete, webPushVapidPrivateKey: "" }), false);
  assert.equal(isWebPushConfigured({ ...complete, webPushSubject: "" }), false);
});
