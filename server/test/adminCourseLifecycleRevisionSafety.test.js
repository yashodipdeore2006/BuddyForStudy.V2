import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";
import { CourseRevision } from "../src/models/CourseRevision.js";
import {
  courseRevisions,
  publishCourse,
  rollbackCourseRevision,
  setCourseLifecycle
} from "../src/controllers/adminPro.controller.js";

const COURSE_ID = "507f1f77bcf86cd799439011";
const REVISION_ID = "507f1f77bcf86cd799439012";
const ACTOR_ID = "507f191e810c19729de860ea";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withMocks(mocks, run) {
  const originals = [];
  for (const [target, methods] of mocks) {
    for (const [key, value] of Object.entries(methods)) {
      originals.push({ target, key, original: target[key] });
      target[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const { target, key, original } of originals.reverse()) target[key] = original;
  }
}

function request(params = {}, body = {}) {
  return {
    params,
    body,
    user: { userId: ACTOR_ID, user: { _id: ACTOR_ID } }
  };
}

test("course revision listing is scoped to the requested course and capped at 100", async () => {
  let capturedFilter;
  let capturedLimit;
  const query = {
    select(fields) { this.fields = fields; return this; },
    populate(path, fields) { this.populateArgs = [path, fields]; return this; },
    sort(value) { this.sortValue = value; return this; },
    limit(value) { capturedLimit = value; return this; },
    lean: async () => []
  };
  const res = responseRecorder();

  await withMocks([
    [Course, { exists: async (filter) => {
      assert.deepEqual(filter, { _id: COURSE_ID });
      return true;
    } }],
    [CourseRevision, { find: (filter) => { capturedFilter = filter; return query; } }]
  ], async () => {
    await courseRevisions(request({ courseId: COURSE_ID }), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedFilter, { course: COURSE_ID });
  assert.equal(capturedLimit, 100);
  assert.deepEqual(query.sortValue, { revisionNumber: -1 });
  assert.equal(res.body.success, true);
});

test("course revision listing rejects an unknown course without querying revisions", async () => {
  let revisionQueryCalled = false;
  const res = responseRecorder();

  await withMocks([
    [Course, { exists: async () => false }],
    [CourseRevision, { find: () => {
      revisionQueryCalled = true;
      throw new Error("revision lookup must not run for an unknown course");
    } }]
  ], async () => {
    await courseRevisions(request({ courseId: COURSE_ID }), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 404);
  assert.match(res.body.message, /course not found/i);
  assert.equal(revisionQueryCalled, false);
});

test("revision rollback rejects malformed identifiers before database access", async () => {
  let courseLookupCalls = 0;
  let revisionLookupCalls = 0;
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async () => { courseLookupCalls += 1; return null; } }],
    [CourseRevision, { findOne: async () => { revisionLookupCalls += 1; return null; } }]
  ], async () => {
    await rollbackCourseRevision(
      request({ courseId: "not-an-id", revisionId: REVISION_ID }, { reason: "Restore approved course version" }),
      res,
      (error) => { throw error; }
    );
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /invalid course or revision id/i);
  assert.equal(courseLookupCalls, 0);
  assert.equal(revisionLookupCalls, 0);
});

test("revision rollback cannot use a revision belonging to another course", async () => {
  const course = {
    _id: COURSE_ID,
    $locals: {},
    setCalls: 0,
    saveCalls: 0,
    set() { this.setCalls += 1; },
    async save() { this.saveCalls += 1; }
  };
  let revisionFilter;
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async (id) => {
      assert.equal(id, COURSE_ID);
      return course;
    } }],
    [CourseRevision, { findOne: async (filter) => {
      revisionFilter = filter;
      // Simulate revision exists globally, but not for the requested course.
      return null;
    } }]
  ], async () => {
    await rollbackCourseRevision(
      request({ courseId: COURSE_ID, revisionId: REVISION_ID }, { reason: "Restore approved course version" }),
      res,
      (error) => { throw error; }
    );
  });

  assert.deepEqual(revisionFilter, { _id: REVISION_ID, course: COURSE_ID });
  assert.equal(res.statusCode, 404);
  assert.match(res.body.message, /course revision not found/i);
  assert.equal(course.setCalls, 0);
  assert.equal(course.saveCalls, 0);
  assert.deepEqual(course.$locals, {});
});

test("revision rollback requires a bounded reason before reading course or revision data", async () => {
  let lookupCalls = 0;
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async () => { lookupCalls += 1; return null; } }],
    [CourseRevision, { findOne: async () => { lookupCalls += 1; return null; } }]
  ], async () => {
    await rollbackCourseRevision(
      request({ courseId: COURSE_ID, revisionId: REVISION_ID }, { reason: "short" }),
      res,
      (error) => { throw error; }
    );
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /reason/i);
  assert.equal(lookupCalls, 0);
});

test("direct publish refuses a deleted course without saving or changing its publication state", async () => {
  const course = {
    _id: COURSE_ID,
    deletedAt: new Date("2026-11-01T00:00:00.000Z"),
    visibility: "public",
    isPublished: false,
    saveCalls: 0,
    async save() { this.saveCalls += 1; }
  };
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async () => course }]
  ], async () => {
    await publishCourse(request({ courseId: COURSE_ID }), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /must be restored before publishing/i);
  assert.equal(course.isPublished, false);
  assert.equal(course.saveCalls, 0);
});

test("direct publish refuses learner-private courses without exposing them to the public catalog", async () => {
  const course = {
    _id: COURSE_ID,
    deletedAt: null,
    visibility: "private",
    createdForUser: "507f191e810c19729de860eb",
    isPublished: false,
    status: "draft",
    saveCalls: 0,
    async save() { this.saveCalls += 1; }
  };
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async () => course }]
  ], async () => {
    await publishCourse(request({ courseId: COURSE_ID }), res, (error) => { throw error; });
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /remain private/i);
  assert.equal(course.isPublished, false);
  assert.equal(course.visibility, "private");
  assert.equal(course.saveCalls, 0);
});

test("course lifecycle cannot use the status endpoint to publish or bypass readiness checks", async () => {
  let courseLookupCalls = 0;
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async () => { courseLookupCalls += 1; return null; } }]
  ], async () => {
    await setCourseLifecycle(
      request({ courseId: COURSE_ID }, { status: "published", reason: "Publish through lifecycle endpoint" }),
      res,
      (error) => { throw error; }
    );
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /publish through the readiness-gated publish action/i);
  assert.equal(courseLookupCalls, 0);
});
