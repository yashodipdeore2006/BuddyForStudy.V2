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

 
test("completion API returns the complete progress state and supports marking a lesson incomplete", () => {
  const progressController = readFileSync(new URL("../src/controllers/progress.controller.js", import.meta.url), "utf8");
  const progressRoutes = readFileSync(new URL("../src/routes/progress.routes.js", import.meta.url), "utf8");
  const progressService = readFileSync(new URL("../src/services/progress.service.js", import.meta.url), "utf8");
  assert.match(progressController, /completedLessons: \(value\.completedLessons \|\| \[\]\)\.map/);
  assert.match(progressController, /progress: serializeProgress\(progress\)/);
  assert.match(progressRoutes, /router\.delete\("\/:courseId\/items\/:itemId\/complete", requireFeature\("learning_progress"\), controller\.uncomplete\)/);
  const start = progressService.indexOf("export async function uncompleteItem");
  const end = progressService.indexOf("export { getAuthorizedCourse }", start);
  assert.ok(start >= 0 && end > start, "Expected uncompleteItem service");
  const handler = progressService.slice(start, end);
  assert.match(handler, /String\(entry\.lessonId\) !== String\(itemId\)/);
  assert.match(handler, /progress\.percentage =/);
  assert.match(handler, /status: \{ \$in: \["active", "completed"\] \}, revokedBy: null/);
  assert.match(handler, /learningStatus/);
});

test("first quiz submission completes the quiz lesson and sidebar completion circles toggle independently", () => {
  const player = readFileSync(new URL("../../src/pages/CoursePlayer.tsx", import.meta.url), "utf8");
  const submitStart = player.indexOf("const handleQuizSubmit = async () =>");
  const submitEnd = player.indexOf("\n\n\n  if (loading)", submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart, "Expected lesson quiz submit handler");
  const submit = player.slice(submitStart, submitEnd);
  assert.match(submit, /setQuizPassed\(Boolean\(graded\.passed\)\)/);
  assert.match(submit, /if \(!currentCompleted\)/);
  assert.doesNotMatch(submit, /const passed = score/);
  assert.match(submit, /\/api\/ai\/quiz\/submit/);
  assert.match(submit, /\/api\/ai\/practice-quiz\/submit/);
  assert.match(submit, /\/api\/progress\/\$\{courseId\}\/items\/\$\{lessonId\}\/complete/);
  assert.match(player, /method = wasCompleted \? "DELETE" : "POST"/);
  assert.match(player, /onClick=\{\(\) => void handleToggleLessonCompletion\(lesson\.id\)\}/);
  assert.match(player, /aria-label=\{done \? `Mark \$\{cleanedTitle\} incomplete` : `Mark \$\{cleanedTitle\} complete`\}/);
});

 
test("course completion notification is emitted only by progress service on the completion transition", () => {
  const progressController = readFileSync(new URL("../src/controllers/progress.controller.js", import.meta.url), "utf8");
  const progressService = readFileSync(new URL("../src/services/progress.service.js", import.meta.url), "utf8");
  assert.doesNotMatch(progressController, /createNotificationEvent/);
  assert.doesNotMatch(progressController, /Course\.findById\(courseId\)/);
  assert.match(progressService, /if \(courseCompleted\) \{[\s\S]*?createNotificationEvent/);
  assert.match(progressService, /eventKey: `course-completed:\$\{userId\}:\$\{courseId\}`/);
});
