import test from "node:test";
import assert from "node:assert/strict";
import { registerSchema, resetPasswordSchema, changePasswordSchema } from "../src/validation/authSchemas.js";

const validRegistration = {
  name: "Learner Name",
  email: "learner@example.com",
  password: "correct-horse-42",
  termsAccepted: true,
  privacyAcknowledged: true
};

test("registration requires valid identity, password and legal acknowledgements", () => {
  assert.equal(registerSchema.safeParse(validRegistration).success, true);
  assert.equal(registerSchema.parse(validRegistration).marketingEmailConsent, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, name: "x" }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, name: "x".repeat(101) }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, email: "not-an-email" }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, termsAccepted: false }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, privacyAcknowledged: false }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, marketingEmailConsent: "yes" }).success, false);
});

test("new registration and password-reset passwords do not exceed bcrypt's UTF-8 byte limit", () => {
  assert.equal(registerSchema.safeParse({ ...validRegistration, password: "a".repeat(72) }).success, true);
  assert.equal(registerSchema.safeParse({ ...validRegistration, password: "a".repeat(73) }).success, false);
  assert.equal(registerSchema.safeParse({ ...validRegistration, password: "😀".repeat(19) }).success, false);
  assert.equal(resetPasswordSchema.safeParse({
    email: "learner@example.com", otp: "123456", newPassword: "a".repeat(73)
  }).success, false);
  assert.equal(changePasswordSchema.safeParse({
    currentPassword: "legacy-password", newPassword: "😀".repeat(19)
  }).success, false);
});

test("OTP formats and password confirmation boundaries are enforced", () => {
  assert.equal(resetPasswordSchema.safeParse({
    email: "learner@example.com", otp: "12345", newPassword: "correct-horse-42"
  }).success, false);
  assert.equal(changePasswordSchema.safeParse({
    currentPassword: "", newPassword: "correct-horse-42"
  }).success, false);
});
