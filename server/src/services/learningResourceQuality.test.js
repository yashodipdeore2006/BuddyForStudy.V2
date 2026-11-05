import test from "node:test";
import assert from "node:assert/strict";
import { assessCourseResourceQuality, getCourseResourceMetrics } from "./learningResourceQuality.js";

function courseWithVideos(videoIdsByLesson) {
  return {
    modules: [{
      lessons: videoIdsByLesson.map((ids, index) => ({
        type: "tutorial",
        title: "Lesson " + (index + 1),
        tutorial: {
          videos: ids.map((videoId) => ({ videoId, durationSeconds: 1800 }))
        }
      }))
    }]
  };
}

test("one short video cannot satisfy a multi-lesson complete learning path", () => {
  const course = courseWithVideos([["python-intro"], [], [], [], []]);
  const result = assessCourseResourceQuality(course, { completePath: true });
  assert.equal(result.uniqueVideoCount, 1);
  assert.equal(result.coverageRatio, 0.2);
  assert.equal(result.acceptable, false);
  assert.equal(result.reason, "insufficient_lesson_coverage");
});

test("complete paths require a resource in every lesson and a distinct video per lesson", () => {
  const course = courseWithVideos([["v1"], ["v2"], ["v3"], ["v4"], ["v5"]]);
  const result = assessCourseResourceQuality(course, { completePath: true });
  assert.equal(result.uniqueVideoCount, 5);
  assert.equal(result.coverageRatio, 1);
  assert.equal(result.acceptable, true);
});

test("duplicating one video across lessons does not inflate distinct resource coverage", () => {
  const course = courseWithVideos([["same"], ["same"], ["same"]]);
  const result = assessCourseResourceQuality(course, { completePath: true });
  assert.equal(result.uniqueVideoCount, 1);
  assert.equal(result.videoWatchMinutes, 30);
  assert.equal(result.acceptable, false);
  assert.equal(result.reason, "not_enough_distinct_videos");
});

test("one short video cannot satisfy a long personalized lesson runtime", () => {
  const course = {
    modules: [{
      lessons: [{
        type: "tutorial",
        tutorial: {
          searchPolicy: { targetDurationMinutes: 210 },
          videos: [{ videoId: "short-python", durationSeconds: 30 * 60 }]
        }
      }]
    }]
  };
  const result = assessCourseResourceQuality(course, { completePath: true });
  assert.equal(result.videoWatchMinutes, 30);
  assert.equal(result.plannedVideoMinutes, 210);
  assert.equal(result.resourceRuntimeRatio, 0.143);
  assert.equal(result.acceptable, false);
  assert.equal(result.reason, "insufficient_video_runtime");
});

test("a curated playlist contributes its distinct playable items", () => {
  const course = {
    modules: [{
      lessons: [{
        type: "tutorial",
        tutorial: {
          videos: [{
            playlistId: "playlist-1",
            items: [
              { videoId: "v1", durationSeconds: 1200 },
              { videoId: "v2", durationSeconds: 1500 },
              { videoId: "v3", durationSeconds: 1800 }
            ]
          }]
        }
      }]
    }]
  };
  const result = assessCourseResourceQuality(course, { completePath: false });
  assert.equal(result.uniqueVideoCount, 3);
  assert.equal(result.videoWatchMinutes, 75);
  assert.equal(result.acceptable, true);
});
