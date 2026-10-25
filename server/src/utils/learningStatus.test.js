import test from "node:test";
import assert from "node:assert/strict";
import { deriveLearningStatus, LEARNING_STATUS } from "./learningStatus.js";

test("newly enrolled course with no activity stays not-started", () => {
  assert.equal(deriveLearningStatus({ totalLessons: 8, completedCount: 0 }), LEARNING_STATUS.NOT_STARTED);
});

test("opening the lesson player marks a course in-progress before the first completion", () => {
  assert.equal(deriveLearningStatus({
    totalLessons: 8,
    completedCount: 0,
    lastAccessedAt: new Date("2026-10-25T05:00:00.000Z")
  }), LEARNING_STATUS.IN_PROGRESS);
});

test("completing at least one lesson moves the course to in-progress", () => {
  assert.equal(deriveLearningStatus({ totalLessons: 8, completedCount: 1 }), LEARNING_STATUS.IN_PROGRESS);
});

test("a course becomes completed only when all trackable lessons are complete", () => {
  assert.equal(deriveLearningStatus({ totalLessons: 8, completedCount: 8 }), LEARNING_STATUS.COMPLETED);
  assert.equal(deriveLearningStatus({ totalLessons: 8, completedCount: 7, lastLessonId: "lesson-7" }), LEARNING_STATUS.IN_PROGRESS);
});

test("rounded percentage cannot incorrectly complete a course", () => {
  assert.equal(deriveLearningStatus({ totalLessons: 200, completedCount: 199, lastLessonId: "lesson-199" }), LEARNING_STATUS.IN_PROGRESS);
});

test("legacy completed enrollment is preserved when no progress snapshot exists", () => {
  assert.equal(deriveLearningStatus({ enrollmentStatus: "completed" }), LEARNING_STATUS.COMPLETED);
});

test("a zero-lesson course does not become completed from an empty completion count", () => {
  assert.equal(deriveLearningStatus({ totalLessons: 0, completedCount: 0 }), LEARNING_STATUS.NOT_STARTED);
});
