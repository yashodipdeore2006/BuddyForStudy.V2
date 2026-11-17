import test from "node:test";
import assert from "node:assert/strict";
import { activatePromptVersion } from "../src/controllers/aiPrompt.controller.js";
import { AIPromptVersion } from "../src/models/AIPromptVersion.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";

const actorId = "507f191e810c19729de860ea";
const nextVersionId = "507f1f77bcf86cd799439011";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function settingQuery(value) {
  return { select() { return this; }, lean: async () => value };
}

const version = {
  _id: nextVersionId,
  feature: "build_with_ai",
  version: 4,
  name: "Build with AI v4",
  contentHash: "a".repeat(64),
  prompt: "You are the curriculum architect.",
  notes: "",
  createdBy: actorId,
};

function request(versionId = nextVersionId) {
  return {
    params: { feature: "build_with_ai" },
    body: { versionId, reason: "Promote the validated prompt revision" },
    user: { userId: actorId },
    ip: "127.0.0.1",
    get: () => "admin-prompt-activation-test",
  };
}

test("prompt activation returns 409 and does not audit when the active pointer changed after the read", async () => {
  const oldPointerId = "507f191e810c19729de860ea";
  let writeFilter;
  let auditWriteAttempted = false;
  const res = responseRecorder();

  await withMocks([
    [AIPromptVersion, {
      findOne: (filter) => filter._id === nextVersionId ? version : settingQuery(null),
    }],
    [PlatformSetting, {
      findOne: () => settingQuery({ _id: "setting-row", value: oldPointerId }),
      findOneAndUpdate: (filter) => {
        writeFilter = filter;
        return null;
      },
      deleteOne: async () => ({ deletedCount: 0 }),
    }],
  ], async () => {
    await activatePromptVersion(request(), res, (error) => {
      auditWriteAttempted = true;
      assert.fail(error);
    });
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /changed concurrently/i);
  assert.deepEqual(writeFilter, { _id: "setting-row", key: "ai_prompt_active_version_build_with_ai", value: oldPointerId });
  assert.equal(auditWriteAttempted, false);
});

test("first prompt activation translates a duplicate active-pointer insert race to 409", async () => {
  const duplicateKey = Object.assign(new Error("duplicate key"), { code: 11000 });
  let writeFilter;
  const res = responseRecorder();

  await withMocks([
    [AIPromptVersion, { findOne: (filter) => filter._id === nextVersionId ? version : settingQuery(null) }],
    [PlatformSetting, {
      findOne: () => settingQuery(null),
      findOneAndUpdate: (filter) => {
        writeFilter = filter;
        throw duplicateKey;
      },
    }],
  ], async () => {
    await activatePromptVersion(request(), res, (error) => assert.fail(error));
  });

  assert.deepEqual(writeFilter, { key: "ai_prompt_active_version_build_with_ai" });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /changed concurrently/i);
});

test("restoring the built-in prompt compare-and-deletes the exact pointer snapshot", async () => {
  const oldPointerId = "507f191e810c19729de860ea";
  let deleteFilter;
  const res = responseRecorder();

  await withMocks([
    [AIPromptVersion, { findOne: () => settingQuery(null) }],
    [PlatformSetting, {
      findOne: () => settingQuery({ _id: "setting-row", value: oldPointerId }),
      deleteOne: async (filter) => {
        deleteFilter = filter;
        return { deletedCount: 0 };
      },
    }],
  ], async () => {
    await activatePromptVersion(request(null), res, (error) => assert.fail(error));
  });

  assert.deepEqual(deleteFilter, { _id: "setting-row", key: "ai_prompt_active_version_build_with_ai", value: oldPointerId });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /changed concurrently/i);
});
