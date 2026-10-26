import test from "node:test";
import assert from "node:assert/strict";

// Import the controller only after supplying test-safe required configuration.
// The invalid-input cases must return before any database/provider operation.
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/auth-registration-validation-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { register } = await import("../src/controllers/auth.controller.js");

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
    },
  };
}

const validRegistration = {
  name: "Learner Example",
  email: "learner@example.test",
  password: "StrongPassword123",
  termsAccepted: true,
  privacyAcknowledged: true,
  marketingEmailConsent: false,
};

const invalidCases = [
  ["missing body", undefined],
  ["name shorter than minimum", { ...validRegistration, name: "A" }],
  ["name longer than maximum", { ...validRegistration, name: "N".repeat(101) }],
  ["invalid email", { ...validRegistration, email: "not-an-email" }],
  ["password shorter than minimum", { ...validRegistration, password: "1234567" }],
  ["password longer than maximum", { ...validRegistration, password: "P".repeat(129) }],
  ["terms not accepted", { ...validRegistration, termsAccepted: false }],
  ["privacy acknowledgement missing", { ...validRegistration, privacyAcknowledged: false }],
  ["marketing consent must be boolean", { ...validRegistration, marketingEmailConsent: "yes" }],
];

test("registration rejects malformed input and every schema boundary before service work", async (t) => {
  for (const [label, body] of invalidCases) {
    await t.test(label, async () => {
      const res = mockResponse();
      await register({ body }, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.message, "Validation failed");
    });
  }
});
