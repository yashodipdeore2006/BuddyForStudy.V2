import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCourseReadiness } from "../src/utils/courseReadiness.js";

test("course readiness reports missing curriculum and metadata", () => {
  const result = evaluateCourseReadiness({ title: "MERN", pricing: { mode: "free" }, modules: [] });
  assert.equal(result.ready, false);
  assert.ok(result.failedChecks.some((check) => check.key === "description"));
  assert.ok(result.failedChecks.some((check) => check.key === "modules"));
});

test("course readiness passes when required metadata and learning content exist", () => {
  const result = evaluateCourseReadiness({
    title: "MERN Stack", description: "Learn full-stack development", category: "Development",
    duration: "8 weeks", learningOutcomes: ["Build an application"], pricing: { mode: "free" },
    modules: [{ title: "Basics", lessons: [{ title: "Intro", type: "tutorial", tutorial: { content: "Welcome" } }] }]
  });
  assert.equal(result.ready, true);
  assert.equal(result.failedChecks.length, 0);
});

test("paid course needs a positive price and quizzes need questions", () => {
  const result = evaluateCourseReadiness({
    title: "Paid course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["Outcome"], pricing: { mode: "paid", price: 0 },
    modules: [{ title: "Module", lessons: [{ title: "Quiz", type: "quiz", quiz: { questions: [] } }] }]
  });
  assert.ok(result.failedChecks.some((check) => check.key === "paidPrice"));
  assert.ok(result.failedChecks.some((check) => check.key === "quizContent"));
});
