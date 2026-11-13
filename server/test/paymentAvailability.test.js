import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentAvailabilityMiddleware } from "../src/middleware/paymentAvailability.js";

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("payment routes are blocked with a clear 503 response when payments are disabled", () => {
  const middleware = createPaymentAvailabilityMiddleware({ enabled: false });
  const res = makeResponse();
  let nextCalled = false;

  middleware({}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    success: false,
    message: "Payments are temporarily unavailable. Please try again later."
  });
});

test("payment routes continue when payments are explicitly enabled", () => {
  const middleware = createPaymentAvailabilityMiddleware({ enabled: true });
  const res = makeResponse();
  let nextCalled = false;

  middleware({}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});
