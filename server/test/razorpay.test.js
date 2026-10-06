import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPaymentSignature } from "../src/services/razorpay.service.js";

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
