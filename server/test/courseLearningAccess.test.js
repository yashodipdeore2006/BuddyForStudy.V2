import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkCourseLearningAccess } from "../src/utils/courseLearningAccess.js";

const COURSE_ID = "507f1f77bcf86cd799439011";

test("course learning access is bound to the authenticated user, not another learner's enrollment", async () => {
  const persistedEnrollment = { user: "learner-a", course: COURSE_ID, status: "active", revokedBy: null };
  let requestedFilter;
  let entitlementChecks = 0;
  const result = await checkCourseLearningAccess({
    user: { userId: "learner-b", role: "user" },
    courseId: COURSE_ID,
    findEnrollment: async (filter) => {
      requestedFilter = filter;
      return String(filter.user) === String(persistedEnrollment.user) ? persistedEnrollment : null;
    },
    canAccessCourse: async () => { entitlementChecks += 1; return true; }
  });

  assert.deepEqual(requestedFilter, {
    user: "learner-b",
    course: COURSE_ID,
    status: { $in: ["active", "completed"] },
    revokedBy: null
  });
  assert.deepEqual(result, { allowed: false, status: 403, message: "Active or completed enrollment required" });
  assert.equal(entitlementChecks, 0);
});

test("course learning access rejects missing authentication and never queries enrollment", async () => {
  let lookups = 0;
  const result = await checkCourseLearningAccess({
    user: null,
    courseId: COURSE_ID,
    findEnrollment: async () => { lookups += 1; return null; },
    canAccessCourse: async () => true
  });
  assert.deepEqual(result, { allowed: false, status: 401, message: "Authentication required" });
  assert.equal(lookups, 0);
});

test("only active or completed non-revoked enrollment can proceed to entitlement evaluation", async () => {
  let requestedFilter;
  const result = await checkCourseLearningAccess({
    user: { userId: "learner-a", role: "user" },
    courseId: COURSE_ID,
    findEnrollment: async (filter) => { requestedFilter = filter; return { _id: "enrollment-1" }; },
    canAccessCourse: async (userId, courseId) => userId === "learner-a" && courseId === COURSE_ID
  });
  assert.deepEqual(requestedFilter.status, { $in: ["active", "completed"] });
  assert.equal(requestedFilter.revokedBy, null);
  assert.deepEqual(result, { allowed: true });
});

test("enrollment without current plan or purchase entitlement is denied", async () => {
  const result = await checkCourseLearningAccess({
    user: { userId: "learner-a", role: "user" },
    courseId: COURSE_ID,
    findEnrollment: async () => ({ _id: "enrollment-1" }),
    canAccessCourse: async () => false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.message, /current plan does not include access/i);
});

test("an authenticated admin bypasses learner enrollment lookup", async () => {
  let lookups = 0;
  const result = await checkCourseLearningAccess({
    user: { userId: "admin-1", role: "admin", accessType: "admin" },
    courseId: COURSE_ID,
    findEnrollment: async () => { lookups += 1; return null; },
    canAccessCourse: async () => false
  });
  assert.deepEqual(result, { allowed: true });
  assert.equal(lookups, 0);
});

test("quiz handlers check enrollment/entitlement before reading or persisting quiz attempts and bind questions to the requested course/lesson", async () => {
  const controller = await readFile(new URL("../src/controllers/ai.controller.js", import.meta.url), "utf8");
  const courseStart = controller.indexOf("export async function submitCourseQuiz");
  const practiceStart = controller.indexOf("export async function submitPracticeQuiz");
  assert.ok(courseStart >= 0 && practiceStart >= 0);
  const courseHandler = controller.slice(courseStart);
  const practiceHandler = controller.slice(practiceStart, courseStart);

  assert.ok(courseHandler.indexOf("ensureCourseLearningAccess(req, input.courseId)") < courseHandler.indexOf("Course.findOne"));
  assert.ok(courseHandler.includes("String(item._id || item.id) === input.lessonId"));
  assert.ok(courseHandler.includes('lesson.type !== "quiz" || !lesson.quiz'));
  assert.ok(courseHandler.indexOf("ensureCourseLearningAccess(req, input.courseId)") < courseHandler.indexOf("CourseQuizAttempt.create"));
  assert.ok(practiceHandler.indexOf("ensureCourseLearningAccess(req, input.courseId)") < practiceHandler.indexOf("QuizBank.find"));
  assert.ok(practiceHandler.includes("course: input.courseId"));
  assert.ok(practiceHandler.includes("lesson: input.lessonId"));
});
