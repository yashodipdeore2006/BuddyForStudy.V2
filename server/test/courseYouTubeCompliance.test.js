import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";

test("Course validation adds fetchedAt and strips YouTube statistics from lesson videos and alternatives", async () => {
  const course = new Course({
    title: "Compliance test course",
    slug: "compliance-test-course",
    description: "A schema-level privacy regression test.",
    category: "Engineering",
    level: "Beginner",
    duration: "1 hour",
    modules: [{
      title: "Module one",
      order: 1,
      lessons: [{
        title: "Lesson one",
        type: "tutorial",
        order: 1,
        tutorial: {
          videos: [{
            videoId: "primary-video",
            title: "Primary",
            viewCount: 123,
            likeCount: 10,
            statistics: { subscriberCount: 50 },
            alternatives: [{ videoId: "alternative-video", title: "Alternative", viewCount: 99, likeCount: 9 }]
          }]
        }
      }]
    }]
  });

  await course.validate();
  const video = course.modules[0].lessons[0].tutorial.videos[0];
  assert.ok(video.fetchedAt instanceof Date);
  assert.ok(video.alternatives[0].fetchedAt instanceof Date);
  assert.equal("viewCount" in video.toObject(), false);
  assert.equal("likeCount" in video.toObject(), false);
  assert.equal("statistics" in video.toObject(), false);
  assert.equal("viewCount" in video.alternatives[0].toObject(), false);
  assert.equal("likeCount" in video.alternatives[0].toObject(), false);
});
