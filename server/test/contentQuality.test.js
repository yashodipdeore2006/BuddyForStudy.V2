import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("generated courses respect manual or automatic approval while retaining revision history", async () => {
  const model = await read("../src/models/Course.js");
  assert.match(model, /content_approval_ai_courses/);
  assert.match(model, /courseSchema\.pre\("validate", async function enforceCourseApprovalPolicy/);
  assert.match(model, /if \(await getCourseApprovalMode\(\) === "automatic"\)/);
  assert.match(model, /await applyAutomaticCourseApproval\(this\)/);
  assert.match(model, /this\.isPublished = false/);
  assert.match(model, /this\.aiReviewStatus = "pending"/);
  assert.match(model, /this\.aiReviewSource = "manual"/);
  assert.match(model, /evaluateCourseReadiness\(course\)/);
  assert.match(model, /createRevisionBeforeCourseChange/);
  assert.match(model, /CourseRevision\.create/);
});
test("all course publishing paths require readiness and AI human approval", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const publish = controller.slice(controller.indexOf("export async function publishCourse"), controller.indexOf("export async function courseDetail"));
  const update = controller.slice(controller.indexOf("export async function updateCourse"), controller.indexOf("async function ensureDefaultPlans"));
  assert.match(publish, /evaluateCourseReadiness/);
  assert.match(publish, /Human review is required before publishing an AI-generated course/);
  assert.match(update, /Use the readiness-gated publish action to publish a course/);
});

test("course edits unpublish changed content and invalidate AI review approval", async () => {
  const model = await read("../src/models/Course.js");
  assert.match(model, /contentChanged && this\.isPublished/);
  assert.match(model, /this\.isPublished = false/);
  assert.match(model, /if \(contentChanged && isGeneratedCourse\(this\)\)/);
  assert.match(model, /this\.aiReviewedBy = null/);
});

test("course rollback restores a prior snapshot as a draft and records a reason", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const rollback = controller.slice(controller.indexOf("export async function rollbackCourseRevision"), controller.indexOf("export async function reviewAiCourse"));
  assert.match(rollback, /revision\.snapshot/);
  assert.match(rollback, /course\.isPublished = false/);
  assert.match(rollback, /course\.status = "draft"/);
  assert.match(rollback, /course\.revision\.rolled_back/);
  assert.match(rollback, /requireContentReason/);
});

test("soft-deleted courses are excluded from learner-facing catalogue and detail queries", async () => {
  const service = await read("../src/services/course.service.js");
  assert.match(service, /const filter = \{ isPublished: true, deletedAt: null, \$and: \[PUBLICATION_APPROVAL_FILTER\] \}/);
  assert.match(service, /accessBranches = \[\{ isPublished: true, \$and: \[PUBLICATION_APPROVAL_FILTER\] \}\]/);
  assert.match(service, /deletedAt: null,/);
  assert.match(service, /PUBLICATION_APPROVAL_FILTER/);
  assert.match(service, /isApprovedForPublication/);
  assert.match(service, /aiReviewSource === "automatic"/);
});

test("review, quiz, AI insight and Q&A records support moderation and audit", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const routes = await read("../src/routes/adminPro.routes.js");
  for (const type of ["review", "quiz", "insight", "qa"]) assert.match(controller, new RegExp(type + ": \\{ model:"));
  assert.match(controller, /export async function contentModerationList/);
  assert.match(controller, /export async function moderateContent/);
  assert.match(controller, /await audit\(req, "content\." \+ type \+ "\.moderated"/);
  assert.match(routes, /content-moderation\/:contentType/);
});

test("moderated-hidden content is excluded from learner retrieval", async () => {
  const reviews = await read("../src/services/review.service.js");
  const ai = await read("../src/services/advancedAI.service.js");
  const quizzes = await read("../src/controllers/ai.controller.js");
  assert.match(reviews, /isHidden: \{ \$ne: true \}/);
  assert.match(ai, /hiddenInsight/);
  assert.match(ai, /hiddenAnswer/);
  assert.match(quizzes, /isHidden: \{ \$ne: true \}/);
});

test("content quality endpoints include roadmaps, broken links and revision restore", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const routes = await read("../src/routes/adminPro.routes.js");
  assert.match(controller, /export async function contentRoadmaps/);
  assert.match(controller, /export async function brokenCourseLinks/);
  assert.match(controller, /isUnsafeLinkHost/);
  assert.match(routes, /content-roadmaps/);
  assert.match(routes, /content\/broken-links\/check/);
  assert.match(routes, /revisions\/:revisionId\/rollback/);
});

test("private AI draft courses remain owner-only and never enter the public catalogue before approval", async () => {
  const model = await read("../src/models/Course.js");
  const service = await read("../src/services/course.service.js");
  const discovery = await read("../src/services/discovery.service.js");
  const entitlement = await read("../src/services/subscriptionEntitlement.service.js");
  const enrollment = await read("../src/services/enrollment.service.js");
  const courseRoutes = await read("../src/routes/course.routes.js");
  assert.match(model, /visibility: \{ type: String, enum: \["public", "private"\]/);
  assert.match(discovery, /createPrivateCourseForUser/);
  assert.match(discovery, /visibility = "private"/);
  assert.match(discovery, /createdForUser = userId/);
  assert.match(service, /cached\.visibility === "private"/);
  assert.match(service, /createdForUser: userId/);
  assert.match(entitlement, /visibility: "private", createdForUser: userId/);
  assert.match(enrollment, /visibility: "private", createdForUser: userId/);
  assert.match(courseRoutes, /optionalAuthMiddleware, controller\.details/);
});

test("editing a learner review resets its moderation decision according to the active policy", async () => {
  const service = await read("../src/services/review.service.js");
  assert.match(service, /moderationStatus: automaticallyApproved \? "approved" : "pending"/);
  assert.match(service, /moderatedBy: null/);
  assert.match(service, /isHidden: false/);
});

test("content approval policies are typed, permission-gated and independently configurable", async () => {
  const registry = await read("../src/utils/typedSettingsRegistry.js");
  const controller = await read("../src/controllers/adminPro.controller.js");
  const routes = await read("../src/routes/adminPro.routes.js");
  const page = await read("../../src/pages/admin/AdminContentQuality.tsx");

  for (const key of [
    "content_approval_ai_courses",
    "content_approval_user_reviews",
    "content_approval_ai_quizzes",
    "content_approval_ai_insights",
    "content_approval_ai_answers"
  ]) {
    assert.ok(registry.includes(key), "missing typed policy setting: " + key);
  }
  assert.match(registry, /type: "enum", options: \["manual", "automatic"\]/);
  assert.match(controller, /export async function contentApprovalPolicies/);
  assert.match(controller, /export async function updateContentApprovalPolicies/);
  assert.match(controller, /CONTENT_APPROVAL_MODES\.includes\(mode\)/);
  assert.match(routes, /router\.get\("\/content-policies", adminPermissionMiddleware\("courses\.read"\)/);
  assert.match(routes, /router\.put\("\/content-policies", adminPermissionMiddleware\("courses\.manage"\)/);
  assert.match(page, /content-policies/);
  assert.match(page, /manual/);
  assert.match(page, /automatic/);
});

test("private lesson assistance requires an active, non-revoked enrollment", async () => {
  const ai = await read("../src/services/advancedAI.service.js");
  assert.match(ai, /import \{ Enrollment \} from "\.\.\/models\/Enrollment\.js";/);
  const access = ai.slice(ai.indexOf("async function findCourseLesson"), ai.indexOf("function buildLessonContext"));
  assert.match(access, /if \(course\.visibility === "private"\)/);
  assert.match(access, /Enrollment\.exists\(\{/);
  assert.match(access, /status: \{ \$in: \["active", "completed"\] \}/);
  assert.match(access, /revokedBy: null/);
  assert.match(access, /course\.status === "archived"/);
});
test("AI roadmap builds a structured fallback for topics outside the curated knowledge base", async () => {
  const ai = await read("../src/services/aiRoadmap.service.js");
  assert.match(ai, /function buildTopicFallback\(topic, level = "Beginner"\)/);
  assert.match(ai, /"ciber security"/);
  assert.match(ai, /fallback = buildTopicFallback\(input\.topic, input\.level\)/);
  assert.match(ai, /fallback\.sources = await attachYouTubeResources\(fallback\.course\)/);
  assert.match(ai, /type: "tutorial"/);
  assert.match(ai, /type: "quiz"/);
  assert.match(ai, /type: "project"/);
});

test("enrolled learners retain access to published legacy courses while pending or rejected courses remain blocked", async () => {
  const service = await read("../src/services/course.service.js");
  const entitlement = await read("../src/services/subscriptionEntitlement.service.js");
  const ai = await read("../src/services/advancedAI.service.js");
  assert.match(service, /Grandfather existing learners of previously published courses/);
  assert.match(service, /if \(!courseDoc && userId\)/);
  assert.match(service, /status: \{ \$in: \["active", "completed"\] \}/);
  assert.match(service, /!\["pending", "rejected"\]\.includes\(cached\.aiReviewStatus\)/);
  assert.match(entitlement, /course\.aiReviewSource === "automatic"/);
  assert.match(entitlement, /if \(enrollment\) return true/);
  assert.match(entitlement, /return await hasPaidCourseAccess\(userId, courseId\)/);
  assert.match(ai, /const legacyPublishedEnrollment = Boolean\(/);
  assert.match(ai, /revokedBy: null/);
});


test("content quality admin page exposes lifecycle, review, moderation, roadmaps and link checking", async () => {
  const page = await read("../../src/pages/admin/AdminContentQuality.tsx");
  for (const phrase of ["Approve & publish if ready", "Soft delete", "Roll back", "Moderation decision saved", "Run link check", "Roadmaps"]) assert.ok(page.includes(phrase), "missing UI control: " + phrase);
});

test("legacy admin course endpoints cannot publish directly or permanently delete content", async () => {
  const controller = await read("../src/controllers/course.controller.js");
  const service = await read("../src/services/course.service.js");
  assert.match(controller, /Use the readiness-gated publish action to publish a course/);
  assert.match(controller, /Course moved to trash/);
  assert.match(service, /Course\.findById\(courseId\)/);
  assert.match(service, /course\.\$locals\.revisionContext/);
  assert.doesNotMatch(service, /Course\.findByIdAndDelete\(courseId\)/);
  assert.doesNotMatch(service, /Course\.findByIdAndUpdate\(courseId, input/);
});

test("admin roadmap listing uses bounded server-side pagination and reports page metadata", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const roadmaps = controller.slice(controller.indexOf("export async function contentRoadmaps"), controller.indexOf("function collectCourseLinks"));
  assert.match(roadmaps, /const page = Math\.max\(1,/);
  assert.match(roadmaps, /const limit = Math\.min\(Math\.max\(/);
  assert.match(roadmaps, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(roadmaps, /pages: Math\.max\(1, Math\.ceil\(total \/ limit\)\)/);
});
