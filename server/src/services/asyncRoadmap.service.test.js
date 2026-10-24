import test from "node:test";
import assert from "node:assert/strict";
import { stableProfileKey } from "./asyncRoadmap.service.js";

test("async roadmap idempotency key is stable for the same user and profile", () => {
  const profile = { topic: "MERN stack", goal: "learn", level: "Beginner" };
  assert.equal(stableProfileKey("user-1", profile), stableProfileKey("user-1", profile));
});

test("async roadmap idempotency key isolates users and profile changes", () => {
  const profile = { topic: "MERN stack", goal: "learn", level: "Beginner" };
  const original = stableProfileKey("user-1", profile);
  assert.notEqual(original, stableProfileKey("user-2", profile));
  assert.notEqual(original, stableProfileKey("user-1", { ...profile, level: "Advanced" }));
});
