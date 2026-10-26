import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";

test("password hashing rejects inputs that bcrypt would truncate beyond 72 UTF-8 bytes", async () => {
  assert.throws(() => User.hashPassword("a".repeat(73)), /72 UTF-8 bytes or fewer/);
  assert.throws(() => User.hashPassword("😀".repeat(19)), /72 UTF-8 bytes or fewer/);
});

test("password hashing uses bcrypt and password comparison verifies only the original password", async () => {
  const password = "correct-horse-42";
  const passwordHash = await User.hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.ok(["2a", "2b", "2y"].includes(passwordHash.split("$")[1]));
  assert.equal(passwordHash.split("$")[2], "12");

  const user = new User({
    name: "Learner Example",
    email: "learner@example.test",
    password: passwordHash
  });

  assert.equal(await user.comparePassword(password), true);
  assert.equal(await user.comparePassword("incorrect-password"), false);
  assert.equal(user.toJSON().password, undefined);
});
