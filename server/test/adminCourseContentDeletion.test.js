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



test("nested admin content deletion cannot cross course or module ownership boundaries", async () => {
  const MODULE_B_ID = "507f1f77bcf86cd799439015";
  const FOREIGN_MODULE_ID = "507f1f77bcf86cd799439016";
  let saveCalls = 0;
  let markModifiedCalls = 0;
  const course = {
    _id: COURSE_ID,
    modules: [
      {
        _id: MODULE_ID,
        lessons: [{ _id: "507f1f77bcf86cd799439019" }],
        resources: [{ _id: "507f1f77bcf86cd799439020" }]
      },
      {
        _id: MODULE_B_ID,
        // These IDs exist in another module, not in the route's module.
        lessons: [{ _id: LESSON_ID }],
        resources: [{ _id: RESOURCE_ID }]
      }
    ],
    $locals: {},
    markModified() { markModifiedCalls += 1; },
    async save() { saveCalls += 1; return this; }
  };
  const originalFindById = Course.findById;
  const queriedIds = [];
  Course.findById = async (id) => {
    queriedIds.push(String(id));
    return String(id) === COURSE_ID ? course : null;
  };

  const cases = [
    {
      name: "module ID from outside the requested course",
      controller: deleteCourseModule,
      params: { courseId: COURSE_ID, moduleId: FOREIGN_MODULE_ID },
      expected: "Course module not found"
    },
    {
      name: "lesson ID belonging to a different module",
      controller: deleteCourseLesson,
      params: { courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID },
      expected: "Lesson not found"
    },
    {
      name: "resource ID belonging to a different module",
      controller: deleteModuleResource,
      params: { courseId: COURSE_ID, moduleId: MODULE_ID, resourceId: RESOURCE_ID },
      expected: "Module resource not found"
    },
    {
      name: "module ID paired with a different course",
      controller: deleteCourseModule,
      params: { courseId: "507f1f77bcf86cd799439021", moduleId: MODULE_ID },
      expected: "Course not found"
    }
  ];

  try {
    for (const entry of cases) {
      const res = responseRecorder();
      await entry.controller({
        params: entry.params,
        body: { reason: "Reviewed request to remove invalid course content" },
        user: { userId: "507f191e810c19729de860ea" }
      }, res, (error) => { throw error; });

      assert.equal(res.statusCode, 404, entry.name);
      assert.equal(res.body.message, entry.expected, entry.name);
      assert.equal(res.body.success, false, entry.name);
    }

    assert.deepEqual(queriedIds, [
      COURSE_ID,
      COURSE_ID,
      COURSE_ID,
      "507f1f77bcf86cd799439021"
    ]);
    assert.equal(saveCalls, 0, "rejected cross-parent identifiers must not write the course");
    assert.equal(markModifiedCalls, 0, "rejected cross-parent identifiers must not mutate the course");
    assert.deepEqual(course.modules[1].lessons.map((item) => String(item._id)), [LESSON_ID]);
    assert.deepEqual(course.modules[1].resources.map((item) => String(item._id)), [RESOURCE_ID]);
  } finally {
    Course.findById = originalFindById;
  }
});
