import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSentryEvent } from "../src/utils/sentryEventSanitizer.js";

test("Sentry event sanitizer removes user identity, payload, query and credential headers", () => {
  const result = sanitizeSentryEvent({
    user: { id: "user-123", email: "learner@example.com", ip_address: "203.0.113.1" },
    request: {
      url: "https://api.example.test/api/login?email=learner%40example.com&token=secret",
      method: "POST",
      data: { email: "learner@example.com", password: "secret" },
      query_string: "token=secret",
      cookies: "session=secret",
      env: { JWT_SECRET: "secret" },
      headers: {
        Authorization: "Bearer private-token",
        Cookie: "session=secret",
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    },
    exception: { values: [{ type: "Error", value: "Mongo connection failed for mongodb://user:secret@host/db" }] },
    extra: { authorization: "Bearer secret", email: "learner@example.com" }
  });

  assert.equal("user" in result, false);
  assert.equal("extra" in result, false);
  assert.equal(result.request.url, "https://api.example.test/api/login");
  assert.equal("data" in result.request, false);
  assert.equal("query_string" in result.request, false);
  assert.equal("cookies" in result.request, false);
  assert.equal("env" in result.request, false);
  assert.equal("Authorization" in result.request.headers, false);
  assert.equal("Cookie" in result.request.headers, false);
  assert.equal(result.request.headers["Content-Type"], "application/json");
  assert.equal(result.exception.values[0].value, "[redacted exception message]");
});

test("Sentry event sanitizer handles missing and malformed request URLs", () => {
  const result = sanitizeSentryEvent({
    message: "Raw error",
    breadcrumbs: [{ message: "GET /route?token=secret", data: { email: "learner@example.com", status: 500 } }],
    request: { url: "/api/course?token=secret", headers: { "x-api-key": "secret", Accept: "application/json" } }
  });
  assert.equal(result.message, "[redacted event message]");
  assert.equal(result.request.url, "/api/course");
  assert.deepEqual(result.request.headers, { Accept: "application/json" });
  assert.equal(result.breadcrumbs[0].message, "[redacted breadcrumb message]");
  assert.deepEqual(result.breadcrumbs[0].data, { status: 500 });
});

test("Sentry event sanitizer preserves non-sensitive diagnostics", () => {
  const result = sanitizeSentryEvent({
    tags: { route: "/api/courses", method: "GET", status: "500" },
    exception: { values: [{ type: "TypeError", value: "failure" }] }
  });
  assert.deepEqual(result.tags, { route: "/api/courses", method: "GET", status: "500" });
  assert.equal(result.exception.values[0].type, "TypeError");
  assert.equal(result.exception.values[0].value, "[redacted exception message]");
});
