import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/auth-token-revocation-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const jwtModule = await import("jsonwebtoken");
const jwt = jwtModule.default ?? jwtModule;
const { User } = await import("../src/models/User.js");
const { authMiddleware, optionalAuthMiddleware } = await import("../src/middleware/auth.js");
const { signAccessToken, isTokenVersionCurrent } = await import("../src/utils/jwt.js");
const { revokeAllSessions, changePassword } = await import("../src/services/auth.service.js");
const { env } = await import("../src/config/env.js");

function makeUser(version = 0, overrides = {}) {
  return {
    _id: { toString: () => "token-test-user" },
    role: "user",
    isActive: true,
    authTokenVersion: version,
    adminRole: undefined,
    adminPermissionOverrides: [],
    email: "learner@example.test",
    name: "Learner Example",
    authProvider: "local",
    emailVerified: true,
    password: "old-hash",
    comparePassword: async (password) => password === "old-password",
    ...overrides
  };
}

function responseMock() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function signedLegacyToken(userId = "token-test-user", options = {}) {
  return jwt.sign({ userId, role: "user", accessType: "user" }, env.jwtSecret, options);
}

test("fresh token version is accepted and a token from an older version is rejected", async () => {
  const user = makeUser(2);
  const originalFindById = User.findById;
  try {
    User.findById = () => ({ select: async () => user });

    const freshResponse = responseMock();
    let freshNext = false;
    await authMiddleware(
      { headers: { authorization: "Bearer " + signAccessToken(user) } },
      freshResponse,
      () => { freshNext = true; }
    );
    assert.equal(freshNext, true);
    assert.equal(freshResponse.statusCode, null);

    const staleResponse = responseMock();
    let staleNext = false;
    await authMiddleware(
      { headers: { authorization: "Bearer " + signAccessToken(makeUser(1)) } },
      staleResponse,
      () => { staleNext = true; }
    );
    assert.equal(staleNext, false);
    assert.equal(staleResponse.statusCode, 401);
    assert.equal(staleResponse.body.message, "Authentication token has been revoked");
  } finally {
    User.findById = originalFindById;
  }
});

test("legacy tokens work only while the user token version remains zero", async () => {
  const originalFindById = User.findById;
  try {
    let user = makeUser(0);
    User.findById = () => ({ select: async () => user });
    const allowedResponse = responseMock();
    let allowedNext = false;
    await authMiddleware(
      { headers: { authorization: "Bearer " + signedLegacyToken() } },
      allowedResponse,
      () => { allowedNext = true; }
    );
    assert.equal(allowedNext, true);

    user = makeUser(1);
    const revokedResponse = responseMock();
    let revokedNext = false;
    await optionalAuthMiddleware(
      { headers: { authorization: "Bearer " + signedLegacyToken() } },
      revokedResponse,
      () => { revokedNext = true; }
    );
    assert.equal(revokedNext, false);
    assert.equal(revokedResponse.statusCode, 401);
    assert.equal(revokedResponse.body.message, "Authentication token has been revoked");
  } finally {
    User.findById = originalFindById;
  }
});

test("malformed and expired tokens are rejected with 401", async () => {
  const originalFindById = User.findById;
  try {
    User.findById = () => ({ select: async () => makeUser(0) });
    const malformed = responseMock();
    await authMiddleware(
      { headers: { authorization: "Bearer not.a.jwt" } },
      malformed,
      () => assert.fail("malformed token must not pass")
    );
    assert.equal(malformed.statusCode, 401);

    const expired = responseMock();
    await authMiddleware(
      { headers: { authorization: "Bearer " + signedLegacyToken("token-test-user", { expiresIn: -1 }) } },
      expired,
      () => assert.fail("expired token must not pass")
    );
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.body.message, "Authentication token expired");
  } finally {
    User.findById = originalFindById;
  }
});

test("logout revocation invalidates tokens from multiple devices", async () => {
  const user = makeUser(0);
  const firstDeviceToken = signAccessToken(user);
  const secondDeviceToken = signAccessToken(user);
  const originalUpdateOne = User.updateOne;
  try {
    User.updateOne = async (filter, update) => {
      assert.equal(String(filter._id), "token-test-user");
      assert.deepEqual(update, { $inc: { authTokenVersion: 1 } });
      user.authTokenVersion += 1;
      return { matchedCount: 1, modifiedCount: 1 };
    };

    await revokeAllSessions(user._id);
    assert.equal(isTokenVersionCurrent(jwt.verify(firstDeviceToken, env.jwtSecret), user), false);
    assert.equal(isTokenVersionCurrent(jwt.verify(secondDeviceToken, env.jwtSecret), user), false);
    assert.equal(isTokenVersionCurrent(jwt.verify(signAccessToken(user), env.jwtSecret), user), true);
  } finally {
    User.updateOne = originalUpdateOne;
  }
});

test("password change atomically rotates sessions and returns a token for the new version", async () => {
  const user = makeUser(4);
  const oldToken = signAccessToken(user);
  const originals = {
    findById: User.findById,
    findOneAndUpdate: User.findOneAndUpdate,
    hashPassword: User.hashPassword
  };
  let capturedFilter;
  let capturedUpdate;
  try {
    User.findById = () => ({ select: async () => user });
    User.hashPassword = async () => "new-password-hash";
    User.findOneAndUpdate = (filter, update) => {
      capturedFilter = filter;
      capturedUpdate = update;
      return {
        select: async () => ({ ...user, password: update.$set.password, authTokenVersion: user.authTokenVersion + 1 })
      };
    };

    const result = await changePassword("token-test-user", {
      currentPassword: "old-password",
      newPassword: "new-password"
    });

    assert.equal(capturedFilter.authTokenVersion, 4);
    assert.deepEqual(capturedUpdate.$inc, { authTokenVersion: 1 });
    assert.equal(capturedUpdate.$set.password, "new-password-hash");
    const oldPayload = jwt.verify(oldToken, env.jwtSecret);
    const newPayload = jwt.verify(result.token, env.jwtSecret);
    assert.equal(isTokenVersionCurrent(oldPayload, { authTokenVersion: 5 }), false);
    assert.equal(isTokenVersionCurrent(newPayload, { authTokenVersion: 5 }), true);
    assert.equal(result.user.authTokenVersion, undefined);
  } finally {
    User.findById = originals.findById;
    User.findOneAndUpdate = originals.findOneAndUpdate;
    User.hashPassword = originals.hashPassword;
  }
});

test("malformed token-version claims are rejected and token version is not serialized publicly", () => {
  const user = new User({
    name: "Learner Example",
    email: "learner@example.test",
    authTokenVersion: 3
  });
  assert.equal(user.toJSON().authTokenVersion, undefined);
  assert.equal(isTokenVersionCurrent({ tokenVersion: -1 }, user), false);
  assert.equal(isTokenVersionCurrent({ tokenVersion: "3" }, user), false);
  assert.equal(isTokenVersionCurrent({ tokenVersion: 3 }, user), true);
});
