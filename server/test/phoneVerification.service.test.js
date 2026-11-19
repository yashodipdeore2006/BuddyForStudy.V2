import test from "node:test";
import assert from "node:assert/strict";
import { sendPhoneVerification, checkPhoneVerification } from "../src/services/phoneVerification.service.js";

const config = {
  twilioAccountSid: "AC" + "a".repeat(32),
  twilioAuthToken: "test-auth-token",
  twilioVerifyServiceSid: "VA" + "b".repeat(32)
};

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("phone verification sends an SMS through Twilio Verify without storing an OTP", async () => {
  let request;
  const result = await sendPhoneVerification("+919876543210", {
    config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(201, { status: "pending" });
    }
  });

  assert.deepEqual(result, { status: "pending" });
  assert.match(request.url, /\/Verifications$/);
  assert.match(request.options.headers.Authorization, /^Basic /);
  assert.equal(request.options.body.get("To"), "+919876543210");
  assert.equal(request.options.body.get("Channel"), "sms");
});

test("phone verification rejects non-E.164 numbers before calling Twilio", async () => {
  let called = false;
  await assert.rejects(
    sendPhoneVerification("9876543210", { config, fetchImpl: async () => { called = true; return response(201); } }),
    (error) => error.status === 400
  );
  assert.equal(called, false);
});

test("phone verification fails closed when Twilio is not configured", async () => {
  await assert.rejects(
    sendPhoneVerification("+919876543210", { config: {} }),
    (error) => error.status === 503
  );
});

test("phone verification marks only an approved provider check as verified", async () => {
  let request;
  const result = await checkPhoneVerification("+919876543210", "123456", {
    config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, { status: "approved" });
    }
  });
  assert.deepEqual(result, { verified: true });
  assert.match(request.url, /\/VerificationCheck$/);
  assert.equal(request.options.body.get("Code"), "123456");
});

test("phone verification rejects pending and invalid provider checks", async () => {
  await assert.rejects(
    checkPhoneVerification("+919876543210", "123456", {
      config,
      fetchImpl: async () => response(200, { status: "pending" })
    }),
    (error) => error.status === 400
  );
});

test("phone verification maps provider throttling to HTTP 429 without leaking provider messages", async () => {
  await assert.rejects(
    sendPhoneVerification("+919876543210", {
      config,
      fetchImpl: async () => response(429, { message: "private provider details" })
    }),
    (error) => error.status === 429 && !error.message.includes("private provider details")
  );
});
