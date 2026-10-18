import test from "node:test";
import assert from "node:assert/strict";
import { getProductionConfigErrors } from "../src/config/productionConfigValidation.js";

const validConfig = {
  JWT_SECRET: "a-production-secret-that-is-longer-than-32-characters",
  CLIENT_URL: "https://buddyforstudy.example",
  RAZORPAY_KEY_ID: "rzp_live_example",
  RAZORPAY_KEY_SECRET: "provider-secret",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
};

test("production config accepts secure URLs and configured payment credentials", () => {
  assert.deepEqual(getProductionConfigErrors(validConfig), []);
});

test("production config rejects weak JWT secrets and placeholder values", () => {
  for (const secret of ["short", "ci-test-secret", "change-me-in-production"]) {
    assert.ok(getProductionConfigErrors({ ...validConfig, JWT_SECRET: secret }).some((error) => error.includes("JWT_SECRET")));
  }
});

test("production config requires HTTPS frontend origin and rejects localhost", () => {
  assert.ok(getProductionConfigErrors({ ...validConfig, CLIENT_URL: "http://localhost:5173" }).some((error) => error.includes("CLIENT_URL")));
  assert.ok(getProductionConfigErrors({ ...validConfig, CLIENT_URL: "not-a-url" }).some((error) => error.includes("CLIENT_URL")));
});

test("production config requires all Razorpay secrets", () => {
  const errors = getProductionConfigErrors({
    ...validConfig,
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RAZORPAY_WEBHOOK_SECRET: "",
  });
  assert.equal(errors.filter((error) => error.includes("RAZORPAY_")).length, 3);
});
