import test from "node:test";
import assert from "node:assert/strict";
import { createCourseOrder } from "../src/controllers/payment.controller.js";

const courseId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
}

function makeCourse(overrides = {}) {
  return {
    _id: courseId,
    title: "Backend Fundamentals",
    isPublished: true,
    deletedAt: null,
    status: "published",
    visibility: "public",
    enrollmentEnabled: true,
    generation: { mode: "normal" },
    pricing: { mode: "paid", price: 499, currency: "INR" },
    ...overrides
  };
}

function query(value) {
  return { sort: async () => value };
}

function request() {
  return { body: { courseId }, user: { userId } };
}

test("course checkout reuses an existing pending order when the amount and currency still match", async () => {
  const pending = {
    _id: "payment-pending",
    amount: 499,
    currency: "INR",
    providerOrderId: "order_existing"
  };
  const calls = [];
  let createOrderCalls = 0;
  let createPaymentCalls = 0;
  let releaseCalls = 0;
  const Payment = {
    findOne(filter) {
      calls.push(filter);
      if (filter.status && typeof filter.status === "object" && filter.status.$in) return query(null);
      if (filter.status === "pending") return query(pending);
      assert.fail("Unexpected payment lookup");
    },
    async create() { createPaymentCalls += 1; return {}; }
  };
  const res = makeResponse();
  await createCourseOrder(request(), res, (error) => { throw error; }, {
    Course: { findOne: async () => makeCourse() },
    Payment,
    createOrder: async () => { createOrderCalls += 1; return { id: "unexpected" }; },
    getPublicKey: () => "rzp_test_public",
    acquireCheckoutLock: async (key) => { assert.match(key, /course/); return "lock-token"; },
    releaseCheckoutLock: async () => { releaseCalls += 1; },
    enroll: async () => assert.fail("Should not enroll before payment verification")
  });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.message, "Existing course checkout reused");
  assert.equal(res.result.body.paymentId, pending._id);
  assert.deepEqual(res.result.body.order, { id: "order_existing", amount: 49900, currency: "INR" });
  assert.equal(createOrderCalls, 0);
  assert.equal(createPaymentCalls, 0);
  assert.equal(releaseCalls, 1);
  assert.equal(calls.length, 2);
});

test("course checkout rejects a pending order if the configured price changed", async () => {
  const pending = {
    _id: "payment-pending",
    amount: 299,
    currency: "INR",
    providerOrderId: "order_old"
  };
  let createOrderCalls = 0;
  const Payment = {
    findOne(filter) {
      if (filter.status && typeof filter.status === "object" && filter.status.$in) return query(null);
      if (filter.status === "pending") return query(pending);
      assert.fail("Unexpected payment lookup");
    },
    async create() { assert.fail("Must not create a second payment"); }
  };
  const res = makeResponse();
  let releaseCalls = 0;
  await createCourseOrder(request(), res, (error) => { throw error; }, {
    Course: { findOne: async () => makeCourse() },
    Payment,
    createOrder: async () => { createOrderCalls += 1; return { id: "unexpected" }; },
    getPublicKey: () => "rzp_test_public",
    acquireCheckoutLock: async () => "lock-token",
    releaseCheckoutLock: async () => { releaseCalls += 1; }
  });

  assert.equal(res.result.statusCode, 409);
  assert.match(res.result.body.message, /amount or currency no longer matches/i);
  assert.equal(createOrderCalls, 0);
  assert.equal(releaseCalls, 1);
});

test("a previously purchased course restores enrollment without creating another payable order", async () => {
  const purchase = { _id: "payment-paid", amount: 499, status: "paid" };
  let createOrderCalls = 0;
  let enrollCalls = 0;
  let releaseCalls = 0;
  const Payment = {
    findOne(filter) {
      if (filter.status && typeof filter.status === "object" && filter.status.$in) return query(purchase);
      assert.fail("Pending checkout lookup should not run after a prior purchase is found");
    },
    async create() { assert.fail("Must not create a second payment"); }
  };
  const enrollment = { _id: "enrollment-restored" };
  const res = makeResponse();
  await createCourseOrder(request(), res, (error) => { throw error; }, {
    Course: { findOne: async () => makeCourse() },
    Payment,
    createOrder: async () => { createOrderCalls += 1; return { id: "unexpected" }; },
    getPublicKey: () => "rzp_test_public",
    acquireCheckoutLock: async () => "lock-token",
    releaseCheckoutLock: async () => { releaseCalls += 1; },
    enroll: async (actualUserId, actualCourseId) => {
      enrollCalls += 1;
      assert.equal(actualUserId, userId);
      assert.equal(actualCourseId, courseId);
      return enrollment;
    }
  });

  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.alreadyPurchased, true);
  assert.deepEqual(res.result.body.enrollment, enrollment);
  assert.equal(enrollCalls, 1);
  assert.equal(createOrderCalls, 0);
  assert.equal(releaseCalls, 1);
});
