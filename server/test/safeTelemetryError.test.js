import test from "node:test";
import assert from "node:assert/strict";
import { safeTelemetryError } from "../src/utils/safeTelemetryError.js";

test("safe telemetry error excludes provider messages and prompt text", () => {
  const prompt = "learner private prompt with bearer sk-secret-value";
  const result = safeTelemetryError(Object.assign(new Error(prompt), {
    code: "invalid_request",
    status: 502
  }));
  assert.deepEqual(result, {
    errorType: "Error",
    errorCode: "INVALID_REQUEST",
    statusCode: 502
  });
  assert.equal(JSON.stringify(result).includes(prompt), false);
  assert.equal(JSON.stringify(result).includes("sk-secret-value"), false);
});

test("safe telemetry error rejects unsafe error codes and status values", () => {
  assert.deepEqual(safeTelemetryError({
    name: "Provider Error",
    code: "secret=abc",
    status: 999
  }), { errorType: "Error" });
});
