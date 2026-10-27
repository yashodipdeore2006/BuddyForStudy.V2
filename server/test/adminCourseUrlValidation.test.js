import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/admin-course-url-validation-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";

const { Course } = await import("../src/models/Course.js");
const {
  addCourseVideo,
  updateCourseTutorial,
  addModuleResource
} = await import("../src/controllers/adminPro.controller.js");

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("admin video and resource endpoints reject malformed or unsafe URLs before saving", async () => {
  const courseId = "507f1f77bcf86cd799439011";
  const moduleId = "507f1f77bcf86cd799439012";
  const lessonId = "507f1f77bcf86cd799439013";
  let saves = 0;
  const module = {
    _id: moduleId,
    title: "URL test module",
    lessons: [{ _id: lessonId, type: "tutorial", title: "URL test lesson", tutorial: { content: "", resources: [], videos: [] } }],
    resources: []
  };
  const course = {
    _id: courseId,
    modules: [module],
    save: async () => { saves += 1; },
    markModified() {},
    $locals: {}
  };
  const originalFindById = Course.findById;
  Course.findById = async () => course;

  const calls = [
    {
      name: "malformed video URL",
      handler: addCourseVideo,
      req: { params: { courseId, moduleId }, body: { resourceUrl: "not a URL" } },
      expected: /valid HTTP or HTTPS YouTube video or playlist URL/i
    },
    {
      name: "unsafe tutorial URL",
      handler: updateCourseTutorial,
      req: { params: { courseId }, body: { lessonId, resourceUrl: "javascript:alert(1)" } },
      expected: /valid HTTP or HTTPS YouTube video or playlist URL/i
    },
    {
      name: "deceptive HTTP-like resource scheme",
      handler: addModuleResource,
      req: { params: { courseId, moduleId }, body: { title: "Deceptive link", url: "httpfoo://docs.example.com/file", type: "link" } },
      expected: /valid HTTP or HTTPS URL/i
    },
    {
      name: "file URL resource",
      handler: addModuleResource,
      req: { params: { courseId, moduleId }, body: { title: "Local file", url: "file:///etc/passwd", type: "document" } },
      expected: /valid HTTP or HTTPS URL/i
    }
  ];

  try {
    for (const item of calls) {
      const res = responseMock();
      let nextError = null;
      await item.handler(item.req, res, (error) => { nextError = error || null; });
      assert.equal(nextError, null, `${item.name} should return a client error, not bubble an exception`);
      assert.equal(res.statusCode, 400, item.name);
      assert.match(res.body.message, item.expected, item.name);
    }
    assert.equal(saves, 0);
  } finally {
    Course.findById = originalFindById;
  }
});
