import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";

test("password hashing rejects inputs that bcrypt would truncate beyond 72 UTF-8 bytes", async () => {
  assert.throws(() => User.hashPassword("a".repeat(73)), /72 UTF-8 bytes or fewer/);
  assert.throws(() => User.hashPassword("😀".repeat(19)), /72 UTF-8 bytes or fewer/);
});
