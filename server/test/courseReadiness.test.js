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

test("paid course needs a positive price and quizzes need valid prompts and answers", () => {
  const result = evaluateCourseReadiness({
    title: "Paid course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["Outcome"], pricing: { mode: "paid", price: 0 },
    modules: [{ title: "Module", lessons: [{ title: "Quiz", type: "quiz", quiz: { questions: [{ question: "What is JS?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] }] } }] }]
  });
  assert.ok(result.failedChecks.some((check) => check.key === "paidPrice"));
  assert.equal(result.failedChecks.some((check) => check.key === "quizContent"), false);
});

test("curriculum readiness catches untitled modules, unsupported lesson types and empty projects", () => {
  const result = evaluateCourseReadiness({
    title: "Course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["Outcome"], pricing: { mode: "free" },
    modules: [{ title: " ", lessons: [
      { title: "Mystery", type: "unknown" },
      { title: "Build project", type: "project", project: {} }
    ] }]
  });
  assert.ok(result.failedChecks.some((check) => check.key === "moduleTitles"));
  assert.ok(result.failedChecks.some((check) => check.key === "lessonTypes"));
  assert.ok(result.failedChecks.some((check) => check.key === "projectContent"));
});

test("quiz with prompt and multiple answer choices passes curriculum validation", () => {
  const result = evaluateCourseReadiness({
    title: "Course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["Outcome"], pricing: { mode: "free" },
    modules: [{ title: "Module", lessons: [{ title: "Quiz", type: "quiz", quiz: { questions: [{ question: "What is 2 + 2?", options: [{ id: "three", text: "3" }, { id: "four", text: "4" }], correctOptionId: "four" }] } }] }]
  });
  assert.equal(result.failedChecks.some((check) => check.key === "quizContent"), false);
});

test("project objectives and learning outcomes require at least one non-empty item", () => {
  const valid = evaluateCourseReadiness({
    title: "Course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["  ", "Ship a project"], pricing: { mode: "free" },
    modules: [{ title: "Module", lessons: [{ title: "Project", type: "project", project: { objectives: ["  ", "Build an API"] } }] }]
  });
  assert.equal(valid.failedChecks.some((check) => check.key === "outcomes"), false);
  assert.equal(valid.failedChecks.some((check) => check.key === "projectContent"), false);
});

test("blank tutorial resource and empty video placeholders do not satisfy readiness", () => {
  const result = evaluateCourseReadiness({
    title: "Course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["Outcome"], pricing: { mode: "free" },
    modules: [{ title: "Module", lessons: [{ title: "Tutorial", type: "tutorial", tutorial: { resources: ["  "], videos: [{}] } }] }]
  });
  assert.ok(result.failedChecks.some((check) => check.key === "tutorialContent"));
});

test("tutorial video title without a playable URL or video ID does not satisfy readiness", () => {
  const result = evaluateCourseReadiness({
    title: "Course", description: "Description", category: "Development", duration: "4 weeks",
    learningOutcomes: ["Outcome"], pricing: { mode: "free" },
    modules: [{ title: "Module", lessons: [{ title: "Tutorial", type: "tutorial", tutorial: { videos: [{ title: "JavaScript tutorial" }] } }] }]
  });
  assert.ok(result.failedChecks.some((check) => check.key === "tutorialContent"));
});
