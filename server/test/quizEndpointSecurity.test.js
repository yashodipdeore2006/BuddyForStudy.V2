import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const aiController = readFileSync(new URL("../src/controllers/ai.controller.js", import.meta.url), "utf8");
const courseController = readFileSync(new URL("../src/controllers/course.controller.js", import.meta.url), "utf8");
const aiRoutes = readFileSync(new URL("../src/routes/ai.routes.js", import.meta.url), "utf8");
const player = readFileSync(new URL("../../src/pages/CoursePlayer.tsx", import.meta.url), "utf8");
const attemptModel = readFileSync(new URL("../src/models/CourseQuizAttempt.js", import.meta.url), "utf8");

test("AI quiz endpoints return sanitized question projections instead of stored answer keys", () => {
  assert.match(aiController, /quiz: toPublicQuiz\(result\.quiz\)/);
  assert.match(aiController, /questions: questions\.map\(toPublicQuizQuestion\)/);
  assert.match(aiController, /questions: available\.questions\.map\(toPublicQuizQuestion\)/);
  assert.match(aiController, /questions: saved\.questions\.map\(toPublicQuizQuestion\)/);
  assert.doesNotMatch(aiController, /questions: available\.questions,/);
  assert.doesNotMatch(aiController, /questions: saved\.questions,/);
});

test("authenticated course and single-lesson endpoints remove quiz answer keys before returning data", () => {
  assert.match(courseController, /function sanitizeLearningLesson\(lesson\)/);
  assert.match(courseController, /quiz: toPublicQuiz\(value\.quiz\)/);
  assert.match(courseController, /course: sanitizeLearningCourse\(course\)/);
  assert.match(courseController, /item: sanitizeLearningLesson\(located\.item\)/);
});

test("course quiz submission grades from stored course questions and persists a server-computed attempt", () => {
  const start = aiController.indexOf("export async function submitCourseQuiz");
  const end = aiController.indexOf("export async function generateAndSaveCourse", start);
  assert.ok(start >= 0 && end > start, "Course quiz submission handler must exist");
  const handler = aiController.slice(start, end);
  assert.match(handler, /ensureCourseLearningAccess\(req, input\.courseId\)/);
  assert.match(handler, /Course\.findOne\(\{ _id: input\.courseId/);
  assert.match(handler, /gradeQuizSubmission\(questions, validAnswers/);
  assert.match(handler, /CourseQuizAttempt\.create/);
  assert.doesNotMatch(handler, /input\.score/);
  assert.match(aiRoutes, /router\.post\("\/quiz\/submit", authMiddleware, submitCourseQuiz\)/);
  assert.match(attemptModel, /user:.*required: true/);
  assert.match(attemptModel, /answers:.*Mixed/);
  assert.match(attemptModel, /score:.*required: true/);
  assert.doesNotMatch(attemptModel, /correctOptionId/);
});

test("learner UI never grades locally from a client-delivered answer key", () => {
  assert.doesNotMatch(player, /question\.correctOptionId/);
  assert.doesNotMatch(player, /question\.explanation/);
  assert.match(player, /\/api\/ai\/quiz\/submit/);
  assert.match(player, /\/api\/ai\/practice-quiz\/submit/);
  assert.match(player, /setQuizScore\(Number\(graded\.score\)\)/);
  assert.match(player, /setPracticeQuizScore\(Number\(result\.score\)\)/);
  assert.match(player, /setQuizReview\(review\)/);
  assert.match(player, /setPracticeQuizReview\(review\)/);
});
