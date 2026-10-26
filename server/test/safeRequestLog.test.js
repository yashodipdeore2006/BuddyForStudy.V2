import test from "node:test";
import assert from "node:assert/strict";
import { safeRequestLog } from "../src/utils/safeRequestLog.js";

test("production request logs omit query strings, dynamic identifiers and client details", () => {
  const req = {
    path: "/api/auth/reset-password",
    originalUrl: "/api/auth/reset-password?email=private%40example.com&token=secret",
    ip: "203.0.113.25",
    headers: { referer: "https://private.example/reset?token=secret", "user-agent": "private browser data" }
  };
  const res = { statusCode: 200 };
  const tokens = {
    method: () => "POST",
    status: () => "200",
    "response-time": () => "12.5",
    res: () => "123"
  };
  const output = safeRequestLog(tokens, req, res);
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed, { method: "POST", route: "/api/auth/*", status: 200, responseTimeMs: 12.5, contentLength: 123 });
  assert.equal(output.includes("private@example.com"), false);
  assert.equal(output.includes("secret"), false);
  assert.equal(output.includes("203.0.113.25"), false);
  assert.equal(output.includes("private browser data"), false);
});

test("request log safely handles unknown response metadata", () => {
  const output = safeRequestLog({
    method: () => null, status: () => null, "response-time": () => "not-a-number", res: () => undefined
  }, { path: "/" }, {});
  assert.deepEqual(JSON.parse(output), { method: "UNKNOWN", route: "/", status: 0, responseTimeMs: 0, contentLength: null });
});
