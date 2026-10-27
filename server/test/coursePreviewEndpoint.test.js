import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("public course details endpoint uses the sanitized preview for paid courses", () => {
  const controller = readFileSync(new URL("../src/controllers/course.controller.js", import.meta.url), "utf8");
  const start = controller.indexOf("export async function details(");
  const end = controller.indexOf("\nexport async function", start + 1);
  assert.ok(start >= 0 && end > start, "Expected the public course details handler");

  const handler = controller.slice(start, end);
  assert.ok(handler.includes("courseService.getPublished(req.params.courseId, req.user?.userId || null)"));
  assert.ok(handler.includes("const preview = toPublicCoursePreview("));
  assert.ok(handler.includes("return success(res, { course: preview })"));
  assert.equal(handler.includes("return success(res, { course: source })"), false);
});
