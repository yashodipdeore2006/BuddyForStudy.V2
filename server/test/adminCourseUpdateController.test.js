import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { updateCourse } from "../src/controllers/adminPro.controller.js";

const COURSE_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f191e810c19729de860ea";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
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

test("admin course update returns success after saving and records the same audit reason", async () => {
  let saveCalls = 0;
  let recordedAuditEvent;
  const course = {
    _id: COURSE_ID,
    title: "Old course title",
    description: "A valid course description",
    category: "Development",
    level: "Beginner",
    duration: "6 weeks",
    thumbnail: "",
    learningOutcomes: ["Build an application"],
    status: "draft",
    visibility: "public",
    aiReviewStatus: "not_required",
    deletedAt: null,
    isPublished: false,
    pricing: { mode: "free", price: 0, compareAtPrice: 0, currency: "INR", saleEnabled: false, salePrice: 0 },
    enrollmentEnabled: true,
    certificateEnabled: true,
    featured: false,
    modules: [],
    $locals: {},
    async save() { saveCalls += 1; return this; },
  };
  const res = responseRecorder();

  await withMocks([
    [Course, { findById: async (id) => id === COURSE_ID ? course : null }],
    [AuditLog, { create: async (event) => { recordedAuditEvent = event; return event; } }],
  ], async () => {
    await updateCourse({
      params: { courseId: COURSE_ID },
      body: { title: "Updated course title", reason: "Correcting outdated course title" },
      user: { userId: ACTOR_ID },
      ip: "127.0.0.1",
      get: () => "course-update-test",
    }, res, (error) => assert.fail("Unexpected controller error: " + error));
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.course.title, "Updated course title");
  assert.equal(course.title, "Updated course title");
  assert.equal(saveCalls, 1);
  assert.equal(recordedAuditEvent.action, "course.updated");
  assert.equal(recordedAuditEvent.reason, "Correcting outdated course title");
});
