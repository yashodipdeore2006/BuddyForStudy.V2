import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { acceptInvitation, createInvitation, revokeInvitation } from "../src/controllers/adminInvitations.controller.js";
import { AdminInvitation } from "../src/models/AdminInvitation.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import { User } from "../src/models/User.js";

function makeResponse() {
  const result = { statusCode: 200, body: undefined };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
}

const token = "a".repeat(43);
const email = "invitee@example.com";
const invitationId = "507f1f77bcf86cd799439011";
const acceptedAt = new Date("2026-10-18T10:00:00.000Z");

function makeInvitation(overrides = {}) {
  return {
    _id: { toString: () => invitationId },
    email,
    name: "Invited Admin",
    adminRole: "support_manager",
    invitedBy: "507f191e810c19729de860ea",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date("2026-10-19T10:00:00.000Z"),
    ...overrides
  };
}

async function withMocks(mocks, run) {
  const originals = new Map();
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.set(`${originals.size}`, { target, key, value: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, value } of [...originals.values()].reverse()) {
      target[key] = value;
    }
  }
}

function request(overrides = {}) {
  return {
    body: { email, token, password: "a-strong-password-123", ...overrides },
    ip: "127.0.0.1",
    get: () => "admin-invitation-test"
  };
}

function findInvitationQuery(invitation) {
  return { select: async () => invitation };
}

test("acceptance rejects an invalid, expired, revoked, or previously used invitation", async () => {
  await withMocks([
    [AdminInvitation, { findOne: () => findInvitationQuery(null) }]
  ], async () => {
    const res = makeResponse();
    let nextCalled = false;
    await acceptInvitation(request(), res, () => { nextCalled = true; });
    assert.equal(res.result.statusCode, 400);
    assert.match(res.result.body.message, /invalid, expired, or has already been used/i);
    assert.equal(nextCalled, false);
  });
});

test("acceptance rejects a name that does not match the invitation", async () => {
  const invitation = makeInvitation();
  await withMocks([
    [AdminInvitation, { findOne: () => findInvitationQuery(invitation) }]
  ], async () => {
    const res = makeResponse();
    await acceptInvitation(request({ name: "Someone Else" }), res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 400);
    assert.match(res.result.body.message, /name does not match/i);
  });
});

test("acceptance atomically rejects a concurrent request that loses the invitation claim", async () => {
  const invitation = makeInvitation();
  let userCreateCalls = 0;
  await withMocks([
    [AdminInvitation, {
      findOne: () => findInvitationQuery(invitation),
      findOneAndUpdate: async () => null
    }],
    [User, {
      exists: async () => false,
      create: async () => { userCreateCalls += 1; }
    }]
  ], async () => {
    const res = makeResponse();
    await acceptInvitation(request(), res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 400);
    assert.match(res.result.body.message, /invalid, expired, revoked, or has already been used/i);
    assert.equal(userCreateCalls, 0);
  });
});

test("acceptance rejects an email that already has an account", async () => {
  const invitation = makeInvitation();
  let claimCalls = 0;
  await withMocks([
    [AdminInvitation, {
      findOne: () => findInvitationQuery(invitation),
      findOneAndUpdate: async () => { claimCalls += 1; return invitation; }
    }],
    [User, { exists: async () => true }]
  ], async () => {
    const res = makeResponse();
    await acceptInvitation(request(), res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 409);
    assert.equal(claimCalls, 0);
  });
});

test("acceptance creates an administrator with the invited role and audits the activation", async () => {
  const invitation = makeInvitation();
  const claimedInvitation = { ...invitation, acceptedAt };
  let createdUser;
  let auditEntry;
  const hashedPassword = "hashed-password";
  const user = {
    _id: { toString: () => "507f1f77bcf86cd799439012" },
    name: invitation.name,
    email,
    adminRole: invitation.adminRole,
    isActive: true
  };
  await withMocks([
    [AdminInvitation, {
      findOne: () => findInvitationQuery(invitation),
      findOneAndUpdate: async (_filter, update) => {
        assert.equal(update.$set.acceptedAt instanceof Date, true);
        return claimedInvitation;
      },
      updateOne: async () => assert.fail("successful creation must not release the claim")
    }],
    [User, {
      exists: async () => false,
      hashPassword: async (password) => {
        assert.equal(password, "a-strong-password-123");
        return hashedPassword;
      },
      create: async (input) => { createdUser = input; return user; }
    }],
    [AuditLog, { create: async (entry) => { auditEntry = entry; } }]
  ], async () => {
    const res = makeResponse();
    await acceptInvitation(request(), res, (error) => assert.fail(error));
    assert.equal(res.result.statusCode, 201);
    assert.equal(res.result.body.success, true);
    assert.equal(res.result.body.administrator.adminRole, "support_manager");
    assert.equal(createdUser.role, "admin");
    assert.equal(createdUser.adminRole, "support_manager");
    assert.deepEqual(createdUser.adminPermissionOverrides, []);
    assert.equal(createdUser.password, hashedPassword);
    assert.equal(createdUser.emailVerified, true);
    assert.equal(auditEntry.action, "admin.invitation.accepted");
    assert.equal(auditEntry.targetType, "user");
  });
});

test("acceptance releases its claim when account creation fails so the invite can be retried", async () => {
  const invitation = makeInvitation();
  let claimedAt;
  let releaseFilter;
  let releaseUpdate;
  await withMocks([
    [AdminInvitation, {
      findOne: () => findInvitationQuery(invitation),
      findOneAndUpdate: async (_filter, update) => {
        claimedAt = update.$set.acceptedAt;
        return { ...invitation, acceptedAt: claimedAt };
      },
      updateOne: async (filter, update) => { releaseFilter = filter; releaseUpdate = update; }
    }],
    [User, {
      exists: async () => false,
      hashPassword: async () => "hashed-password",
      create: async () => { throw new Error("database write failed"); }
    }]
  ], async () => {
    const res = makeResponse();
    let forwardedError;
    await acceptInvitation(request(), res, (error) => { forwardedError = error; });
    assert.equal(forwardedError?.message, "database write failed");
    assert.equal(releaseFilter._id, invitation._id);
    assert.equal(releaseFilter.acceptedAt, claimedAt);
    assert.equal(claimedAt instanceof Date, true);
    assert.equal(releaseUpdate.$set.acceptedAt, null);
  });
});

test("acceptance normalizes email and hashes the supplied token before querying", async () => {
  let query;
  const invitation = makeInvitation();
  await withMocks([
    [AdminInvitation, { findOne: (filter) => { query = filter; return findInvitationQuery(invitation); } }],
    [User, { exists: async () => true }]
  ], async () => {
    const res = makeResponse();
    await acceptInvitation(request({ email: "INVITEE@EXAMPLE.COM" }), res, () => assert.fail("next must not run"));
    assert.equal(query.email, email);
    assert.equal(query.tokenHash, crypto.createHash("sha256").update(token).digest("hex"));
    assert.equal(res.result.statusCode, 409);
  });
});


test("only a Super Admin can create an invitation for another Super Admin", async () => {
  let userLookupCalls = 0;
  await withMocks([
    [User, { findOne: () => { userLookupCalls += 1; throw new Error("must not query existing users"); } }]
  ], async () => {
    const res = makeResponse();
    await createInvitation({
      body: { name: "New Super Admin", email: "new-super@example.com", adminRole: "super_admin" },
      user: { userId: "actor-id", adminRole: "platform_admin" }
    }, res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 403);
    assert.match(res.result.body.message, /Only a Super Admin/i);
    assert.equal(userLookupCalls, 0);
  });
});

test("revocation rejects malformed invitation IDs without querying the database", async () => {
  let lookupCalls = 0;
  await withMocks([
    [AdminInvitation, { findOne: () => { lookupCalls += 1; } }]
  ], async () => {
    const res = makeResponse();
    await revokeInvitation({ params: { invitationId: "not-an-object-id" }, user: { userId: "actor-id" } }, res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 400);
    assert.equal(lookupCalls, 0);
  });
});

test("revocation returns not found for an invitation that is no longer pending", async () => {
  await withMocks([
    [AdminInvitation, { findOneAndUpdate: async () => null }]
  ], async () => {
    const res = makeResponse();
    await revokeInvitation({ params: { invitationId }, body: { reason: "Invitation no longer needed" }, user: { userId: "actor-id" } }, res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 404);
    assert.match(res.result.body.message, /Pending invitation not found/i);
  });
});

test("revocation saves the revoked timestamp and records an audit event", async () => {
  const invitation = makeInvitation({
    _id: { toString: () => invitationId },
    revokedAt: new Date("2026-10-18T10:00:00.000Z")
  });
  let lookupFilter;
  let update;
  let auditEntry;
  await withMocks([
    [AdminInvitation, {
      findOneAndUpdate: async (filter, change) => { lookupFilter = filter; update = change; return invitation; }
    }],
    [AuditLog, { create: async (entry) => { auditEntry = entry; } }]
  ], async () => {
    const res = makeResponse();
    await revokeInvitation({
      params: { invitationId },
      body: { reason: "Access no longer required" },
      user: { userId: "actor-id" },
      ip: "127.0.0.1",
      get: () => "admin-invitation-test"
    }, res, (error) => assert.fail(error));
    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.success, true);
    assert.equal(invitation.revokedAt instanceof Date, true);
    assert.equal(lookupFilter._id, invitationId);
    assert.equal(lookupFilter.acceptedAt, null);
    assert.equal(lookupFilter.revokedAt, null);
    assert.equal(lookupFilter.expiresAt.$gt instanceof Date, true);
    assert.equal(update.$set.revokedAt instanceof Date, true);
    assert.equal(auditEntry.action, "admin.invitation.revoked");
    assert.equal(auditEntry.reason, "Access no longer required");
    assert.equal(auditEntry.targetId, invitationId);
  });
});


test("invitation creation rejects an email that already belongs to an account", async () => {
  let invitationWrites = 0;
  await withMocks([
    [User, { findOne: () => ({ select: async () => ({ _id: "existing-user-id", role: "user" }) }) }],
    [AdminInvitation, {
      updateMany: async () => { invitationWrites += 1; },
      create: async () => { invitationWrites += 1; }
    }]
  ], async () => {
    const res = makeResponse();
    await createInvitation({
      body: { name: "Existing User", email: "EXISTING@example.com", adminRole: "support_manager" },
      user: { userId: "actor-id", adminRole: "super_admin" }
    }, res, () => assert.fail("next must not run"));
    assert.equal(res.result.statusCode, 409);
    assert.match(res.result.body.message, /already belongs to an account/i);
    assert.equal(invitationWrites, 0);
  });
});

test("invitation creation removes the pending invitation when email delivery is not configured", async () => {
  const originalSmtpHost = (await import("../src/config/env.js")).env.smtpHost;
  const originalSmtpUser = (await import("../src/config/env.js")).env.smtpUser;
  const originalSmtpPass = (await import("../src/config/env.js")).env.smtpPass;
  let deleted = false;
  let auditCalls = 0;
  let priorInvitationRevocations = 0;
  const invitation = {
    _id: { toString: () => invitationId },
    email: "new-admin@example.com",
    name: "New Admin",
    adminRole: "support_manager",
    expiresAt: new Date("2026-10-19T10:00:00.000Z"),
    deleteOne: async () => { deleted = true; }
  };
  const { env } = await import("../src/config/env.js");
  env.smtpHost = "";
  env.smtpUser = "";
  env.smtpPass = "";
  try {
    await withMocks([
      [User, { findOne: () => ({ select: async () => null }) }],
      [AdminInvitation, {
        updateMany: async () => { priorInvitationRevocations += 1; return {}; },
        create: async () => invitation
      }],
      [AuditLog, { create: async () => { auditCalls += 1; } }]
    ], async () => {
      const res = makeResponse();
      let forwardedError;
      await createInvitation({
        body: { name: "New Admin", email: "NEW-ADMIN@example.com", adminRole: "support_manager" },
        user: { userId: "actor-id", adminRole: "super_admin" }
      }, res, (error) => { forwardedError = error; });
      assert.equal(forwardedError?.status, 503);
      assert.match(forwardedError?.message || "", /not configured/i);
      assert.equal(deleted, true);
      assert.equal(auditCalls, 0);
      assert.equal(priorInvitationRevocations, 0, "failed replacement delivery must not revoke an existing working invitation");
    });
  } finally {
    env.smtpHost = originalSmtpHost;
    env.smtpUser = originalSmtpUser;
    env.smtpPass = originalSmtpPass;
  }
});


test("acceptance queues an audit event when audit logging fails after account creation", async () => {
  const invitation = makeInvitation();
  const claimedInvitation = { ...invitation, acceptedAt };
  const user = {
    _id: { toString: () => "507f1f77bcf86cd799439012" },
    name: invitation.name,
    email,
    adminRole: invitation.adminRole,
    isActive: true
  };
  await withMocks([
    [AdminInvitation, {
      findOne: () => findInvitationQuery(invitation),
      findOneAndUpdate: async () => claimedInvitation
    }],
    [User, {
      exists: async () => false,
      hashPassword: async () => "hashed-password",
      create: async () => user
    }],
    [AuditLog, { create: async () => { throw new Error("audit database unavailable"); } }],
    [AuditOutbox, { create: async (entry) => {
      assert.equal(entry.status, "pending");
      assert.equal(entry.event.action, "admin.invitation.accepted");
    } }]
  ], async () => {
    const res = makeResponse();
    let forwardedError;
    await acceptInvitation(request(), res, (error) => { forwardedError = error; });
    assert.equal(forwardedError, undefined);
    assert.equal(res.result.statusCode, 201);
    assert.equal(res.result.body.success, true);
    assert.equal(res.result.body.auditLogRecorded, false);
    assert.equal(res.result.body.auditQueued, true);
    assert.match(res.result.body.message, /queued for retry/i);
  });
});


test("invitation creation succeeds and queues its audit event when the primary audit write fails", async () => {
  const { env } = await import("../src/config/env.js");
  const nodemailer = (await import("nodemailer")).default;
  const original = { smtpHost: env.smtpHost, smtpUser: env.smtpUser, smtpPass: env.smtpPass, clientUrl: env.clientUrl, createTransport: nodemailer.createTransport };
  let invitationCreated = false;
  let sentMail;
  let queued;
  const invitation = {
    _id: { toString: () => invitationId },
    email: "new-admin@example.com",
    name: "New Admin",
    adminRole: "support_manager",
    expiresAt: new Date("2026-10-19T10:00:00.000Z"),
    deleteOne: async () => assert.fail("successful email delivery must not delete the invitation")
  };
  env.smtpHost = "smtp.example.com";
  env.smtpUser = "mailer@example.com";
  env.smtpPass = "test-password";
  env.clientUrl = "https://buddyforstudy.example";
  nodemailer.createTransport = () => ({ sendMail: async (mail) => { sentMail = mail; } });
  try {
    await withMocks([
      [User, { findOne: () => ({ select: async () => null }) }],
      [AdminInvitation, {
        updateMany: async () => ({}),
        create: async (input) => {
          invitationCreated = true;
          assert.equal(input.email, "new-admin@example.com");
          assert.equal(typeof input.tokenHash, "string");
          assert.equal(input.tokenHash.length, 64);
          return invitation;
        }
      }],
      [AuditLog, { create: async () => { throw new Error("audit database unavailable"); } }],
      [AuditOutbox, { create: async (entry) => { queued = entry; } }]
    ], async () => {
      const res = makeResponse();
      await createInvitation({
        body: { name: "New Admin", email: "NEW-ADMIN@example.com", adminRole: "support_manager", reason: "Staff onboarding" },
        user: { userId: "actor-id", adminRole: "super_admin" },
        ip: "127.0.0.1",
        get: () => "admin-invitation-test"
      }, res, (error) => assert.fail(error));
      assert.equal(invitationCreated, true);
      assert.equal(sentMail.to, "new-admin@example.com");
      assert.match(sentMail.html, /accept-admin-invitation/);
      assert.equal(queued.status, "pending");
      assert.equal(queued.event.action, "admin.invitation.created");
      assert.equal(res.result.statusCode, 201);
      assert.equal(res.result.body.auditLogRecorded, false);
      assert.equal(res.result.body.auditQueued, true);
      assert.match(res.result.body.message, /queued for retry/i);
    });
  } finally {
    env.smtpHost = original.smtpHost;
    env.smtpUser = original.smtpUser;
    env.smtpPass = original.smtpPass;
    env.clientUrl = original.clientUrl;
    nodemailer.createTransport = original.createTransport;
  }
});

test("revocation remains successful and queues its audit event when the primary audit write fails", async () => {
  const invitation = makeInvitation({ revokedAt: new Date("2026-10-18T10:00:00.000Z") });
  let queued;
  await withMocks([
    [AdminInvitation, { findOneAndUpdate: async () => invitation }],
    [AuditLog, { create: async () => { throw new Error("audit database unavailable"); } }],
    [AuditOutbox, { create: async (entry) => { queued = entry; } }]
  ], async () => {
    const res = makeResponse();
    await revokeInvitation({
      params: { invitationId },
      body: { reason: "Access no longer required" },
      user: { userId: "actor-id" },
      ip: "127.0.0.1",
      get: () => "admin-invitation-test"
    }, res, (error) => assert.fail(error));
    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.success, true);
    assert.equal(res.result.body.auditLogRecorded, false);
    assert.equal(res.result.body.auditQueued, true);
    assert.match(res.result.body.message, /queued for retry/i);
    assert.equal(queued.status, "pending");
    assert.equal(queued.event.action, "admin.invitation.revoked");
    assert.equal(queued.event.targetId, invitationId);
  });
});

test("revocation reports audit persistence loss without undoing the completed revocation", async () => {
  let transitionCalls = 0;
  await withMocks([
    [AdminInvitation, { findOneAndUpdate: async () => { transitionCalls += 1; return makeInvitation({ revokedAt: new Date() }); } }],
    [AuditLog, { create: async () => { throw new Error("audit database unavailable"); } }],
    [AuditOutbox, { create: async () => { throw new Error("outbox database unavailable"); } }]
  ], async () => {
    const res = makeResponse();
    await revokeInvitation({
      params: { invitationId },
      body: { reason: "Revocation required after access review" },
      user: { userId: "actor-id" }
    }, res, (error) => assert.fail(error));
    assert.equal(transitionCalls, 1);
    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.success, true);
    assert.equal(res.result.body.auditLogRecorded, false);
    assert.equal(res.result.body.auditQueued, false);
    assert.match(res.result.body.message, /could not be recorded or queued/i);
  });
});


test("invitation creation stays successful and exposes audit loss if both audit stores fail", async () => {
  const { env } = await import("../src/config/env.js");
  const nodemailer = (await import("nodemailer")).default;
  const original = {
    smtpHost: env.smtpHost,
    smtpUser: env.smtpUser,
    smtpPass: env.smtpPass,
    clientUrl: env.clientUrl,
    createTransport: nodemailer.createTransport,
    consoleError: console.error
  };
  let created = 0;
  let loggedPersistenceFailure = false;
  const invitation = {
    _id: { toString: () => invitationId },
    email: "new-admin@example.com",
    name: "New Admin",
    adminRole: "support_manager",
    expiresAt: new Date("2026-10-19T10:00:00.000Z"),
    deleteOne: async () => assert.fail("email delivery succeeded; invitation must remain")
  };
  env.smtpHost = "smtp.example.com";
  env.smtpUser = "mailer@example.com";
  env.smtpPass = "test-password";
  env.clientUrl = "https://buddyforstudy.example";
  nodemailer.createTransport = () => ({ sendMail: async () => ({ accepted: ["new-admin@example.com"] }) });
  console.error = (message) => {
    if (String(message).includes("Failed to persist audit event for retry")) loggedPersistenceFailure = true;
  };
  try {
    await withMocks([
      [User, { findOne: () => ({ select: async () => null }) }],
      [AdminInvitation, {
        updateMany: async () => ({}),
        create: async () => { created += 1; return invitation; }
      }],
      [AuditLog, { create: async () => { throw new Error("audit database unavailable"); } }],
      [AuditOutbox, { create: async () => { throw new Error("outbox database unavailable"); } }]
    ], async () => {
      const res = makeResponse();
      await createInvitation({
        body: { name: "New Admin", email: "NEW-ADMIN@example.com", adminRole: "support_manager" },
        user: { userId: "actor-id", adminRole: "super_admin" }
      }, res, (error) => assert.fail(error));
      assert.equal(created, 1);
      assert.equal(res.result.statusCode, 201);
      assert.equal(res.result.body.success, true);
      assert.equal(res.result.body.auditLogRecorded, false);
      assert.equal(res.result.body.auditQueued, false);
      assert.match(res.result.body.message, /could not be recorded or queued/i);
      assert.equal(loggedPersistenceFailure, true);
    });
  } finally {
    env.smtpHost = original.smtpHost;
    env.smtpUser = original.smtpUser;
    env.smtpPass = original.smtpPass;
    env.clientUrl = original.clientUrl;
    nodemailer.createTransport = original.createTransport;
    console.error = original.consoleError;
  }
});


test("invitation revocation rejects missing or too-short audit reasons before database writes", async () => {
  let writes = 0;
  await withMocks([
    [AdminInvitation, { findOneAndUpdate: async () => { writes += 1; return makeInvitation(); } }]
  ], async () => {
    for (const reason of ["", "  ", "too short"]) {
      const res = makeResponse();
      await revokeInvitation({
        params: { invitationId },
        body: { reason },
        user: { userId: "actor-id" }
      }, res, (error) => assert.fail(error));
      assert.equal(res.result.statusCode, 400);
      assert.match(res.result.body.message, /reason between 10 and 500/i);
      assert.equal(writes, 0);
    }
  });
});
