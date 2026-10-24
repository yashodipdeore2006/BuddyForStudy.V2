import test from "node:test";
import assert from "node:assert/strict";
import { validateNewLessonInput } from "../src/utils/courseLessonValidation.js";

test("new lesson validation trims a valid lesson and preserves the supported type", () => {
  assert.deepEqual(validateNewLessonInput({ title: "  Intro  ", type: "tutorial", description: "  Basics  " }), {
    valid: true,
    value: { title: "Intro", type: "tutorial", description: "Basics" }
  });
});

test("new lesson validation defaults an omitted type to tutorial for compatibility", () => {
  assert.deepEqual(validateNewLessonInput({ title: "Intro" }), {
    valid: true,
    value: { title: "Intro", type: "tutorial", description: "" }
  });
});

test("new lesson validation rejects unsupported types and malformed text", () => {
  assert.equal(validateNewLessonInput({ title: "Intro", type: "video" }).valid, false);
  assert.equal(validateNewLessonInput({ title: "Intro", description: 42 }).valid, false);
  assert.equal(validateNewLessonInput({ title: " " }).valid, false);
});

test("new lesson validation enforces the persisted title limit", () => {
  assert.equal(validateNewLessonInput({ title: "x".repeat(201) }).valid, false);
});
