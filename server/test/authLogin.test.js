import test from "node:test";
import assert from "node:assert/strict";
import { loginWithDependencies } from "../src/services/auth.service.js";

function makeUser(overrides = {}) {
  return {
    _id: "user-1",
    email: "learner@example.com",
    isActive: true,
    emailVerified: true,
    authProvider: "local",
    comparePassword: async (password) => password === "StrongPassword123",
    ...overrides
  };
}

function dependencies(user, events = []) {
  return {
    findUserByEmail: async (email) => {
      events.push(["lookup", email]);
      return user;
    },
    sendOtp: async (receivedUser, purpose) => {
      events.push(["sendOtp", receivedUser, purpose]);
      return { email: receivedUser.email };
    }
  };
}

test("successful login normalizes email and starts the login OTP challenge", async () => {
  const user = makeUser();
  const events = [];
  const result = await loginWithDependencies(
    { email: " Learner@Example.COM ", password: "StrongPassword123" },
    dependencies(user, events)
  );

  assert.deepEqual(result, {
    requiresOtp: true,
    purpose: "login_verification",
    email: "learner@example.com"
  });
  assert.deepEqual(events, [
    ["lookup", "learner@example.com"],
    ["sendOtp", user, "login_verification"]
  ]);
});

test("unknown account and incorrect password share the same safe 401 result", async (t) => {
  await t.test("unknown account", async () => {
    const events = [];
    await assert.rejects(
      loginWithDependencies(
        { email: "missing@example.com", password: "StrongPassword123" },
        dependencies(null, events)
      ),
      (error) => error.status === 401 && error.isOperational === true && error.message === "Invalid email or password"
    );
    assert.deepEqual(events, [["lookup", "missing@example.com"]]);
  });

  await t.test("incorrect password", async () => {
    const events = [];
    await assert.rejects(
      loginWithDependencies(
        { email: "learner@example.com", password: "wrong-password" },
        dependencies(makeUser(), events)
      ),
      (error) => error.status === 401 && error.isOperational === true && error.message === "Invalid email or password"
    );
    assert.equal(events.some((event) => event[0] === "sendOtp"), false);
  });
});

test("inactive users cannot start login OTP challenge", async () => {
  const events = [];
  await assert.rejects(
    loginWithDependencies(
      { email: "learner@example.com", password: "StrongPassword123" },
      dependencies(makeUser({ isActive: false }), events)
    ),
    (error) => error.status === 401 && error.message === "Account is inactive"
  );
  assert.equal(events.some((event) => event[0] === "sendOtp"), false);
});

test("unverified local users cannot start login OTP challenge", async () => {
  const events = [];
  await assert.rejects(
    loginWithDependencies(
      { email: "learner@example.com", password: "StrongPassword123" },
      dependencies(makeUser({ emailVerified: false }), events)
    ),
    (error) => error.status === 403 && error.message === "Email not verified. Please verify your email before signing in."
  );
  assert.equal(events.some((event) => event[0] === "sendOtp"), false);
});
