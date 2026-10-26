import test from "node:test";
import assert from "node:assert/strict";
import { getProductionConfigErrors } from "../src/config/productionConfigValidation.js";

const validConfig = {
  MONGO_URI: "mongodb+srv://bfs-prod-user:strong-db-password@cluster0.example.mongodb.net/buddyforstudy?retryWrites=true&w=majority",
  JWT_SECRET: "a-production-secret-that-is-longer-than-32-characters",
  CLIENT_URL: "https://buddyforstudy.example",
  API_URL: "https://api.buddyforstudy.example",
  SMTP_HOST: "smtp.buddyforstudy.example",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "noreply@buddyforstudy.example",
  SMTP_PASS: "smtp-provider-token-012345",
  MAIL_FROM: "noreply@buddyforstudy.example",
  RAZORPAY_KEY_ID: "rzp_live_0123456789abcdef",
  RAZORPAY_KEY_SECRET: "provider-secret-0123456789abcdef",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret-0123456789abcdef0123456789",
};

test("production config accepts secure URLs, MongoDB TLS, and live payment credentials", () => {
  assert.deepEqual(getProductionConfigErrors(validConfig), []);
});

test("production config rejects weak JWT secrets and placeholder values", () => {
  for (const secret of ["short", "ci-test-secret", "change-me-in-production"]) {
    assert.ok(getProductionConfigErrors({ ...validConfig, JWT_SECRET: secret }).some((error) => error.includes("JWT_SECRET")));
  }
});

test("production config requires HTTPS frontend and API URLs", () => {
  for (const [key, value] of [
    ["CLIENT_URL", "http://localhost:5173"],
    ["CLIENT_URL", "not-a-url"],
    ["API_URL", ""],
    ["API_URL", "http://api.buddyforstudy.example"],
  ]) {
    assert.ok(getProductionConfigErrors({ ...validConfig, [key]: value }).some((error) => error.includes(key)));
  }
});

test("production config rejects local, unauthenticated, or non-TLS MongoDB URIs", () => {
  for (const uri of [
    "mongodb://127.0.0.1:27017/buddyforstudy",
    "mongodb://host.example/buddyforstudy?tls=false",
    "mongodb+srv://user:password@host.example/buddyforstudy?tls=false",
    "mongodb+srv://host.example/",
    "not-a-uri",
  ]) {
    assert.ok(getProductionConfigErrors({ ...validConfig, MONGO_URI: uri }).some((error) => error.includes("MONGO_URI")));
  }
});

test("production config requires a live-mode Razorpay key and sufficiently strong secrets", () => {
  assert.ok(getProductionConfigErrors({ ...validConfig, RAZORPAY_KEY_ID: "rzp_test_0123456789abcdef" }).some((error) => error.includes("RAZORPAY_KEY_ID")));
  assert.ok(getProductionConfigErrors({ ...validConfig, RAZORPAY_KEY_SECRET: "short" }).some((error) => error.includes("RAZORPAY_KEY_SECRET")));
  assert.ok(getProductionConfigErrors({ ...validConfig, RAZORPAY_WEBHOOK_SECRET: "short" }).some((error) => error.includes("RAZORPAY_WEBHOOK_SECRET")));
});

test("production config requires valid SMTP for email authentication", () => {
  for (const [key, value] of [
    ["SMTP_HOST", ""],
    ["SMTP_HOST", "localhost"],
    ["SMTP_PORT", "70000"],
    ["SMTP_USER", ""],
    ["SMTP_PASS", "short"],
    ["MAIL_FROM", "not-an-email"],
    ["SMTP_SECURE", "sometimes"],
  ]) {
    assert.ok(getProductionConfigErrors({ ...validConfig, [key]: value }).some((error) => error.includes(key.replace("MAIL_FROM", "MAIL_FROM")) || error.includes("SMTP")));
  }
});

test("production config requires Web Push values as a complete set", () => {
  const errors = getProductionConfigErrors({
    ...validConfig,
    WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
    WEB_PUSH_SUBJECT: "mailto:ops@buddyforstudy.example",
  });
  assert.ok(errors.some((error) => error.includes("must be configured together")));
});

test("production config requires TLS and authentication when Redis is configured", () => {
  assert.ok(getProductionConfigErrors({ ...validConfig, REDIS_URL: "redis://cache.example:6379" }).some((error) => error.includes("rediss://")));
  assert.deepEqual(getProductionConfigErrors({ ...validConfig, REDIS_URL: "rediss://default:password@cache.example:6379" }), []);
});

test("production config requires all Razorpay values", () => {
  const errors = getProductionConfigErrors({
    ...validConfig,
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RAZORPAY_WEBHOOK_SECRET: "",
  });
  assert.equal(errors.filter((error) => error.includes("RAZORPAY_")).length, 3);
});
