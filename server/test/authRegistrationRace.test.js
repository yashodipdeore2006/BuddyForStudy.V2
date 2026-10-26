import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { register } from "../src/services/auth.service.js";

test("registration maps a duplicate-key race to an expected 409 response", async () => {
  const originalFindOne = User.findOne;
  const originalHashPassword = User.hashPassword;
  const originalCreate = User.create;
  try {
    User.findOne = async () => null;
    User.hashPassword = async () => "synthetic-password-hash";
    User.create = async () => {
      const error = new Error("E11000 duplicate key error collection: users index: email_1 dup key");
      error.code = 11000;
      error.keyPattern = { email: 1 };
      throw error;
    };

    await assert.rejects(
      register({
        name: "Learner Name",
        email: "learner@example.com",
        password: "correct-horse-42",
        termsAccepted: true,
        privacyAcknowledged: true,
        marketingEmailConsent: false
      }),
      (error) => error.status === 409 && error.isOperational === true && error.message === "Email is already registered"
    );
  } finally {
    User.findOne = originalFindOne;
    User.hashPassword = originalHashPassword;
    User.create = originalCreate;
  }
});
