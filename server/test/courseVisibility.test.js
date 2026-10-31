import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/course-visibility-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { Course } = await import("../src/models/Course.js");
const { listPublished, getPublished } = await import("../src/services/course.service.js");

test("public catalogue query excludes drafts, archived records, deleted records and unapproved generated courses", async () => {
  const originalAggregate = Course.aggregate;
  const originalCountDocuments = Course.countDocuments;
  const pipelines = [];
  let countFilter;

  Course.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    return [];
  };
  Course.countDocuments = async (filter) => {
    countFilter = filter;
    return 0;
  };

  try {
    const result = await listPublished({ page: 1, limit: 10 });
    assert.equal(result.courses.length, 0);
    assert.deepEqual(countFilter.isPublished, true);
    assert.equal(countFilter.deletedAt, null);
    assert.deepEqual(countFilter.status, { $ne: "archived" });
    assert.equal(countFilter.$and.length, 1);
    assert.ok(countFilter.$and[0].$or, "generated-course approval rules must remain part of the public filter");
    assert.equal(pipelines.length, 1);
    assert.deepEqual(pipelines[0][0].$match.status, { $ne: "archived" });
    assert.deepEqual(pipelines[0][0].$match.isPublished, true);
    assert.equal(pipelines[0][0].$match.deletedAt, null);
    assert.equal(result.pagination.total, 0);
  } finally {
    Course.aggregate = originalAggregate;
    Course.countDocuments = originalCountDocuments;
  }
});

test("unprivileged course detail lookup filters archived, deleted and unpublished records at query time", async () => {
  const originalFindOne = Course.findOne;
  const originalRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  let capturedFilter;

  Course.findOne = async (filter) => {
    capturedFilter = filter;
    return null;
  };

  try {
    const result = await getPublished("507f1f77bcf86cd799439011", null);
    assert.equal(result, null);
    assert.equal(capturedFilter._id, "507f1f77bcf86cd799439011");
    assert.equal(capturedFilter.deletedAt, null);
    assert.deepEqual(capturedFilter.status, { $ne: "archived" });
    assert.ok(capturedFilter.$or.some((branch) => branch.isPublished === true));
    assert.ok(capturedFilter.$or.every((branch) => branch.visibility !== "private"));
  } finally {
    Course.findOne = originalFindOne;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  }
});


test("standalone module search never re-exposes archived parents or generated child courses", () => {
  const source = readFileSync(new URL("../src/services/course.service.js", import.meta.url), "utf8");
  const start = source.indexOf("async function getStandaloneModuleCourses");
  const end = source.indexOf("\nfunction hasMultipleTutorialVideos", start);
  assert.ok(start >= 0 && end > start, "Expected standalone module course discovery helper");

  const helper = source.slice(start, end);
  assert.ok(helper.includes('status: { $ne: "archived" }'));
  assert.ok(helper.includes('existing.status !== "archived"'));
  assert.ok(helper.includes('created.status !== "archived"'));
  assert.ok(helper.includes('duplicate.status !== "archived"'));
  assert.ok(helper.includes("!created.deletedAt"));
  assert.ok(helper.includes("!duplicate.deletedAt"));
});
