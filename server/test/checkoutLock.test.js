import test from "node:test";
import assert from "node:assert/strict";
import { PlatformSetting } from "../src/models/PlatformSetting.js";
import { acquireCheckoutLock, checkoutLockKey, releaseCheckoutLock } from "../src/services/checkoutLock.service.js";

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try { await run(); }
  finally { for (const {target,key,original} of originals.reverse()) target[key]=original; }
}

test("checkout locks isolate subscription and per-course checkout scopes", () => {
  assert.equal(checkoutLockKey("subscription", "user-1"), "internal_checkout_lock:subscription:user-1");
  assert.equal(checkoutLockKey("course", "user-1", "course-1"), "internal_checkout_lock:course:user-1:course-1");
  assert.notEqual(checkoutLockKey("course", "user-1", "course-1"), checkoutLockKey("course", "user-1", "course-2"));
  assert.throws(() => checkoutLockKey("", ""), /requires a kind and user ID/);
});

test("checkout lock returns the claimed token and only releases the matching owner", async () => {
  const calls = { updateFilter: null, updateValue: null, releaseFilter: null };
  await withMocks([
    [PlatformSetting, {
      findOneAndUpdate: async (filter, update) => {
        calls.updateFilter = filter;
        calls.updateValue = update.$set.value;
        return { value: update.$set.value };
      },
      updateOne: async (filter, update) => {
        calls.releaseFilter = filter;
        assert.deepEqual(update, { $set: { value: null } });
        return { modifiedCount: 1 };
      }
    }]
  ], async () => {
    const key = checkoutLockKey("subscription", "507f1f77bcf86cd799439012");
    const token = await acquireCheckoutLock(key);
    assert.equal(typeof token, "string");
    assert.equal(calls.updateFilter.key, key);
    assert.ok(calls.updateValue.expiresAt instanceof Date);
    assert.equal(calls.updateFilter.$or.length, 3);
    await releaseCheckoutLock(key, token);
    assert.equal(calls.releaseFilter.key, key);
    assert.equal(calls.releaseFilter["value.token"], token);
  });
});

test("checkout lock translates concurrent duplicate-key upsert to lock contention", async () => {
  await withMocks([
    [PlatformSetting, {
      findOneAndUpdate: async () => { const error = new Error("duplicate key"); error.code=11000; throw error; }
    }]
  ], async () => {
    assert.equal(await acquireCheckoutLock(checkoutLockKey("course", "user-1", "course-1")), null);
  });
});
