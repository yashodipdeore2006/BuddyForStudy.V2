import test from "node:test";
import assert from "node:assert/strict";
import { GROSS_COLLECTION_PAYMENT_STATUSES, calculateNetRevenue } from "../src/services/billingMetrics.service.js";

test("gross collections include fully refunded payments so refunds are subtracted exactly once", () => {
  assert.deepEqual(GROSS_COLLECTION_PAYMENT_STATUSES, ["paid", "partially_refunded", "refunded"]);
  const gross = 100 + 50;
  const processedRefunds = 150;
  assert.equal(calculateNetRevenue(gross, processedRefunds), 0);
});

test("net revenue rounds to cents and preserves negative balances instead of clamping them", () => {
  assert.equal(calculateNetRevenue(100, 25.56), 74.44);
  assert.equal(calculateNetRevenue(10, 12), -2);
});

test("invalid metric values safely fall back to zero", () => {
  assert.equal(calculateNetRevenue("invalid", 3), -3);
  assert.equal(calculateNetRevenue(10, Number.NaN), 10);
});
