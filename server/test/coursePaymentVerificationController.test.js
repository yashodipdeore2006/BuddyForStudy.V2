import test from "node:test";
import assert from "node:assert/strict";
import { verifyCoursePayment } from "../src/controllers/payment.controller.js";

const userId = "507f191e810c19729de860ea";
const courseId = "507f1f77bcf86cd799439011";
const paymentId = "507f1f77bcf86cd799439012";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
}

function makePayment(overrides = {}) {
  return {
    _id: paymentId,
    user: userId,
    course: courseId,
    provider: "razorpay",
    providerOrderId: "order_123",
    providerPaymentId: "",
    amount: 499,
    currency: "INR",
    status: "pending",
    paidAt: null,
    purchaseNotificationStatus: "",
    purchaseNotificationLastCheckedAt: null,
    saveCalls: 0,
    async save() { this.saveCalls += 1; },
    ...overrides
  };
}

function request(paymentIdValue = "pay_123") {
  return {
    user: { userId },
    body: {
      paymentId,
      razorpayOrderId: "order_123",
      razorpayPaymentId: paymentIdValue,
      razorpaySignature: "signature-test"
    }
  };
}

test("successful course payment verification accepts only a captured matching provider payment and restores access", async () => {
  const payment = makePayment();
  const enrollment = { _id: "enrollment-restored" };
  let providerFetchCalls = 0;
  let enrollCalls = 0;
  const res = makeResponse();
  await verifyCoursePayment(request(), res, (error) => { throw error; }, {
    Payment: {
      findOne: async (filter) => {
        assert.deepEqual(filter, { _id: paymentId, user: userId, provider: "razorpay" });
        return payment;
      }
    },
    verifyPaymentSignature: ({ orderId, paymentId: providerPaymentId, signature }) => {
      assert.equal(orderId, "order_123");
      assert.equal(providerPaymentId, "pay_123");
      assert.equal(signature, "signature-test");
      return true;
    },
    fetchPayment: async (providerPaymentId) => {
      providerFetchCalls += 1;
      assert.equal(providerPaymentId, "pay_123");
      return { order_id: "order_123", status: "captured", amount: 49900, currency: "INR" };
    },
    enroll: async (actualUserId, actualCourseId) => {
      enrollCalls += 1;
      assert.equal(actualUserId, userId);
      assert.equal(actualCourseId, courseId);
      return enrollment;
    }
  });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.message, "Payment verified and course access granted");
  assert.equal(payment.status, "paid");
  assert.equal(payment.providerPaymentId, "pay_123");
  assert.ok(payment.paidAt instanceof Date);
  assert.equal(payment.purchaseNotificationStatus, "pending");
  assert.equal(payment.saveCalls, 1);
  assert.equal(providerFetchCalls, 1);
  assert.equal(enrollCalls, 1);
  assert.deepEqual(res.result.body.enrollment, enrollment);
});

test("replaying the same verified payment restores enrollment without fetching or charging again", async () => {
  const payment = makePayment({ status: "paid", providerPaymentId: "pay_123", paidAt: new Date("2026-10-20T12:00:00.000Z") });
  const enrollment = { _id: "enrollment-recovered" };
  let providerFetchCalls = 0;
  let enrollCalls = 0;
  const res = makeResponse();
  await verifyCoursePayment(request("pay_123"), res, (error) => { throw error; }, {
    Payment: { findOne: async () => payment },
    verifyPaymentSignature: () => true,
    fetchPayment: async () => { providerFetchCalls += 1; throw new Error("A paid replay must not fetch or charge again"); },
    enroll: async (actualUserId, actualCourseId) => {
      enrollCalls += 1;
      assert.equal(actualUserId, userId);
      assert.equal(actualCourseId, courseId);
      return enrollment;
    }
  });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.message, "Payment already verified; course access restored");
  assert.equal(payment.saveCalls, 0);
  assert.equal(providerFetchCalls, 0);
  assert.equal(enrollCalls, 1);
  assert.deepEqual(res.result.body.enrollment, enrollment);
});

test("invalid signatures are rejected before provider fetch or enrollment", async () => {
  const payment = makePayment();
  let providerFetchCalls = 0;
  let enrollCalls = 0;
  const res = makeResponse();
  await verifyCoursePayment(request(), res, (error) => { throw error; }, {
    Payment: { findOne: async () => payment },
    verifyPaymentSignature: () => false,
    fetchPayment: async () => { providerFetchCalls += 1; return {}; },
    enroll: async () => { enrollCalls += 1; return {}; }
  });

  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.message, "Invalid payment signature");
  assert.equal(payment.saveCalls, 0);
  assert.equal(providerFetchCalls, 0);
  assert.equal(enrollCalls, 0);
});

test("a different provider payment cannot replay a payment record already marked paid", async () => {
  const payment = makePayment({ status: "paid", providerPaymentId: "pay_original" });
  let providerFetchCalls = 0;
  let enrollCalls = 0;
  const res = makeResponse();
  await verifyCoursePayment(request("pay_other"), res, (error) => { throw error; }, {
    Payment: { findOne: async () => payment },
    verifyPaymentSignature: () => true,
    fetchPayment: async () => { providerFetchCalls += 1; return {}; },
    enroll: async () => { enrollCalls += 1; return {}; }
  });

  assert.equal(res.result.statusCode, 409);
  assert.match(res.result.body.message, /different provider payment/i);
  assert.equal(providerFetchCalls, 0);
  assert.equal(enrollCalls, 0);
});

test("refunded course payments cannot be reactivated by payment verification", async () => {
  const payment = makePayment({ status: "refunded", providerPaymentId: "pay_123" });
  let providerFetchCalls = 0;
  let enrollCalls = 0;
  const res = makeResponse();
  await verifyCoursePayment(request("pay_123"), res, (error) => { throw error; }, {
    Payment: { findOne: async () => payment },
    verifyPaymentSignature: () => true,
    fetchPayment: async () => { providerFetchCalls += 1; return {}; },
    enroll: async () => { enrollCalls += 1; return {}; }
  });

  assert.equal(res.result.statusCode, 409);
  assert.equal(res.result.body.message, "Payment is already refunded");
  assert.equal(providerFetchCalls, 0);
  assert.equal(enrollCalls, 0);
});
