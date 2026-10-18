import test from "node:test";
import assert from "node:assert/strict";
import { calculateRemainingRefundableAmount, validateRefundAmount } from "../src/services/refundBalance.service.js";

test("remaining refundable balance subtracts only already-processed refunds", () => {
  assert.equal(calculateRemainingRefundableAmount(100, 25), 75);
  assert.equal(calculateRemainingRefundableAmount(100, 100), 0);
  assert.equal(calculateRemainingRefundableAmount(100, 125), 0);
});

test("remaining refundable balance safely handles invalid values", () => {
  assert.equal(calculateRemainingRefundableAmount("invalid", 0), 0);
  assert.equal(calculateRemainingRefundableAmount(100, -1), 0);
});

test("refund amount defaults to the remaining balance and rejects invalid or excessive values", () => {
  assert.deepEqual(validateRefundAmount(undefined, 75), { valid: true, amount: 75 });
  assert.deepEqual(validateRefundAmount("25.555", 75), { valid: true, amount: 25.56 });
  assert.equal(validateRefundAmount(0, 75).valid, false);
  assert.equal(validateRefundAmount(-1, 75).valid, false);
  assert.equal(validateRefundAmount("abc", 75).valid, false);
  assert.equal(validateRefundAmount(76, 75).valid, false);
  assert.equal(validateRefundAmount(1, 0).valid, false);
});
