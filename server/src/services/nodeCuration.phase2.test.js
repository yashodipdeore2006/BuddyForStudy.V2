import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const envKeys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "GEMINI_API_KEY", "YOUTUBE_API_KEY", "REDIS_URL", "NODE_CACHE_TTL_DAYS"];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let curateForNode;
let hooks;
let curateNormalSearch;
let calls = [];
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

  const engine = await import("./courseCurationDecisionEngine.service.js");
  curateNormalSearch = engine.curateNormalSearch;
  const nodeModule = await import("./nodeCuration.service.js");
  curateForNode = nodeModule.curateForNode;
  hooks = nodeModule.__nodeCurationTestHooks;
});

after(() => {
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
    minPlaylistSeconds: 1800, minPlaylistItems: 2, halfLifeDays: undefined
  });
  assert.equal(hooks.durationBounds({ minMinutes: 10, targetMinutes: 59, maxMinutes: 59 }).mode, "quick_reference");
  assert.equal(hooks.durationBounds({ minMinutes: 30, targetMinutes: 60, maxMinutes: 90 }).mode, "crash_course");
});

test("roadmap syllabus injection builds equal-weight modules without calling Gemini syllabus", () => {
  const syllabus = hooks.buildInjectedSyllabus({ name: "Node.js", topics: ["Runtime", "Modules", "Runtime"] });
  assert.deepEqual(syllabus.modules.map((item) => item.name), ["Runtime", "Modules"]);
  assert.deepEqual(syllabus.modules.map((item) => item.weight), [1, 1]);
  assert.equal(syllabus.source, "roadmap-skill");
});

test("node cache is isolated from normal search and a second call uses zero search quota", async () => {
  cacheRows.clear();
  calls = [];
  const skill = { id: "node-runtime", canonicalSkillId: "node-runtime", name: "Node.js", topics: ["Runtime", "Modules"], searchQueries: ["Node.js runtime course"] };
  const original = curateNormalSearch;
  const engineModule = await import("./courseCurationDecisionEngine.service.js");
  const nodeSource = await import("node:fs/promises").then((m) => m.readFile(new URL("./nodeCuration.service.js", import.meta.url), "utf8"));
  assert.match(nodeSource, /cacheScope: `node:/);
  // Exercise persistent node cache by seeding a stable result via a temporary DB-backed engine mock is not supported by ESM bindings;
  // invoke twice and assert the second invocation reads the node cache without invoking the provider.
  globalThis.__phase2TestSelectorCalls = 0;
  const first = await curateForNode({ skill, profile: { topic: "Backend development", level: "Beginner", language: "en" }, durationPolicy: { minMinutes: 30, targetMinutes: 180, maxMinutes: 240 } });
  const afterFirst = cacheRows.size;
  const second = await curateForNode({ skill, profile: { topic: "Backend development", level: "Beginner", language: "en" }, durationPolicy: { minMinutes: 30, targetMinutes: 180, maxMinutes: 240 } });
  assert.ok(afterFirst >= 1);
  assert.equal(second.meta.cacheHit, true);
  assert.equal(second.meta.searchCalls, 0);
  assert.equal(second.meta.quotaUnits, 0);
  assert.equal(second.best?.videoId, first.best?.videoId);
  delete globalThis.__phase2TestSelectorCalls;
});

test("node cache key includes mode, level, language and bounds", () => {
  const common = { canonicalSkillId: "react", mode: "full_course", level: "Beginner", language: "en", boundsHash: "bounds-a" };
  const key = hooks.nodeCacheKey(common);
  assert.notEqual(key, hooks.nodeCacheKey({ ...common, level: "Advanced" }));
  assert.notEqual(key, hooks.nodeCacheKey({ ...common, language: "hi" }));
  assert.notEqual(key, hooks.nodeCacheKey({ ...common, boundsHash: "bounds-b" }));
});
