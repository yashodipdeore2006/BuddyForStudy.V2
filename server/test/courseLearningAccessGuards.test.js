import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/controllers/course.controller.js", import.meta.url), "utf8");
const entitlementService = readFileSync(new URL("../src/services/subscriptionEntitlement.service.js", import.meta.url), "utf8");

test("lesson player verifies current course entitlement before recording learning activity", () => {
  const start = controller.indexOf("export async function learn");
  const end = controller.indexOf("export async function learningItem", start);
  assert.ok(start >= 0 && end > start, "Expected lesson-player handler");
  const handler = controller.slice(start, end);

  const accessCheck = handler.indexOf("canAccessCourse(req.user.userId, req.params.courseId)");
  const progressWrite = handler.indexOf("Progress.findOneAndUpdate");
  const enrollmentWrite = handler.indexOf("Enrollment.updateOne");
  assert.ok(accessCheck >= 0, "Lesson player must re-check current access, not only enrollment existence");
  assert.ok(progressWrite > accessCheck, "Must authorize before updating learning progress");
  assert.ok(enrollmentWrite > accessCheck, "Must authorize before updating enrollment learning status");
  assert.match(handler, /Course access is no longer available/);
});

test("learning-item endpoint blocks revoked enrollments and re-checks course entitlement", () => {
  const start = controller.indexOf("export async function learningItem");
  assert.ok(start >= 0, "Expected individual learning-item handler");
  const handler = controller.slice(start);

  assert.match(handler, /status: \{ \$in: \["active", "completed"\] \}, revokedBy: null/);
  const accessCheck = handler.indexOf("canAccessCourse(req.user.userId, courseId)");
  const locateItem = handler.indexOf("courseService.findLearningItem(course, itemId)");
  assert.ok(accessCheck >= 0, "Individual lesson lookup must verify current access");
  assert.ok(locateItem > accessCheck, "Must authorize before returning any lesson content");
  assert.match(handler, /Course access is no longer available/);
});

test("paid-course access accepts only verified, non-refunded individual payment states", () => {
  const start = entitlementService.indexOf("export async function canAccessCourse");
  const end = entitlementService.indexOf("export function readPlanLimit", start);
  assert.ok(start >= 0 && end > start, "Expected course access authorization helper");
  const helper = entitlementService.slice(start, end);

  assert.match(helper, /status: \{ \$in: \["paid", "partially_refunded"\] \}/);
  assert.match(helper, /revokedBy: null/);
  assert.match(helper, /isEnrollmentCourseAccessAllowed\(/);
});


test("progress read and completion APIs enforce current course access and reject revoked enrollments", () => {
  const progressService = readFileSync(new URL("../src/services/progress.service.js", import.meta.url), "utf8");
  const start = progressService.indexOf("async function getAuthorizedCourse");
  const end = progressService.indexOf("export async function getProgress", start);
  assert.ok(start >= 0 && end > start, "Expected shared progress authorization helper");
  const guard = progressService.slice(start, end);

  assert.match(guard, /revokedBy: null/);
  assert.match(guard, /canAccessCourse\(userId, courseId\)/);
  assert.match(guard, /Course access is no longer available/);
  assert.ok(
    guard.indexOf("canAccessCourse(userId, courseId)") > guard.indexOf("if (!enrollment)"),
    "Current entitlement must be checked after enrollment existence and before progress is returned or mutated"
  );
});
