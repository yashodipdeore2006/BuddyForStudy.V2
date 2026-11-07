import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const envKeys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "GEMINI_API_KEY", "YOUTUBE_API_KEY", "REDIS_URL", "NODE_CACHE_TTL_DAYS"];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let curateForNode;
let hooks;
let setSelector;
let cacheRows = new Map();
let originalFindOne;
let originalUpdateOne;
let CourseCurationCache;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_phase2_test";
  process.env.JWT_SECRET ||= "phase2-test-only-secret";
  process.env.GEMINI_API_KEY = "phase2-mock-gemini-key";
  process.env.YOUTUBE_API_KEY = "phase2-mock-youtube-key";
  process.env.REDIS_URL = "";
  process.env.NODE_CACHE_TTL_DAYS = "14";

  const cacheModule = await import("../models/CourseCurationCache.js");
  CourseCurationCache = cacheModule.CourseCurationCache;
  originalFindOne = CourseCurationCache.findOne;
  originalUpdateOne = CourseCurationCache.updateOne;
  CourseCurationCache.findOne = ({ key, kind }) => ({ lean: async () => {
    const row = cacheRows.get(key);
    return row && row.kind === kind && row.expiresAt > new Date() ? row : null;
  } });
  CourseCurationCache.updateOne = async ({ key }, update) => {
    cacheRows.set(key, { key, ...update.$set });
    return { acknowledged: true };
  };

  const nodeModule = await import("./nodeCuration.service.js");
  curateForNode = nodeModule.curateForNode;
  hooks = nodeModule.__nodeCurationTestHooks;
  setSelector = nodeModule.__setNodeCurationSelectorForTests;
});

after(() => {
  setSelector?.(null);
  CourseCurationCache.findOne = originalFindOne;
  CourseCurationCache.updateOne = originalUpdateOne;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("duration policy maps to bounded modes and limits", () => {
  assert.deepEqual(hooks.durationBounds({ minMinutes: 30, targetMinutes: 180, maxMinutes: 240 }), {
    mode: "full_course", minVideoSeconds: 1800, maxVideoSeconds: 14400,
    minPlaylistSeconds: 1800, minPlaylistItems: 3, halfLifeDays: undefined
  });
  assert.equal(hooks.durationBounds({ minMinutes: 10, targetMinutes: 59, maxMinutes: 59 }).mode, "quick_reference");
  assert.equal(hooks.durationBounds({ minMinutes: 30, targetMinutes: 60, maxMinutes: 90 }).mode, "crash_course");
});

test("duration policy performs one bounded search without widening or retrying", async () => {
  cacheRows.clear();
  let calls = 0;
  const observed = [];
  setSelector(async (_query, options) => {
    calls += 1;
    observed.push(options.overrides);
    return {
      resources: calls === 1 ? [] : [{
        id: "video:strict-duration",
        videoId: "strict-duration",
        title: "Python complete tutorial",
        durationSeconds: 1799,
        score: 90,
        finalScore: 90
      }],
      meta: { searchCalls: 1, quotaUnits: 100 }
    };
  });
  try {
    const result = await curateForNode({
      skill: { id: "python-stage", name: "Python Foundations", topics: ["syntax"] },
      profile: { topic: "Python", level: "Beginner", language: "en" },
      durationPolicy: { minMinutes: 60, targetMinutes: 120, maxMinutes: 210 }
    });
    assert.equal(calls, 1, "a failed node must not launch a second quota-consuming search");
    assert.equal(result.best, null, "a selector response below the minimum runtime must never be attached");
    assert.equal(observed[0].minVideoSeconds, 1800);
    assert.equal(observed[0].minPlaylistSeconds, 2700);
    assert.equal(observed[0].minPlaylistItems, 2);
  } finally {
    setSelector(null);
  }
});

test("roadmap syllabus injection builds equal-weight modules without calling Gemini syllabus", () => {
  const syllabus = hooks.buildInjectedSyllabus({ name: "Node.js", topics: ["Runtime", "Modules", "Runtime"] });
  assert.deepEqual(syllabus.modules.map((item) => item.name), ["Runtime", "Modules"]);
  assert.deepEqual(syllabus.modules.map((item) => item.weight), [1, 1]);
  assert.equal(syllabus.source, "roadmap-skill");
  assert.ok(syllabus.modules.every((module) => module.keyConcepts.length > 0), "each injected topic becomes a bounded syllabus module");
});

test("node cache is isolated from normal search and a second call uses zero search quota", async () => {
  cacheRows.clear();
  let selectorCalls = 0;
  let observedOptions;
  setSelector(async (query, options) => {
    selectorCalls += 1;
    observedOptions = options;
    return {
      query,
      resources: [{ id: "video:mock-node-video", videoId: "mock-node-video", title: "Node.js runtime course", description: "Runtime and modules", channelTitle: "Mock channel", durationSeconds: 10800, thumbnail: "https://mock.invalid/node.jpg", sourceUrl: "https://www.youtube.com/watch?v=mock-node-video", score: 78, finalScore: 78 }],
      meta: { resultCacheHit: false, searchCalls: 2, quotaUnits: 200 }
    };
  });
  const skill = { id: "node-runtime", canonicalSkillId: "node-runtime", name: "Node.js", topics: ["Runtime", "Modules"], searchQueries: ["Node.js runtime course"] };
  try {
    const first = await curateForNode({ skill, profile: { topic: "Backend development", level: "Beginner", language: "en" }, durationPolicy: { minMinutes: 30, targetMinutes: 180, maxMinutes: 240 } });
    assert.equal(selectorCalls, 1);
    assert.equal(observedOptions.cacheScope, "node:node-runtime");
    assert.equal(observedOptions.syllabus.source, "roadmap-skill");
    assert.deepEqual(observedOptions.syllabus.modules.map((item) => item.weight), [1, 1]);
    assert.equal(observedOptions.overrides.minVideoSeconds, 1800);
    assert.equal(observedOptions.overrides.maxVideoSeconds, 14400);
    assert.equal(observedOptions.overrides.minPlaylistItems, 3);
    assert.equal(first.meta.searchCalls, 2);
    assert.equal(first.meta.quotaUnits, 200);
    const second = await curateForNode({ skill, profile: { topic: "Backend development", level: "Beginner", language: "en" }, durationPolicy: { minMinutes: 30, targetMinutes: 180, maxMinutes: 240 } });
    assert.equal(selectorCalls, 1, "the node cache must serve the second request");
    assert.equal(second.meta.cacheHit, true);
    assert.equal(second.meta.searchCalls, 0);
    assert.equal(second.meta.quotaUnits, 0);
    assert.equal(second.best.videoId, first.best.videoId);
    assert.ok([...cacheRows.values()].some((row) => row.kind === "node"));
    assert.notEqual(hooks.nodeCacheKey({ canonicalSkillId: "node-runtime", mode: "full_course", level: "Beginner", language: "en", boundsHash: "bounds" }), "curation:node");
  } finally {
    setSelector(null);
  }
});


test("personalized roadmap cache scopes isolate different learners and profiles", () => {
  const base = {
    canonicalSkillId: "python-data-structures",
    mode: "full_course",
    level: "Beginner",
    language: "en",
    boundsHash: "bounds"
  };
  assert.notEqual(
    hooks.nodeCacheKey({ ...base, cacheScope: "learner-a:career" }),
    hooks.nodeCacheKey({ ...base, cacheScope: "learner-b:exam" })
  );
});

test("curated playlist mapping preserves each video's audio-language metadata", () => {
  const mapped = hooks.mapResource({
    id: "playlist:python-series",
    playlistId: "python-series",
    sourceType: "playlist",
    title: "Python complete learning series",
    description: "A structured Python course",
    items: [
      { videoId: "python-lesson-1", title: "Python basics", durationSeconds: 3600, defaultAudioLanguage: "en" },
      { videoId: "python-lesson-2", title: "Python functions", durationSeconds: 4200, defaultAudioLanguage: "ta" }
    ]
  });
  assert.equal(mapped.items.length, 2);
  assert.equal(mapped.items[0].defaultAudioLanguage, "en");
  assert.equal(mapped.items[1].defaultAudioLanguage, "ta");
});

test("playlist metadata language is not mistaken for spoken audio language", () => {
  const mapped = hooks.mapResource({
    id: "video:python-metadata",
    videoId: "python-metadata",
    title: "Python tutorial",
    defaultLanguage: "en"
  });
  assert.equal(mapped.defaultAudioLanguage, "");
});


test("quota-limited node remains retryable and is not cached as an empty result", async () => {
  cacheRows.clear();
  setSelector(async () => {
    const error = new Error("quota refused");
    error.name = "QuotaBudgetError";
    error.state = "exhausted";
    throw error;
  });
  const input = {
    skill: { id: "quota-limited-skill", canonicalSkillId: "quota-limited-skill", name: "Python variables", topics: ["variables"] },
    profile: { topic: "Python", level: "Beginner", language: "en" },
    durationPolicy: { minMinutes: 15, targetMinutes: 30, maxMinutes: 60 }
  };
  try {
    const result = await curateForNode(input);
    assert.equal(result.best, null);
    assert.equal(result.meta.state, "quota_limited");
    assert.equal(result.meta.quotaState, "exhausted");
    assert.equal([...cacheRows.values()].some((row) => row.kind === "node"), false);
  } finally {
    setSelector(null);
  }
});
