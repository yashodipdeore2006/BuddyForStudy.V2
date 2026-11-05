import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCourseSearchFallbackResults,
  isBroadCourseSearch,
  MIN_COMPLETE_COURSE_PLAYLIST_ITEMS,
  MIN_COMPLETE_COURSE_VIDEO_SECONDS,
} from "../src/lib/courseSearchPolicy.ts";

test("broad Python searches require full-course videos or structured playlists", () => {
  const result = filterCourseSearchFallbackResults(
    "Python",
    [
      { id: "short", durationSeconds: 30 * 60 },
      { id: "full", durationSeconds: 4 * 60 * 60 },
    ],
    [
      { id: "short-playlist", itemCount: 3 },
      { id: "course-playlist", itemCount: 24 },
    ],
  );

  assert.equal(result.requiresCompleteCourse, true);
  assert.deepEqual(result.videos.map((item) => item.id), ["full"]);
  assert.deepEqual(result.playlists.map((item) => item.id), ["course-playlist"]);
  assert.equal(MIN_COMPLETE_COURSE_VIDEO_SECONDS, 10800);
  assert.equal(MIN_COMPLETE_COURSE_PLAYLIST_ITEMS, 8);
});

test("broad beginner course queries keep the complete-course policy", () => {
  assert.equal(isBroadCourseSearch("Python for beginners"), true);
  assert.equal(isBroadCourseSearch("Python full course"), true);
});

test("specific Python skill searches can still return focused tutorials", () => {
  const result = filterCourseSearchFallbackResults(
    "Python list comprehension",
    [{ id: "focused", durationSeconds: 12 * 60 }],
    [{ id: "focused-playlist", itemCount: 2 }],
  );

  assert.equal(result.requiresCompleteCourse, false);
  assert.equal(result.videos.length, 1);
  assert.equal(result.playlists.length, 1);
});
