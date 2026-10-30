import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy-test";
process.env.JWT_SECRET ||= "test-only-secret";

const { isWebPushConfigured, getWebPushPublicKey } = await import("./webPush.service.js");
const { env } = await import("../config/env.js");

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


test("public key endpoint helper exposes only the public VAPID key", () => {
  const previous = {
    publicKey: env.webPushVapidPublicKey,
    privateKey: env.webPushVapidPrivateKey,
    subject: env.webPushSubject
  };
  try {
    env.webPushVapidPublicKey = "public-vapid-key";
    env.webPushVapidPrivateKey = "private-vapid-secret";
    env.webPushSubject = "mailto:admin@example.com";
    const result = getWebPushPublicKey();
    assert.equal(result, "public-vapid-key");
    assert.notEqual(result, env.webPushVapidPrivateKey);
    assert.equal(JSON.stringify({ publicKey: result }).includes("private-vapid-secret"), false);
  } finally {
    env.webPushVapidPublicKey = previous.publicKey;
    env.webPushVapidPrivateKey = previous.privateKey;
    env.webPushSubject = previous.subject;
  }
});
