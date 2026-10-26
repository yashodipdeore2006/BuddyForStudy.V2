import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";

test("password hashing rejects inputs that bcrypt would truncate beyond 72 UTF-8 bytes", async () => {
  await assert.rejects(User.hashPassword("a".repeat(73)), /72 UTF-8 bytes or fewer/);
  await assert.rejects(User.hashPassword("😀".repeat(19)), /72 UTF-8 bytes or fewer/);
});
