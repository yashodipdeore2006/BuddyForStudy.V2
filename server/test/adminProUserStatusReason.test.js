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


test("adminPro user status updates cannot deactivate the current administrator", async () => {
  const actorId = "507f191e810c19729de860ea";
  let lookupCalled = false;
  let saveCalled = false;
  const res = responseRecorder();

  await withMocks([[User, {
    findById: async () => { lookupCalled = true; return { save: async () => { saveCalled = true; } }; }
  }]], async () => {
    await updateUser({
      params: { userId: actorId },
      body: { isActive: false, reason: "Prevent self deactivation test" },
      user: { userId: actorId }
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /cannot deactivate the current account/i);
  assert.equal(lookupCalled, false, "self-deactivation must be rejected before reading the target account");
  assert.equal(saveCalled, false);
});

test("adminPro user status updates cannot deactivate or modify another administrator", async () => {
  const actorId = "507f191e810c19729de860ea";
  const targetId = "507f1f77bcf86cd799439011";
  let saveCalled = false;
  const target = {
    _id: targetId,
    role: "admin",
    isActive: true,
    async save() { saveCalled = true; return this; }
  };
  const res = responseRecorder();

  await withMocks([[User, { findById: async (id) => id === targetId ? target : null }]], async () => {
    await updateUser({
      params: { userId: targetId },
      body: { isActive: false, reason: "Protect administrator account" },
      user: { userId: actorId }
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /managed through the administrator access console/i);
  assert.equal(target.isActive, true);
  assert.equal(saveCalled, false);
});

test("adminPro user management cannot change a top-level account role", async () => {
  let lookupCalled = false;
  const res = responseRecorder();

  await withMocks([[User, {
    findById: async () => { lookupCalled = true; throw new Error("role mutation must not query the user"); }
  }]], async () => {
    await updateUser({
      params: { userId: "507f1f77bcf86cd799439011" },
      body: { role: "admin", isActive: true, reason: "Attempted role change" },
      user: { userId: "507f191e810c19729de860ea" }
    }, res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /roles cannot be changed through user management/i);
  assert.equal(lookupCalled, false);
});
