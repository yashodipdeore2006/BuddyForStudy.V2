import test from "node:test";
import assert from "node:assert/strict";
import {
  googleLoginWithDependencies,
  verifyEmail,
  verifyLogin
} from "../src/services/auth.service.js";

function makeUser(overrides = {}) {
  return {
    _id: "learner-auth-1",
    name: "Learner",
    email: "learner@example.com",
    role: "user",
    isActive: true,
    profileImage: "",
    authProvider: "local",
    emailVerified: true,
    phoneNumber: "",
    phoneNumberVerified: false,
    city: "",
    address: {},
    learningGoal: "",
    profileSetupSkippedAt: null,
    termsAcceptedVersion: "terms-v1",
    privacyAcknowledgedVersion: "privacy-v1",
    marketingEmailConsent: false,
    async save() {},
    ...overrides
  };
}

test("local registration receives its default Free assignment only after email verification", async () => {
  const events = [];
  const user = makeUser({ emailVerified: false, async save() { events.push("save-verified-user"); } });

  const result = await verifyEmail(
    { email: "learner@example.com", otp: "123456" },
    {
      verifyOtp: async (input) => {
        events.push(["verify-otp", input.purpose]);
        return { user: user._id };
      },
      findUserById: async (id) => {
        events.push(["find-user", id]);
        return user;
      },
      ensureFreePlanSubscription: async (id) => {
        events.push(["assign-free", id]);
      },
      issueToken: () => {
        events.push("issue-token");
        return "local-token";
      }
    }
  );

  assert.equal(user.emailVerified, true);
  assert.deepEqual(events, [
    ["verify-otp", "email_verification"],
    ["find-user", user._id],
    "save-verified-user",
    ["assign-free", user._id],
    "issue-token"
  ]);
  assert.equal(result.token, "local-token");
  assert.equal(result.user.id, user._id);
});

test("returning local learners are checked for the idempotent Free default after login OTP", async () => {
  const events = [];
  const user = makeUser();

  const result = await verifyLogin(
    { email: user.email, otp: "654321" },
    {
      verifyOtp: async (input) => {
        events.push(["verify-otp", input.purpose]);
        return { user: user._id };
      },
      findUserById: async (id) => {
        events.push(["find-user", id]);
        return user;
      },
      ensureFreePlanSubscription: async (id) => {
        events.push(["assign-free", id]);
      },
      issueToken: () => {
        events.push("issue-token");
        return "login-token";
      }
    }
  );

  assert.deepEqual(events, [
    ["verify-otp", "login_verification"],
    ["find-user", user._id],
    ["assign-free", user._id],
    "issue-token"
  ]);
  assert.equal(result.token, "login-token");
  assert.equal(result.user.id, user._id);
});

test("Google learners receive the Free default after identity verification and consent handling", async () => {
  const events = [];
  const user = makeUser({ _id: "google-learner", email: "google@example.com", authProvider: "google" });

  const result = await googleLoginWithDependencies(
    "google-id-token",
    { termsAccepted: true, privacyAcknowledged: true, marketingEmailConsent: false },
    {
      clientId: "google-client-id",
      verifyIdToken: async (options) => {
        events.push(["verify-google", options.audience]);
        return {
          getPayload: () => ({
            sub: "google-subject-1",
            email: user.email,
            email_verified: true,
            name: user.name,
            picture: ""
          })
        };
      },
      findUser: async (filter) => {
        events.push(["find-user", filter.$or.length]);
        return null;
      },
      createUser: async (document) => {
        events.push(["create-user", document.authProvider]);
        return user;
      },
      acceptConsent: async (userId, consent) => {
        events.push(["accept-consent", userId, consent.source]);
      },
      findUserById: async (userId) => {
        events.push(["reload-user", userId]);
        return user;
      },
      ensureFreePlanSubscription: async (userId) => {
        events.push(["assign-free", userId]);
      },
      issueToken: () => {
        events.push("issue-token");
        return "google-token";
      }
    }
  );

  assert.deepEqual(events, [
    ["verify-google", "google-client-id"],
    ["find-user", 2],
    ["create-user", "google"],
    ["accept-consent", user._id, "registration"],
    ["reload-user", user._id],
    ["assign-free", user._id],
    "issue-token"
  ]);
  assert.equal(result.token, "google-token");
  assert.equal(result.user.id, user._id);
});

test("a rejected authentication verification never triggers Free-plan assignment", async () => {
  let assignments = 0;
  await assert.rejects(
    verifyLogin(
      { email: "learner@example.com", otp: "000000" },
      {
        verifyOtp: async () => { throw new Error("Invalid OTP"); },
        ensureFreePlanSubscription: async () => { assignments += 1; }
      }
    ),
    /Invalid OTP/
  );
  assert.equal(assignments, 0);
});
