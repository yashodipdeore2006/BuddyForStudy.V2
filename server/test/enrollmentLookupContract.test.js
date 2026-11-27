import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/controllers/enrollment.controller.js", import.meta.url), "utf8");

test("course access lookup returns learner enrollment and server-verified access summary without auto-enrolling", () => {
  const start = controller.indexOf("export async function byCourse");
  const end = controller.indexOf("export async function byId", start);
  assert.ok(start >= 0 && end > start, "Expected byCourse controller");
  const handler = controller.slice(start, end);
  assert.match(handler, /if \(!isValidObjectId\(req\.params\.courseId\)\) return failure\(res, "Invalid courseId", 400\)/);
  assert.match(handler, /const result = await service\.getCourseAccessForUser\(req\.user\.userId, req\.params\.courseId\)/);
  assert.match(handler, /return success\(res, \{ enrollment: result\.enrollment, access: result\.access \}\)/);
  assert.doesNotMatch(handler, /service\.enroll\(/);
  assert.doesNotMatch(handler, /Enrollment not found/);
});
