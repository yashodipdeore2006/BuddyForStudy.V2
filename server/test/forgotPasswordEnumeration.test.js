import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/forgot-password-enumeration-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { handleForgotPasswordRequest } = await import("../src/controllers/auth.controller.js");

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

const request = { body: { email: " Learner@Example.test " } };

test("forgot-password response is identical when no account is found or a reset request fails", async () => {
  const missingAccountResponse = mockResponse();
  await handleForgotPasswordRequest(
    request,
    missingAccountResponse,
    async () => ({ email: "learner@example.test" })
  );

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    for (const status of [429, 503]) {
      const errorResponse = mockResponse();
      await handleForgotPasswordRequest(
        request,
        errorResponse,
        async () => {
          throw Object.assign(new Error("provider detail must not be logged or returned"), {
            status,
            isOperational: true
          });
        }
      );
      assert.equal(errorResponse.statusCode, missingAccountResponse.statusCode);
      assert.deepEqual(errorResponse.body, missingAccountResponse.body);
    }
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [
    ["[auth] Password reset request processing failed", { status: 429 }],
    ["[auth] Password reset request processing failed", { status: 503 }]
  ]);
  assert.equal(JSON.stringify(warnings).includes("provider detail"), false);
});

test("forgot-password still validates malformed email without invoking the reset service", async () => {
  const res = mockResponse();
  let serviceCalls = 0;
  await handleForgotPasswordRequest(
    { body: { email: "not-an-email" } },
    res,
    async () => {
      serviceCalls += 1;
    }
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(serviceCalls, 0);
});
