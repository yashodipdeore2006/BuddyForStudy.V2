import test from "node:test";
import assert from "node:assert/strict";
import { refreshStaleVideos } from "../src/services/youtubeCompliance.service.js";

const now = new Date("2026-10-24T03:00:00.000Z");
const stale = new Date(now.getTime() - 26 * 24 * 60 * 60 * 1000);
function apiVideo(id, title = "Refreshed video") {
  return { id, snippet: { title, channelTitle: "Mock channel", thumbnails: { high: { url: "https://img.example/thumb.jpg" } } }, contentDetails: { duration: "PT10M" }, statistics: { viewCount: "123456", likeCount: "1234", subscriberCount: "99999" }, status: { privacyStatus: "public", embeddable: true } };
}
function modelFor(courses, cacheEntries = []) {
  return {
    courseModel: { find: async () => courses },
    cacheModel: {
      find: async () => cacheEntries,
      updateOne: async () => ({ modifiedCount: 1 })
    }
  };
}

test("refreshStaleVideos refreshes stale metadata in videos.list batches of 50", async () => {
  const videos = Array.from({ length: 51 }, (_, index) => ({ videoId: `video-${index}`, title: "Old title", fetchedAt: stale, durationSeconds: 600 }));
  const course = { modules: [{ lessons: [{ type: "tutorial", tutorial: { videos, resourceStatus: "ready" } }] }], generation: { snapshot: null }, save: async () => {} };
  const calls = [];
  const { courseModel, cacheModel } = modelFor([course]);
  const result = await refreshStaleVideos({
    courseModel, cacheModel, now,
    request: async (endpoint, params) => {
      calls.push({ endpoint, ids: params.id.split(",") });
      return { items: params.id.split(",").map((id) => apiVideo(id, `Fresh ${id}`)) };
    }
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.ids.length), [50, 1]);
  assert.ok(calls.every((call) => call.endpoint === "videos"));
  assert.equal(result.videosChecked, 51);
  assert.equal(result.batches, 2);
  assert.equal(course.modules[0].lessons[0].tutorial.videos[0].title, "Fresh video-0");
  assert.equal(new Date(course.modules[0].lessons[0].tutorial.videos[0].fetchedAt).toISOString(), now.toISOString());
  assert.equal("viewCount" in course.modules[0].lessons[0].tutorial.videos[0], false);
  assert.equal("likeCount" in course.modules[0].lessons[0].tutorial.videos[0], false);
  assert.equal("statistics" in course.modules[0].lessons[0].tutorial.videos[0], false);
});

test("removed video swaps to an alternative or marks its lesson unavailable", async () => {
  const course = {
    modules: [{ lessons: [
      { type: "tutorial", tutorial: { resourceStatus: "ready", videos: [{ videoId: "removed-with-alt", title: "Removed", fetchedAt: stale, alternatives: [{ videoId: "alternative-1", title: "Alternative", fetchedAt: stale }] }] } },
      { type: "tutorial", tutorial: { resourceStatus: "ready", videos: [{ videoId: "removed-no-alt", title: "Removed", fetchedAt: stale, alternatives: [] }] } }
    ] }],
    generation: { snapshot: null },
    save: async () => {}
  };
  const { courseModel, cacheModel } = modelFor([course]);
  await refreshStaleVideos({
    courseModel, cacheModel, now,
    request: async (_endpoint, params) => ({ items: params.id.split(",").filter((id) => id === "alternative-1").map((id) => apiVideo(id, "Alternative refreshed")) })
  });
  const swapped = course.modules[0].lessons[0].tutorial;
  const unavailable = course.modules[0].lessons[1].tutorial;
  assert.equal(swapped.videos[0].videoId, "alternative-1");
  assert.equal(swapped.videos[0].reason, "Swapped after the selected YouTube video became unavailable");
  assert.equal(unavailable.resourceStatus, "unavailable");
  assert.equal(unavailable.videos[0].fetchedAt.toISOString(), now.toISOString());
});

test("refreshing a course snapshot strips statistics while preserving fetchedAt", async () => {
  const course = {
    modules: [],
    generation: { snapshot: { modules: [{ course: { videoId: "snapshot-video", title: "Old", fetchedAt: stale, viewCount: 99, likeCount: 4, subscriberCount: 22 } }] } },
    save: async () => {}
  };
  const { courseModel, cacheModel } = modelFor([course]);
  await refreshStaleVideos({
    courseModel, cacheModel, now,
    request: async () => ({ items: [apiVideo("snapshot-video", "New title")] })
  });
  const resource = course.generation.snapshot.modules[0].course;
  assert.equal(resource.title, "New title");
  assert.equal(new Date(resource.fetchedAt).toISOString(), now.toISOString());
  assert.equal("viewCount" in resource, false);
  assert.equal("likeCount" in resource, false);
  assert.equal("subscriberCount" in resource, false);
});
