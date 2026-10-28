import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPaymentSignature, verifyWebhookSignature } from "../src/services/razorpay.service.js";

test("accepts a valid Razorpay payment signature", () => {
  const orderId = "order_test";
  const paymentId = "pay_test";
  const secret = "test_secret";
  const signature = crypto.createHmac("sha256", secret).update(orderId + "|" + paymentId).digest("hex");
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature, secret }), true);
});

test("rejects a tampered Razorpay payment signature", () => {
  const signature = crypto.createHmac("sha256", "test_secret").update("order_test|pay_test").digest("hex");
  assert.equal(verifyPaymentSignature({ orderId: "order_test", paymentId: "pay_other", signature, secret: "test_secret" }), false);
});

test("accepts a valid Razorpay webhook signature over the exact raw request body", () => {
  const rawBody = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_123"}}}}');
  const secret = "webhook_test_secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyWebhookSignature(rawBody, signature, secret), true);
});

test("rejects tampered webhook bodies and missing webhook signature inputs", () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const secret = "webhook_test_secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), signature, secret), false);
  assert.equal(verifyWebhookSignature(rawBody, "", secret), false);
  assert.equal(verifyWebhookSignature(Buffer.alloc(0), signature, secret), false);
});
