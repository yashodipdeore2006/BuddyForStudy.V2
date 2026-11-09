import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/controllers/enrollment.controller.js", import.meta.url), "utf8");

test("course enrollment lookup represents a learner without enrollment as a successful empty result", () => {
  const start = controller.indexOf("export async function byCourse");
  const end = controller.indexOf("export async function byId", start);
  assert.ok(start >= 0 && end > start, "Expected byCourse controller");
  const handler = controller.slice(start, end);
  assert.match(handler, /if \(!isValidObjectId\(req\.params\.courseId\)\) return failure\(res, "Invalid courseId", 400\)/);
  assert.match(handler, /const enrollment = await service\.getForCourse\(req\.user\.userId, req\.params\.courseId\)/);
  assert.match(handler, /return success\(res, \{ enrollment: enrollment \|\| null \}\)/);
  assert.doesNotMatch(handler, /Enrollment not found/);
});
