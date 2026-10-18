import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { exportUsers } from "../src/controllers/adminPro.controller.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withUserFind(find, run) {
  const original = User.find;
  User.find = find;
  try { await run(); } finally { User.find = original; }
}

test("selected-user export requires explicit selected IDs", async () => {
  let queried = false;
  const res = responseRecorder();
  await withUserFind(() => { queried = true; throw new Error("should not query"); }, async () => {
    await exportUsers({ query: {}, user: { userId: "507f191e810c19729de860ea" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /select between 1 and 100 users/i);
  assert.equal(queried, false);
});

test("selected-user export rejects malformed IDs before querying", async () => {
  let queried = false;
  const res = responseRecorder();
  await withUserFind(() => { queried = true; throw new Error("should not query"); }, async () => {
    await exportUsers({ query: { ids: "not-an-object-id" }, user: { userId: "507f191e810c19729de860ea" } }, res, (error) => { throw error; });
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /IDs are invalid/i);
  assert.equal(queried, false);
});
