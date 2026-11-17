import test from "node:test";
import assert from "node:assert/strict";
import { RefundRequest } from "../src/models/RefundRequest.js";
import { Payment } from "../src/models/Payment.js";
import { updateRefund } from "../src/controllers/adminPro.controller.js";

const REFUND_ID = "507f1f77bcf86cd799439011";
const PAYMENT_ID = "507f1f77bcf86cd799439012";
const ACTOR_ID = "507f1f77bcf86cd799439013";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function request(status) {
  return {
    params: { refundId: REFUND_ID },
    body: { status, reason: "Reviewed refund decision by finance" },
    user: { user: { _id: ACTOR_ID } }
  };
}

function makeRefund(status) {
  return {
    _id: REFUND_ID,
    payment: PAYMENT_ID,
    user: "507f1f77bcf86cd799439014",
    status,
    amount: 25,
    adminNote: "",
    decisionReason: "",
    processedAt: null,
    saveCalls: 0,
    async save() { this.saveCalls += 1; return this; },
    set(key, value) { this[key] = value; }
  };
}

function makePayment() {
  return {
    _id: PAYMENT_ID,
    provider: "razorpay",
    providerPaymentId: "pay_test_123",
    amount: 100,
    currency: "INR",
    status: "paid",
    saveCalls: 0,
    async save() { this.saveCalls += 1; return this; }
  };
}

test("processed refund requests are immutable and cannot trigger another provider action", async () => {
  const refund = makeRefund("processed");
  const payment = makePayment();
  let claimCalls = 0;
  let refundLookupCalls = 0;
  let paymentLookupCalls = 0;
  const res = responseRecorder();

  await withMocks([
    [RefundRequest, {
      findById: async (id) => { refundLookupCalls += 1; assert.equal(id, REFUND_ID); return refund; },
      findOneAndUpdate: async () => { claimCalls += 1; return refund; }
    }],
    [Payment, {
      findById: async (id) => { paymentLookupCalls += 1; assert.equal(String(id), PAYMENT_ID); return payment; }
    }]
  ], async () => {
    await updateRefund(request("rejected"), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /processed refund is final/i);
  assert.equal(refundLookupCalls, 1);
  assert.equal(paymentLookupCalls, 1);
  assert.equal(claimCalls, 0);
  assert.equal(refund.saveCalls, 0);
  assert.equal(payment.saveCalls, 0);
});

test("approved refunds can only be changed through provider reconciliation", async () => {
  const refund = makeRefund("approved");
  const payment = makePayment();
  let claimCalls = 0;
  let refundSaveCalls = 0;
  const res = responseRecorder();

  await withMocks([
    [RefundRequest, {
      findById: async () => refund,
      findOneAndUpdate: async () => { claimCalls += 1; return refund; }
    }],
    [Payment, { findById: async () => payment }]
  ], async () => {
    await updateRefund(request("rejected"), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /provider reconciliation/i);
  assert.equal(claimCalls, 0);
  assert.equal(refund.saveCalls, refundSaveCalls);
  assert.equal(payment.saveCalls, 0);
  assert.equal(refund.status, "approved");
});

test("rejection loses safely when another administrator already claimed the pending refund", async () => {
  const refund = makeRefund("pending");
  const payment = makePayment();
  let claimFilter;
  let saveCalls = 0;
  const res = responseRecorder();

  await withMocks([
    [RefundRequest, {
      findById: async () => refund,
      findOneAndUpdate: async (filter) => { claimFilter = filter; return null; }
    }],
    [Payment, { findById: async () => payment }]
  ], async () => {
    await updateRefund(request("rejected"), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /no longer pending/i);
  assert.deepEqual(claimFilter, { _id: REFUND_ID, status: "pending" });
  assert.equal(refund.saveCalls, saveCalls);
  assert.equal(payment.saveCalls, 0);
});
