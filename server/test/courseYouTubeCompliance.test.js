import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";
import { __youtubeSelectorTestUtils } from "../src/services/youtube.service.js";

test("Course validation adds fetchedAt and strips YouTube statistics from lesson videos and alternatives", async () => {
  const course = new Course({
    title: "Compliance test course",
    slug: "compliance-test-course",
    description: "A schema-level privacy regression test.",
    category: "Engineering",
    level: "Beginner",
    duration: "1 hour",
    generation: { snapshot: { video: { videoId: "snapshot-video", title: "Snapshot video", viewCount: 88, likeCount: 7, subscriberCount: 3, statistics: { viewCount: "88" } } } },
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
  const snapshotVideo = course.generation.snapshot.video;
  assert.ok(snapshotVideo.fetchedAt instanceof Date);
  assert.equal("viewCount" in snapshotVideo, false);
  assert.equal("likeCount" in snapshotVideo, false);
  assert.equal("subscriberCount" in snapshotVideo, false);
  assert.equal("statistics" in snapshotVideo, false);
});

test("YouTube curation accepts only valid public embeddable video metadata", () => {
  const { isPublicEmbeddableCandidate } = __youtubeSelectorTestUtils;
  const valid = { videoId: "Abc_123xyz", privacyStatus: "public", embeddable: true };
  assert.equal(isPublicEmbeddableCandidate(valid), true);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, privacyStatus: "private" }), false);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, privacyStatus: "unlisted" }), false);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, privacyStatus: "unknown" }), false);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, embeddable: false }), false);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, embeddable: undefined }), false);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, videoId: "" }), false);
  assert.equal(isPublicEmbeddableCandidate({ ...valid, videoId: "invalid id" }), false);
  assert.equal(isPublicEmbeddableCandidate(null), false);
});

test("YouTube curation lookup rejects deleted, private, and non-embeddable resources", async () => {
  // The metadata predicate is deliberately fail-closed when the Data API
  // omits a resource or does not explicitly confirm public/embeddable status.
  const { isPublicEmbeddableCandidate } = __youtubeSelectorTestUtils;
  assert.equal(isPublicEmbeddableCandidate(undefined), false);
  assert.equal(isPublicEmbeddableCandidate({ videoId: "Abc_123xyz", privacyStatus: "public", embeddable: false }), false);
});
