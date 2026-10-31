import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const aiController = readFileSync(new URL("../src/controllers/ai.controller.js", import.meta.url), "utf8");
const aiRoadmapService = readFileSync(new URL("../src/services/aiRoadmap.service.js", import.meta.url), "utf8");
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

test("course quiz submission validates answer payload shape and completeness before writing attempts", () => {
  const start = aiController.indexOf("export async function submitCourseQuiz");
  assert.ok(start >= 0, "Course quiz submission handler must exist");
  const handler = aiController.slice(start);
  assert.ok(handler.includes("answers: z.record(z.string(), z.string()).default({})"));
  assert.ok(handler.includes("Object.keys(input.answers).length > 200"));
  const validation = handler.indexOf("normalizeQuizAnswers(questions, input.answers)");
  const invalidAnswerResponse = handler.indexOf("Answer every question using one of its available options before submitting.");
  const persistence = handler.indexOf("CourseQuizAttempt.create");
  assert.ok(validation >= 0 && invalidAnswerResponse > validation && persistence > invalidAnswerResponse,
    "Malformed or incomplete answers must be rejected before a quiz attempt is persisted");
  assert.ok(handler.includes('if (e instanceof z.ZodError) return failure(res, "Validation failed", 400'));
});

test("pending or rejected AI question sets are never delivered or graded as approved", () => {
  const generateStart = aiController.indexOf("export async function generatePracticeQuiz");
  const submitStart = aiController.indexOf("export async function submitPracticeQuiz", generateStart);
  const courseSubmitStart = aiController.indexOf("export async function submitCourseQuiz", submitStart);
  assert.ok(generateStart >= 0 && submitStart > generateStart && courseSubmitStart > submitStart);
  const generateHandler = aiController.slice(generateStart, submitStart);
  const submitHandler = aiController.slice(submitStart, courseSubmitStart);
  assert.ok(generateHandler.includes('const bank = allBank.filter((item) => item.moderationStatus === "approved")'));
  assert.ok(generateHandler.includes('if (allBank.some((item) => item.moderationStatus !== "approved"))'));
  assert.ok(submitHandler.includes('moderationStatus: "approved"'));
  assert.ok(submitHandler.includes('if (bankQuizzes.length !== ids.length) return failure'));
  assert.ok(aiRoadmapService.includes('aiReviewStatus: { $nin: ["pending", "rejected"] }'));
});

test("saved course quizzes remain available without Gemini and enrolled learners retain non-public course access", () => {
  const start = aiRoadmapService.indexOf("export async function generateCourseQuiz");
  const end = aiRoadmapService.indexOf("function courseHasTutorialVideos", start);
  assert.ok(start >= 0 && end > start, "Expected course quiz generation service");
  const handler = aiRoadmapService.slice(start, end);
  const savedQuizReturn = handler.indexOf("if (!practiceOnly && existingQuestions.length >= requestedCount)");
  const providerGuard = handler.indexOf('if (!client)');
  assert.ok(savedQuizReturn >= 0 && providerGuard > savedQuizReturn,
    "Saved course quiz must be returned before requiring the AI provider");
  assert.match(handler, /visibility: \{ \$ne: "private" \}/);
  assert.match(handler, /aiReviewStatus: \{ \$nin: \["pending", "rejected"\] \}/);
  assert.match(handler, /revokedBy: null/);
});


test("AI quiz endpoints reject unknown fields and validate MongoDB identifiers before lookup", () => {
  const generateStart = aiController.indexOf("export async function generateQuiz");
  const practiceStart = aiController.indexOf("export async function generatePracticeQuiz");
  const submitPracticeStart = aiController.indexOf("export async function submitPracticeQuiz");
  const submitCourseStart = aiController.indexOf("export async function submitCourseQuiz");
  const generate = aiController.slice(generateStart, practiceStart);
  const practice = aiController.slice(practiceStart, submitPracticeStart);
  const submitPractice = aiController.slice(submitPracticeStart, submitCourseStart);
  const submitCourse = aiController.slice(submitCourseStart, aiController.indexOf("export async function generateAndSaveCourse", submitCourseStart));

  for (const handler of [generate, practice]) {
    assert.match(handler, /\.strict\(\)/);
    assert.match(handler, /isValidObjectId\(input\.courseId\).*isValidObjectId\(input\.lessonId\)/s);
    assert.ok(handler.indexOf("isValidObjectId") < handler.indexOf("ensureCourseLearningAccess"));
  }
  for (const handler of [submitPractice, submitCourse]) {
    assert.match(handler, /\.strict\(\)/);
    assert.match(handler, /z\.string\(\)\.max\(100\)/);
    assert.match(handler, /Object\.keys\(input\.answers\)\.length > 200/);
  }
  assert.match(submitPractice, /quizBankIds: z\.array\(z\.string\(\)\.trim\(\)\.length\(24\)\)\.max\(20\)/);
});
