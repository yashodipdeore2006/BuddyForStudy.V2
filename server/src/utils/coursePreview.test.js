import assert from "node:assert/strict";
import test from "node:test";
import { toPublicCoursePreview } from "./coursePreview.js";

test("public course preview reports deduplicated YouTube runtime from lessons and snapshots", () => {
  const preview = toPublicCoursePreview({
    _id: "course-1",
    title: "Backend Engineering",
    modules: [
      {
        _id: "module-1",
        title: "Foundations",
        lessons: [
          {
            title: "HTTP and APIs",
            type: "tutorial",
            tutorial: {
              videos: [
                { videoId: "abcdefghijk", durationSeconds: 12 * 60 * 60 },
                { videoId: "lmnopqrstuv", duration: "PT8H" },
                // The same video appears again in a later lesson: count it once.
                { videoId: "abcdefghijk", durationSeconds: 2 * 60 * 60 }
              ]
            }
          },
          {
            title: "Build an API",
            type: "project",
            project: {
              videos: [
                { url: "https://www.youtube.com/watch?v=12345678901", duration: "02:00:00" }
              ]
            }
          }
        ]
      }
    ],
    generation: {
      snapshot: {
        modules: [
          { course: { videoId: "abcdefghijk", durationSeconds: 11 * 60 * 60 } },
          { course: { videoId: "lmnopqrstuv", durationSeconds: 7 * 60 * 60 } }
        ]
      }
    }
  });

  assert.equal(preview.cardMetadata.youtubeVideoCount, 3);
  assert.equal(preview.cardMetadata.youtubeRuntimeSeconds, 22 * 60 * 60);
  assert.equal(preview.modules.length, 1);
});

test("public course preview ignores non-YouTube URLs and resources without verified duration", () => {
  const preview = toPublicCoursePreview({
    title: "Systems",
    modules: [{
      title: "Systems",
      lessons: [{
        title: "Resources",
        type: "tutorial",
        tutorial: {
          videos: [
            { url: "https://example.com/watch?v=abcdefghijk", durationSeconds: 50 * 60 * 60 },
            { url: "https://www.youtube.com/watch?v=abcdefghijk" },
            { videoId: "not-a-valid-id", durationSeconds: 24 * 60 * 60 }
          ]
        }
      }]
    }]
  });

  assert.equal(preview.cardMetadata.youtubeVideoCount, 0);
  assert.equal(preview.cardMetadata.youtubeRuntimeSeconds, 0);
});

test("public course preview accepts supported YouTube URL forms and parses ISO durations", () => {
  const preview = toPublicCoursePreview({
    title: "AI Engineering",
    modules: [{
      title: "AI",
      lessons: [{
        title: "Agents",
        type: "tutorial",
        tutorial: {
          videos: [
            { url: "https://youtu.be/abcdefghijk", duration: "PT12H30M" },
            { url: "https://www.youtube.com/shorts/lmnopqrstuv", duration: "PT7H30M" }
          ]
        }
      }]
    }]
  });

  assert.equal(preview.cardMetadata.youtubeVideoCount, 2);
  assert.equal(preview.cardMetadata.youtubeRuntimeSeconds, 20 * 60 * 60);
});


test("public list projection preserves module count and strips raw module video resources", () => {
  const preview = toPublicCoursePreview({
    _id: "course-list-projection",
    title: "Production Backend Engineering",
    isPublished: true,
    moduleCount: 6,
    modules: [{
      _id: "module-1",
      title: "Backend",
      order: 1,
      lessons: [{
        _id: "lesson-1",
        title: "Build reliable APIs",
        type: "tutorial",
        order: 1,
        tutorial: {
          videos: [
            { videoId: "abcdefghijk", durationSeconds: 12 * 60 * 60 },
            { videoId: "lmnopqrstuv", durationSeconds: 8 * 60 * 60 }
          ]
        }
      }]
    }]
  });

  assert.equal(preview.moduleCount, 6);
  assert.equal(preview.cardMetadata.youtubeRuntimeSeconds, 20 * 60 * 60);
  assert.equal(preview.modules.length, 1);
  assert.equal(preview.modules[0].lessons.length, 1);
  assert.equal(Object.hasOwn(preview.modules[0].lessons[0], "tutorial"), false);
  assert.equal(Object.hasOwn(preview.modules[0].lessons[0], "project"), false);
});
