import test from "node:test";
import assert from "node:assert/strict";
import { OperationalAlert } from "../src/models/OperationalAlert.js";
import { errorHandler } from "../src/middleware/error.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withMock(target, key, value, run) {
  const original = target[key];
  target[key] = value;
  try { await run(); } finally { target[key] = original; }
}

test("HTTP 5xx creates one sanitized operational alert without exposing route or exception data", async () => {
  const previousSentryDsn = process.env.SENTRY_DSN;
  const originalConsoleError = console.error;
  process.env.SENTRY_DSN = "";
  console.error = () => {};
  const res = responseRecorder();
  const req = {
    id: "request-test-123",
    method: "POST",
    path: "/api/payments/private-payment-id",
    get: () => ""
  };
  let captured;
  let finish;
  const persisted = new Promise((resolve) => { finish = resolve; });

  try {
    await withMock(OperationalAlert, "findOneAndUpdate", async (filter, update, options) => {
      captured = { filter, update, options };
      finish();
      return {};
    }, async () => {
      errorHandler(new Error("provider secret must not enter the alert"), req, res, () => {});
      await persisted;
    });
  } finally {
    console.error = originalConsoleError;
    if (previousSentryDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousSentryDsn;
  }

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(captured.filter.key, "api-http-5xx-errors");
  assert.equal(captured.update.$set.severity, "critical");
  assert.equal(captured.update.$set.source, "api-error-handler");
  assert.match(captured.update.$set.message, /HTTP 500/);
  assert.doesNotMatch(captured.update.$set.message, /private-payment-id|provider secret|request-test-123/);
  assert.equal(captured.options.upsert, true);
});

test("AI resource-quality rejection preserves actionable 503 details without leaking provider data", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = responseRecorder();
  let alertWrites = 0;
  const error = Object.assign(new Error("internal provider response must not leak"), {
    status: 503,
    code: "AI_RESOURCE_QUALITY_INSUFFICIENT",
    resourceQuality: {
      tutorialLessonCount: 12,
      lessonsWithResources: 0,
      uniqueVideoCount: 0,
      coverageRatio: 0,
      minimumCoverage: 0.75,
      reason: "insufficient_lesson_coverage",
      providerResponse: "secret"
    }
  });
  try {
    await withMock(OperationalAlert, "findOneAndUpdate", async () => { alertWrites += 1; return {}; }, async () => {
      errorHandler(error, {
        id: "request-ai-quality-123",
        method: "POST",
        path: "/api/ai/roadmap",
        get: () => ""
      }, res, () => {});
      await Promise.resolve();
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /suitable learning resources/i);
  assert.equal(res.body.errors.code, "AI_RESOURCE_QUALITY_INSUFFICIENT");
  assert.equal(res.body.errors.tutorialLessonCount, 12);
  assert.equal(res.body.errors.lessonsWithResources, 0);
  assert.equal(res.body.errors.reason, "insufficient_lesson_coverage");
  assert.equal("providerResponse" in res.body.errors, false);
  assert.equal(alertWrites, 1);
});

test("expected 4xx validation failures do not create API 5xx alerts", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  let alertWrites = 0;
  const res = responseRecorder();
  try {
    await withMock(OperationalAlert, "findOneAndUpdate", async () => { alertWrites += 1; return {}; }, async () => {
      errorHandler(Object.assign(new Error("invalid field"), { status: 422 }), {
        id: "request-test-456",
        method: "POST",
        path: "/api/profile",
        get: () => ""
      }, res, () => {});
      await Promise.resolve();
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 422);
  assert.equal(alertWrites, 0);
});
