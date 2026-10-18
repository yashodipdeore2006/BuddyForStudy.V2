import test from "node:test";
import assert from "node:assert/strict";
import { toPublicCoursePreview } from "../src/utils/coursePreview.js";

test("public course preview exposes catalogue structure but strips protected lesson payloads", () => {
  const course = {
    _id: "course-id",
    title: "Secure Course",
    description: "Course overview",
    pricing: { mode: "paid", price: 99 },
    secretInternalField: "never return",
    modules: [{
      _id: "module-id",
      title: "Module One",
      order: 1,
      lessons: [{
        _id: "lesson-id",
        title: "Lesson One",
        type: "tutorial",
        order: 1,
        description: "private instruction",
        tutorial: { content: "private lesson content", resources: ["private.pdf"], videos: [{ url: "private-provider-url" }] },
        quiz: { answers: ["private answer"] },
        project: { brief: "private project brief" }
      }]
    }]
  };
  const preview = toPublicCoursePreview(course);
  assert.equal(preview.title, "Secure Course");
  assert.equal(preview.modules[0].lessons[0].title, "Lesson One");
  assert.equal("secretInternalField" in preview, false);
  assert.equal("tutorial" in preview.modules[0].lessons[0], false);
  assert.equal("quiz" in preview.modules[0].lessons[0], false);
  assert.equal("project" in preview.modules[0].lessons[0], false);
  assert.equal("description" in preview.modules[0].lessons[0], false);
});
