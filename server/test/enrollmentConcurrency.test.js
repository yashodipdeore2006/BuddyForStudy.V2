import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/services/enrollment.service.js", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/models/Enrollment.js", import.meta.url), "utf8");

test("concurrent enrollment duplicate-key races retry the existing-enrollment policy once", () => {
  assert.match(model, /enrollmentSchema\.index\(\{ user: 1, course: 1 \}, \{ unique: true \}\)/);
  const start = service.indexOf("export async function enroll");
  const end = service.indexOf("export async function getMine", start);
  assert.ok(start >= 0 && end > start, "Expected enrollment service");
  const handler = service.slice(start, end);
  assert.match(handler, /Enrollment\.create\(\{/);
  assert.match(handler, /if \(error\?\.code !== 11000 \|\| !retryAfterDuplicate\) throw error/);
  assert.match(handler, /Enrollment\.findOne\(\{ user: userId, course: courseId \}\)/);
  assert.match(handler, /retryAfterDuplicate: false/);
  assert.match(handler, /return enroll\(userId, courseId/);
});

test("enrollment duplicate retry is bounded to one retry and leaves non-duplicate failures untouched", () => {
  const start = service.indexOf("export async function enroll");
  const end = service.indexOf("export async function getMine", start);
  const handler = service.slice(start, end);
  assert.match(handler, /if \(error\?\.code !== 11000 \|\| !retryAfterDuplicate\) throw error/);
  assert.match(handler, /if \(!concurrentEnrollment\) throw error/);
});
