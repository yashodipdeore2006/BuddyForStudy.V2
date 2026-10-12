import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuditSnapshot } from "../src/utils/auditSanitizer.js";

test("sanitizeAuditSnapshot redacts secret-like keys at every nesting level", () => {
  const result = sanitizeAuditSnapshot({
    title: "Course update",
    apiKey: "provider-secret",
    nested: {
      accessToken: "bearer-token",
      smtp_password: "mail-password",
      safeValue: "visible",
    },
  });

  assert.equal(result.title, "Course update");
  assert.equal(result.apiKey, "[redacted]");
  assert.equal(result.nested.accessToken, "[redacted]");
  assert.equal(result.nested.smtp_password, "[redacted]");
  assert.equal(result.nested.safeValue, "visible");
});

test("sanitizeAuditSnapshot bounds strings, arrays, object keys, and recursion depth", () => {
  const longString = "x".repeat(1500);
  const longArray = Array.from({ length: 60 }, (_, index) => index);
  const wideObject = Object.fromEntries(Array.from({ length: 110 }, (_, index) => [`key${index}`, index]));
  const deepObject = { a: { b: { c: { d: { e: { f: { g: "hidden depth" } } } } } } };

  assert.equal(sanitizeAuditSnapshot(longString).length, 1000);
  assert.equal(sanitizeAuditSnapshot(longArray).length, 50);
  assert.equal(Object.keys(sanitizeAuditSnapshot(wideObject)).length, 100);
  assert.equal(sanitizeAuditSnapshot(deepObject).a.b.c.d.e.f.g, undefined);
  assert.equal(sanitizeAuditSnapshot(deepObject).a.b.c.d.e.f, "[truncated]");
});

test("sanitizeAuditSnapshot serializes dates safely and preserves nulls", () => {
  assert.equal(sanitizeAuditSnapshot(null), null);
  assert.equal(sanitizeAuditSnapshot(new Date("2026-01-02T03:04:05.000Z")), "2026-01-02T03:04:05.000Z");
});
