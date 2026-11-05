import test from "node:test";
import assert from "node:assert/strict";
import { assessCourseResourceQuality, getCourseResourceMetrics } from "./learningResourceQuality.js";

function courseWithVideos(videoIdsByLesson) {
  return {
    modules: [{
      lessons: videoIdsByLesson.map((ids, index) => ({
        type: "tutorial",
        title: \`Lesson \${index + 1}\`,
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

test("distinct resources and sufficient lesson coverage satisfy a complete path", () => {
  const course = courseWithVideos([["v1"], ["v2"], ["v3"], ["v4"], []]);
  const result = assessCourseResourceQuality(course, { completePath: true });
  assert.equal(result.uniqueVideoCount, 4);
  assert.equal(result.coverageRatio, 0.8);
  assert.equal(result.acceptable, true);
});

test("duplicate video IDs do not inflate resource count or watch time", () => {
  const course = courseWithVideos([["same"], ["same"], ["same"]]);
  const result = getCourseResourceMetrics(course);
  assert.equal(result.uniqueVideoCount, 1);
  assert.equal(result.videoWatchMinutes, 30);
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
