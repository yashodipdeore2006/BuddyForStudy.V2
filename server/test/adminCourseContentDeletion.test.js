import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";
import { deleteCourseModule, deleteCourseLesson, deleteModuleResource } from "../src/controllers/adminPro.controller.js";

const COURSE_ID = "507f1f77bcf86cd799439011";
const MODULE_ID = "507f1f77bcf86cd799439012";
const LESSON_ID = "507f1f77bcf86cd799439013";
const RESOURCE_ID = "507f1f77bcf86cd799439014";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

const operations = [
  { name: "module deletion", controller: deleteCourseModule, params: { courseId: COURSE_ID, moduleId: MODULE_ID }, malformedParams: { courseId: "bad-id", moduleId: MODULE_ID } },
  { name: "lesson deletion", controller: deleteCourseLesson, params: { courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID }, malformedParams: { courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: "bad-id" } },
  { name: "resource deletion", controller: deleteModuleResource, params: { courseId: COURSE_ID, moduleId: MODULE_ID, resourceId: RESOURCE_ID }, malformedParams: { courseId: COURSE_ID, moduleId: "bad-id", resourceId: RESOURCE_ID } }
];

for (const operation of operations) {
  test(`${operation.name} rejects missing, short, and oversized reasons before database access`, async () => {
    const originalFindById = Course.findById;
    let lookupCalls = 0;
    Course.findById = async () => {
      lookupCalls += 1;
      throw new Error("Course lookup must not run for an invalid reason.");
    };
    try {
      for (const reason of [undefined, "", "too short", "x".repeat(501)]) {
        const res = responseRecorder();
        await operation.controller({
          params: operation.params,
          body: reason === undefined ? {} : { reason },
          user: { userId: "admin-test" }
        }, res, (error) => assert.fail("Invalid reason must fail before database access: " + error));
        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /reason of 10–500 characters is required/i);
      }
      assert.equal(lookupCalls, 0);
    } finally {
      Course.findById = originalFindById;
    }
  });

  test(`${operation.name} rejects malformed route identifiers before database access`, async () => {
    const originalFindById = Course.findById;
    let lookupCalls = 0;
    Course.findById = async () => {
      lookupCalls += 1;
      throw new Error("Course lookup must not run for malformed identifiers.");
    };
    try {
      const res = responseRecorder();
      await operation.controller({
        params: operation.malformedParams,
        body: { reason: "Removal approved after review" },
        user: { userId: "admin-test" }
      }, res, (error) => assert.fail("Malformed identifier must be rejected before database access: " + error));
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /invalid/i);
      assert.equal(lookupCalls, 0);
    } finally {
      Course.findById = originalFindById;
    }
  });
}
