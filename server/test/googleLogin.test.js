import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/google-login-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { googleLoginWithDependencies } = await import("../src/services/auth.service.js");

function verifiedPayload(overrides = {}) {
  return {
    sub: "google-subject-123",
    email: "Learner@Example.test",
    email_verified: true,
    name: "Learner Example",
    picture: "https://images.example.test/learner.png",
    ...overrides
  };
}

function makeExistingUser(overrides = {}) {
  return {
    _id: { toString: () => "existing-user-id" },
    name: "Existing Learner",
    email: "learner@example.test",
    role: "user",
    isActive: true,
    emailVerified: false,
    authProvider: "local",
    password: "synthetic-bcrypt-hash",
    profileImage: "",
    ...overrides
  };
}

function defaultDependencies({ payload = verifiedPayload(), user = null } = {}) {
  const state = { verifyOptions: null, lookup: null, created: null, saved: 0, tokenFor: null };
  const dependencies = {
    clientId: "test-web-client-id.apps.googleusercontent.com",
    verifyIdToken: async (options) => {
      state.verifyOptions = options;
      return { getPayload: () => payload };
    },
    findUser: async (filter) => {
      state.lookup = filter;
      return user;
    },
    createUser: async (document) => {
      state.created = document;
      return { _id: { toString: () => "new-google-user-id" }, ...document };
    },
    saveUser: async () => {
      state.saved += 1;
    },
    issueToken: (receivedUser) => {
      state.tokenFor = receivedUser;
      return "synthetic-access-token";
    }
  };
  return { dependencies, state };
}

test("Google sign-in verifies the configured audience and creates only a verified standard user", async () => {
  const { dependencies, state } = defaultDependencies();
  const result = await googleLoginWithDependencies("synthetic-google-id-token", null, dependencies);

  assert.deepEqual(state.verifyOptions, {
    idToken: "synthetic-google-id-token",
    audience: "test-web-client-id.apps.googleusercontent.com"
  });
  assert.deepEqual(state.lookup, {
    $or: [
      { googleId: "google-subject-123" },
      { email: "learner@example.test" }
    ]
  });
  assert.deepEqual(state.created, {
    name: "Learner Example",
    email: "learner@example.test",
    role: "user",
    isActive: true,
    googleId: "google-subject-123",
    profileImage: "https://images.example.test/learner.png",
    authProvider: "google",
    emailVerified: true
  });
  assert.equal(result.user.id, "new-google-user-id");
  assert.equal(result.user.email, "learner@example.test");
  assert.equal(result.user.role, "user");
  assert.equal(result.user.authProvider, "google");
  assert.equal(result.token, "synthetic-access-token");
});

test("Google sign-in links a verified Google identity to an existing local account", async () => {
  const existingUser = makeExistingUser();
  const { dependencies, state } = defaultDependencies({ user: existingUser });
  const result = await googleLoginWithDependencies("synthetic-google-id-token", null, dependencies);

  assert.equal(state.saved, 1);
  assert.equal(existingUser.googleId, "google-subject-123");
  assert.equal(existingUser.authProvider, "local_google");
  assert.equal(existingUser.emailVerified, true);
  assert.equal(existingUser.profileImage, "https://images.example.test/learner.png");
  assert.equal(result.user.authProvider, "local_google");
  assert.equal(result.token, "synthetic-access-token");
});

test("unverified Google email is rejected before account lookup or creation", async () => {
  const { dependencies, state } = defaultDependencies({
    payload: verifiedPayload({ email_verified: false })
  });

  await assert.rejects(
    googleLoginWithDependencies("synthetic-google-id-token", null, dependencies),
    (error) => error.status === 401 && error.message === "Google account could not be verified"
  );
  assert.equal(state.lookup, null);
  assert.equal(state.created, null);
});

test("inactive linked accounts cannot sign in through Google", async () => {
  const { dependencies, state } = defaultDependencies({
    user: makeExistingUser({ isActive: false })
  });

  await assert.rejects(
    googleLoginWithDependencies("synthetic-google-id-token", null, dependencies),
    (error) => error.status === 401 && error.message === "Account is inactive"
  );
  assert.equal(state.saved, 0);
  assert.equal(state.tokenFor, null);
});
