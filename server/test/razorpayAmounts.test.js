import test from "node:test";
import assert from "node:assert/strict";
import {
  getRazorpayCurrencyPrecision,
  toRazorpayMinorUnits,
  fromRazorpayMinorUnits,
  normalizeRazorpayAmount
} from "../src/utils/razorpayAmounts.js";

test("INR and two-decimal currencies convert major and minor units without losing paise", () => {
  assert.equal(toRazorpayMinorUnits(19.99, "INR"), 1999);
  assert.equal(fromRazorpayMinorUnits(1999, "INR"), 19.99);
  assert.equal(toRazorpayMinorUnits(12.5, "USD"), 1250);
  assert.equal(fromRazorpayMinorUnits(1250, "USD"), 12.5);
});

test("zero-decimal currencies use whole-unit provider values", () => {
  assert.equal(getRazorpayCurrencyPrecision("JPY"), 0);
  assert.equal(toRazorpayMinorUnits(125, "JPY"), 125);
  assert.equal(fromRazorpayMinorUnits(125, "JPY"), 125);
  assert.equal(normalizeRazorpayAmount(125.4, "JPY"), 125);
  assert.throws(() => toRazorpayMinorUnits(125.4, "JPY"), /fractional digits|precision/i);
});

test("Razorpay three-decimal currencies use supported two-decimal display values and x1000 provider units", () => {
  for (const currency of ["BHD", "KWD", "OMR"]) {
    assert.equal(getRazorpayCurrencyPrecision(currency), 2);
    assert.equal(toRazorpayMinorUnits(1.23, currency), 1230);
    assert.equal(fromRazorpayMinorUnits(1230, currency), 1.23);
    assert.throws(() => toRazorpayMinorUnits(1.234, currency), /fractional digits|precision/i);
    assert.throws(() => fromRazorpayMinorUnits(1231, currency), /precision/i);
  }
});

test("amount conversion rejects negative, non-finite, unsupported precision and invalid currency values", () => {
  for (const value of [-1, NaN, Infinity, -Infinity, null, undefined, ""]) {
    assert.throws(() => toRazorpayMinorUnits(value, "INR"));
  }
  assert.throws(() => toRazorpayMinorUnits(1, "INVALID"), /Currency must be a three-letter code/i);
  assert.throws(() => toRazorpayMinorUnits(1.2345, "CLF"), /precision/i);
});
