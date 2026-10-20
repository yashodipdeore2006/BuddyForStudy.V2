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


test("public course preview exposes safe card metadata without leaking lesson payloads", () => {
  const course = {
    _id: "curated-course",
    title: "Computer Vision",
    description: "An AI-assembled course",
    category: "AI Course Search",
    level: "Beginner",
    duration: "4h 20m",
    generation: {
      mode: "normal",
      query: "computer vision",
      snapshot: {
        modules: [
          { course: { videoId: "video-1", channelTitle: "Databricks", score: 88, viewCount: 12000, likeCount: 900 } },
          { course: { videoId: "video-2", channelTitle: "Databricks", score: 92, viewCount: 8000, likeCount: 700 } }
        ]
      }
    },
    modules: [
      { title: "Foundations", order: 1, lessons: [
        { _id: "lesson-1", title: "Video 1", type: "tutorial", order: 1, tutorial: { videos: [{ videoId: "video-1", channelTitle: "Databricks", url: "https://youtube.com/watch?v=video-1" }] } },
        { _id: "lesson-2", title: "Video 2", type: "tutorial", order: 2, tutorial: { videos: [{ videoId: "video-2", channelTitle: "Databricks", url: "https://youtube.com/watch?v=video-2" }] } }
      ] }
    ]
  };
  const preview = toPublicCoursePreview(course);
  assert.deepEqual(preview.cardMetadata, {
    creatorName: "Databricks",
    typeTag: "Playlist",
    videoCount: 2,
    qualityScore: 90,
    viewCount: 20000,
    likeCount: 1600
  });
  assert.equal(preview.generation.mode, "normal");
  assert.equal("tutorial" in preview.modules[0].lessons[0], false);
});


test("public course preview counts snapshot-selected videos when generated courses have no lesson payloads", () => {
  const course = {
    _id: "snapshot-only-course",
    title: "Entrepreneurship Playlist",
    category: "Business",
    duration: "9h 28m",
    generation: {
      mode: "normal",
      sourceResourceType: "playlist",
      snapshot: {
        modules: [
          { course: { videoId: "playlist-video-1", title: "Introduction", channelTitle: "Startup School", score: 85, viewCount: 1200 } },
          { course: { videoId: "playlist-video-2", title: "Market research", channelTitle: "Startup School", score: 90, viewCount: 2400 } }
        ]
      }
    },
    modules: []
  };

  const preview = toPublicCoursePreview(course);
  assert.equal(preview.cardMetadata.typeTag, "Playlist");
  assert.equal(preview.cardMetadata.videoCount, 2);
  assert.equal(preview.cardMetadata.creatorName, "Startup School");
  assert.equal(preview.cardMetadata.qualityScore, 88);
  assert.equal(preview.cardMetadata.viewCount, 3600);
});


test("public course preview exposes a safe preview video id and lesson durations", () => {
  const course = {
    _id: "preview-course",
    title: "React Fundamentals",
    category: "Software Development",
    generation: {
      mode: "normal",
      sourceResourceType: "playlist",
      snapshot: {
        modules: [
          { course: { videoId: "dQw4w9WgXcQ", title: "Introduction", channelTitle: "Example Creator", score: 91, viewCount: 500 } }
        ]
      }
    },
    modules: [{
      _id: "module",
      title: "React Basics",
      order: 1,
      lessons: [{
        _id: "lesson",
        title: "Introduction",
        type: "tutorial",
        order: 1,
        tutorial: {
          videos: [{
            videoId: "dQw4w9WgXcQ",
            title: "Introduction",
            channelTitle: "Example Creator",
            durationSeconds: 630,
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          }]
        }
      }]
    }]
  };
  const preview = toPublicCoursePreview(course);
  assert.equal(preview.cardMetadata.previewVideoId, "dQw4w9WgXcQ");
  assert.equal(preview.modules[0].lessons[0].durationSeconds, 630);
  assert.equal("tutorial" in preview.modules[0].lessons[0], false);
});
