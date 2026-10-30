import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import {
  parseAdminAudienceDate,
  resolveAdminAudience,
  validateAdminAudienceInput,
  createAdminAudiencePreviewToken,
  verifyAdminAudiencePreviewToken
} from "../src/services/adminAudience.service.js";

async function withMock(target, key, value, run) {
  const original = target[key];
  target[key] = value;
  try { await run(); } finally { target[key] = original; }
}

test("audience targeting modes are mutually exclusive and bounded", () => {
  assert.equal(validateAdminAudienceInput({ userIds: ["507f1f77bcf86cd799439011"] }), true);
  assert.equal(validateAdminAudienceInput({ emails: ["Learner@example.test"] }), true);
  assert.equal(validateAdminAudienceInput({ filters: { status: "active" } }), true);
  assert.throws(() => validateAdminAudienceInput({ userIds: ["507f1f77bcf86cd799439011"], emails: ["learner@example.test"] }), /multiple targeting modes/i);
  assert.throws(() => validateAdminAudienceInput({ emails: [] }), /at least one email/i);
  assert.throws(() => validateAdminAudienceInput({ filters: {} }), /at least one valid audience filter/i);
  assert.throws(() => validateAdminAudienceInput({ filters: { progressMin: 90, progressMax: 20 } }), /cannot exceed/i);
});

test("audience date filters validate calendar dates and include the full before-day", () => {
  assert.throws(() => parseAdminAudienceDate("2026-02-30", "registeredAfter"), /invalid registeredAfter date/i);
  assert.equal(parseAdminAudienceDate("2026-10-30", "registeredBefore").toISOString(), "2026-10-30T23:59:59.999Z");
  assert.equal(parseAdminAudienceDate("2026-10-30", "registeredAfter").toISOString(), "2026-10-30T00:00:00.000Z");
});

test("selected email audience is normalized, deduplicated and queried without broadening", async () => {
  let capturedQuery;
  const users = [{ _id: "user-1", email: "learner@example.test" }];
  await withMock(User, "find", (query) => {
    capturedQuery = query;
    return {
      select() { return this; },
      limit() { return this; },
      lean: async () => users
    };
  }, async () => {
    const result = await resolveAdminAudience({
      emails: [" Learner@example.test ", "learner@example.test"]
    }, { select: "_id email", limit: 50 });
    assert.deepEqual(result, users);
  });
  assert.deepEqual(capturedQuery, { email: { $in: ["learner@example.test"] } });
});

test("preview token binds audience filters, delivery channels and the exact recipient set", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-audience-preview-secret";
  try {
    const input = { audience: "all", filters: { status: "active" }, channels: ["email", "in_app"] };
    const users = [{ _id: "user-1" }, { _id: "user-2" }];
    const token = createAdminAudiencePreviewToken(input, users);
    assert.equal(verifyAdminAudiencePreviewToken(token, input, users), true);
    assert.equal(verifyAdminAudiencePreviewToken(token, { ...input, channels: ["email"] }, users), false);
    assert.equal(verifyAdminAudiencePreviewToken(token, input, [{ _id: "user-1" }]), false);
    assert.equal(verifyAdminAudiencePreviewToken(token + "tampered", input, users), false);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
