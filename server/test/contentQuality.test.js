import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AI-generated and derived courses are forced into drafts pending human review", async () => {
  const model = await read("../src/models/Course.js");
  assert.match(model, /enforceHumanReviewForGeneratedCourses/);
  assert.match(model, /this\.isPublished = false/);
  assert.match(model, /this\.aiReviewStatus = "pending"/);
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
  assert.match(model, /\["ai", "module", "discovery"\]\.includes\(this\.generation\?\.mode\) && contentChanged/);
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
  assert.match(service, /const filter = \{ isPublished: true, deletedAt: null \}/);
  assert.match(service, /_id: courseId, isPublished: true, deletedAt: null/);
  assert.match(service, /deletedAt: null,/);
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

test("content quality admin page exposes lifecycle, review, moderation, roadmaps and link checking", async () => {
  const page = await read("../../src/pages/admin/AdminContentQuality.tsx");
  for (const phrase of ["Human approve", "Soft delete", "Roll back", "Moderation decision saved", "Run link check", "Roadmaps"]) assert.ok(page.includes(phrase), "missing UI control: " + phrase);
});
