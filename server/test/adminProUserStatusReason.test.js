import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { updateUser } from "../src/controllers/adminPro.controller.js";

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

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("adminPro user status updates require a non-empty audit reason before reading the user", async () => {
  let lookupCalled = false;
  const res = responseRecorder();
  await withMocks([[User, { findById: async () => { lookupCalled = true; return null; } }]], async () => {
    await updateUser({
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { isActive: false, reason: "   " },
      user: { userId: "507f191e810c19729de860ea" },
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /reason is required/i);
  assert.equal(lookupCalled, false);
});

test("adminPro user status updates reject audit reasons longer than 500 characters", async () => {
  let lookupCalled = false;
  const res = responseRecorder();
  await withMocks([[User, { findById: async () => { lookupCalled = true; return null; } }]], async () => {
    await updateUser({
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { isActive: false, reason: "x".repeat(501) },
      user: { userId: "507f191e810c19729de860ea" },
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /500 characters or fewer/i);
  assert.equal(lookupCalled, false);
});
