import test from "node:test";
import assert from "node:assert/strict";
import {
  findLessonsMissingVideoResources,
  recoverMissingTutorialResources
} from "../src/services/courseResourceRecovery.service.js";

function fakeCourse() {
  const recovered = {
    _id: "lesson-recover",
    title: "SQL Joins",
    canonicalSkillId: "sql-joins",
    type: "tutorial",
    buildState: "queued",
    description: "Understand SQL joins",
    tutorial: { content: "Join relational tables", requiredTopics: ["INNER JOIN", "LEFT JOIN"], searchQuery: "SQL joins inner left right full tutorial", searchQueries: ["SQL joins inner left right full tutorial"], videos: [], resources: [] }
  };
  const alreadyHasVideo = {
    _id: "lesson-existing",
    title: "SQL Basics",
    type: "tutorial",
    tutorial: { content: "SQL basics", videos: [{ videoId: "abc123" }], resources: [] }
  };
  const course = {
    _id: "course-1",
    title: "SQL Learning Path",
    level: "Beginner",
    generation: { query: "SQL", snapshot: { resourceLanguage: "en" } },
    modules: [{ lessons: [recovered, alreadyHasVideo] }],
    saved: false,
    modified: false,
    markModified(path) { this.modified = path === "modules"; },
    async save() { this.saved = true; }
  };
  return { course, recovered, alreadyHasVideo };
}

test("resource recovery only searches tutorial lessons without a playable video", () => {
  const { course } = fakeCourse();
  assert.deepEqual(
    findLessonsMissingVideoResources(course).map(({ lesson }) => String(lesson._id)),
    ["lesson-recover"]
  );
});

test("resource recovery attaches the selected resource and invalidates the course cache", async () => {
  const { course, recovered } = fakeCourse();
  const calls = [];
  const invalidated = [];
  const summary = await recoverMissingTutorialResources(course, {
    curate: async (input) => {
      calls.push(input);
      return {
        best: {
          videoId: "video-123",
          title: "SQL Joins Explained",
          url: "https://www.youtube.com/watch?v=video-123",
          durationSeconds: 900
        },
        alternatives: [],
        meta: { state: "ready", lowConfidence: false }
      };
    },
    invalidateCache: async (key) => invalidated.push(key)
  });

  assert.equal(summary.examined, 1);
  assert.equal(summary.recovered, 1);
  assert.equal(summary.unavailable, 0);
  assert.equal(recovered.tutorial.videos[0].videoId, "video-123");
  assert.ok(recovered.tutorial.resources.includes("https://www.youtube.com/watch?v=video-123"));
  assert.equal(recovered.buildState, "ready");
  assert.equal(course.saved, true);
  assert.equal(course.modified, true);
  assert.deepEqual(invalidated, ["course:course-1"]);
  assert.equal(course.$locals.revisionContext.summary, "Learning resource recovery");
  assert.equal(calls[0].profile.topic, "SQL");
  assert.equal(calls[0].skill.canonicalSkillId, "sql-joins");
  assert.deepEqual(calls[0].skill.topics, ["INNER JOIN", "LEFT JOIN", "SQL Joins"]);
  assert.ok(calls[0].skill.searchQueries.includes("SQL joins inner left right full tutorial"));
});

test("resource recovery stops after YouTube quota exhaustion and leaves lessons retryable", async () => {
  const { course, recovered } = fakeCourse();
  let calls = 0;
  const summary = await recoverMissingTutorialResources(course, {
    curate: async () => {
      calls += 1;
      return { best: null, alternatives: [], meta: { state: "quota_limited", quotaState: "exhausted" } };
    },
    invalidateCache: async () => {}
  });
  assert.equal(calls, 1);
  assert.equal(summary.quotaLimited, true);
  assert.equal(summary.recovered, 0);
  assert.equal(recovered.buildState, "queued");
  assert.equal(course.saved, false);
});
