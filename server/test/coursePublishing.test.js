import test from "node:test";
import assert from "node:assert/strict";
import { getCoursePublishBlock } from "../src/utils/coursePublishing.js";

const readyCourse = {
  title: "MERN Stack", description: "Learn full-stack development", category: "Development",
  duration: "8 weeks", learningOutcomes: ["Build an application"], pricing: { mode: "free" },
  modules: [{ title: "Basics", lessons: [{ title: "Intro", type: "tutorial", tutorial: { content: "Welcome" } }] }]
};

test("publish guard blocks an incomplete draft and returns failed checks", () => {
  const block = getCoursePublishBlock({ ...readyCourse, description: "", modules: [] }, false);
  assert.ok(block);
  assert.equal(block.ready, false);
  assert.ok(block.failedChecks.some((check) => check.key === "description"));
  assert.ok(block.failedChecks.some((check) => check.key === "modules"));
});

test("publish guard allows a complete draft", () => {
  assert.equal(getCoursePublishBlock(readyCourse, false), null);
});

test("publish guard does not block an already-published course during unrelated updates", () => {
  assert.equal(getCoursePublishBlock({ title: "", modules: [] }, true), null);
});

test("publish guard treats an explicitly unpublished course as a draft", () => {
  const block = getCoursePublishBlock({ ...readyCourse, pricing: { mode: "paid", price: 0 } }, false);
  assert.ok(block);
  assert.ok(block.failedChecks.some((check) => check.key === "paidPrice"));
});
