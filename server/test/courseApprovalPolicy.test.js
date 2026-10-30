import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";
import { PlatformSetting } from "../src/models/PlatformSetting.js";

function settingQuery(value) {
  return {
    select() { return this; },
    lean: async () => value
  };
}

async function validateGeneratedCourse(approvalMode) {
  const originalFindOne = PlatformSetting.findOne;
  PlatformSetting.findOne = (filter) => {
    if (filter.key === "content_approval_ai_courses") {
      return settingQuery(approvalMode == null ? null : { value: approvalMode });
    }
    if (filter.key === "generated_course_pricing_policy") {
      return settingQuery({ value: { enabled: false } });
    }
    return settingQuery(null);
  };
  try {
    const course = new Course({
      title: "AI Generated Course",
      slug: "ai-generated-course-" + String(approvalMode || "default"),
      description: "A generated course for approval-policy regression testing.",
      category: "Programming",
      level: "Beginner",
      duration: "4 weeks",
      isPublished: true,
      modules: [],
      generation: { mode: "ai", query: "React" }
    });
    await course.validate();
    return course;
  } finally {
    PlatformSetting.findOne = originalFindOne;
  }
}

test("AI course approval defaults to manual and remains unpublished until reviewed", async () => {
  const course = await validateGeneratedCourse(null);
  assert.equal(course.aiReviewStatus, "pending");
  assert.equal(course.aiReviewSource, "manual");
  assert.equal(course.aiReviewedBy, null);
  assert.equal(course.aiReviewedAt, null);
  assert.equal(course.isPublished, false);
  assert.equal(course.status, "draft");
});

test("manual AI course approval policy cannot be bypassed by a generated course payload", async () => {
  const course = await validateGeneratedCourse("manual");
  assert.equal(course.aiReviewStatus, "pending");
  assert.equal(course.aiReviewSource, "manual");
  assert.equal(course.isPublished, false);
  assert.equal(course.status, "draft");
});

test("automatic AI course approval records provenance but still enforces readiness before publication", async () => {
  const course = await validateGeneratedCourse("automatic");
  assert.equal(course.aiReviewStatus, "approved");
  assert.equal(course.aiReviewSource, "automatic");
  assert.equal(course.aiReviewedBy, null);
  assert.ok(course.aiReviewedAt instanceof Date);
  assert.equal(course.isPublished, false);
  assert.equal(course.status, "draft");
});
