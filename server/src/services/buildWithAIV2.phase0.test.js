import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import {
  fixedGeminiRoadmapResponse,
  mockMernSyllabusResponse,
  mockMernYouTubeVideos,
  phase0ExpectedSnapshots
} from "./__fixtures__/buildWithAIV2.phase0.fixtures.js";

const envKeys = [
  "NODE_ENV",
  "MONGO_URI",
  "JWT_SECRET",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "REDIS_URL",
  "USE_CURATION_ENGINE_FOR_AI",
  "INTENT_V2",
  "ASYNC_ROADMAP",
  "YT_COMBINED_SEARCH",
  "ENABLE_TRUSTED_CHANNELS",
  "YT_DAILY_QUOTA_BUDGET",
  "YT_SOFT_LIMIT_PCT",
  "NODE_CACHE_TTL_DAYS",
  "NODE_CONCURRENCY",
  "AI_PRIVATE_COURSES_SKIP_REVIEW",
  "NODE_CACHE_TTL_DAYS"
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const providerCalls = [];
let env;
let curateNormalSearch;
let buildCourse;
let originalModelMethods = [];
let resetQuotaAdapters;

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function youtubeSearchItem(video) {
  return {
    id: { kind: "youtube#video", videoId: video.id },
    snippet: {
      title: video.title,
      description: video.description,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      thumbnails: { high: { url: "https://mock.example.test/" + video.id + ".jpg" } },
      defaultLanguage: "en"
    }
  };
}

function youtubeVideoDetails(video) {
  return {
    id: video.id,
    snippet: {
      title: video.title,
      description: video.description,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      tags: video.tags,
      thumbnails: { high: { url: "https://mock.example.test/" + video.id + ".jpg" } },
      defaultLanguage: "en"
    },
    contentDetails: { duration: video.duration },
    statistics: {
      viewCount: String(video.views),
      likeCount: String(video.likes),
      commentCount: "500"
    },
    status: { privacyStatus: "public", embeddable: true }
  };
}

async function mockedProviderFetch(input, init = {}) {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  const hostname = url.hostname;
  const endpoint = url.pathname.split("/").filter(Boolean).at(-1);
  const params = url.searchParams;

  if (hostname === "www.googleapis.com" && url.pathname.includes("/youtube/v3/")) {
    providerCalls.push({ provider: "youtube", endpoint, type: params.get("type") || "" });

    if (endpoint === "search") {
      if (params.get("type") === "playlist") return jsonResponse({ items: [] });
      return jsonResponse({ items: mockMernYouTubeVideos.map(youtubeSearchItem) });
    }

    if (endpoint === "videos") {
      const ids = new Set((params.get("id") || "").split(",").filter(Boolean));
      return jsonResponse({
        items: mockMernYouTubeVideos.filter((video) => ids.has(video.id)).map(youtubeVideoDetails)
      });
    }

    if (endpoint === "channels") {
      const ids = new Set((params.get("id") || "").split(",").filter(Boolean));
      return jsonResponse({
        items: mockMernYouTubeVideos
          .filter((video) => ids.has(video.channelId))
          .map((video) => ({
            id: video.channelId,
            snippet: { title: video.channelTitle },
            statistics: { subscriberCount: String(video.subscribers), viewCount: "1000000", videoCount: "100" },
            // Empty uploads IDs prevent the fixture from triggering additional discovery calls.
            contentDetails: { relatedPlaylists: { uploads: "" } }
          }))
          .filter((channel, index, list) => list.findIndex((item) => item.id === channel.id) === index)
      });
    }

    if (endpoint === "playlists" || endpoint === "playlistItems") return jsonResponse({ items: [] });
    return jsonResponse({ items: [] });
  }

  if (hostname === "generativelanguage.googleapis.com") {
    let bodyText = typeof init.body === "string" ? init.body : "";
    if (!bodyText && typeof Request !== "undefined" && input instanceof Request) {
      bodyText = await input.clone().text();
    }
    const isMetadataRubric = bodyText.includes('"evaluations"') || bodyText.includes('"candidateId"');
    providerCalls.push({ provider: "gemini", kind: isMetadataRubric ? "metadata-rubric" : "syllabus" });
    const value = isMetadataRubric ? { evaluations: [] } : mockMernSyllabusResponse;
    return jsonResponse({
      candidates: [{
        content: { role: "model", parts: [{ text: JSON.stringify(value) }] },
        finishReason: "STOP"
      }]
    });
  }

  // Fail closed instead of allowing a test to make an unmocked external request.
  throw new Error("Unexpected external request in Phase 0 test: " + hostname + url.pathname);
}

function restoreEnv() {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_phase0_test";
  process.env.JWT_SECRET ||= "phase0-test-only-secret-not-used-for-auth";
  process.env.GEMINI_API_KEY = "phase0-mock-gemini-key";
  process.env.YOUTUBE_API_KEY = "phase0-mock-youtube-key";
  process.env.REDIS_URL = "";

  // Explicit false values keep these tests independent of developer machine configuration.
  process.env.USE_CURATION_ENGINE_FOR_AI = "false";
  process.env.INTENT_V2 = "false";
  process.env.ASYNC_ROADMAP = "false";
  process.env.YT_COMBINED_SEARCH = "false";
  process.env.ENABLE_TRUSTED_CHANNELS = "false";
  process.env.YT_DAILY_QUOTA_BUDGET = "9000";
  process.env.YT_SOFT_LIMIT_PCT = "80";
  process.env.NODE_CACHE_TTL_DAYS = "14";
  process.env.NODE_CONCURRENCY = "3";
  process.env.AI_PRIVATE_COURSES_SKIP_REVIEW = "false";

  globalThis.fetch = mockedProviderFetch;

  const envModule = await import("../config/env.js");
  env = envModule.env;
  const quotaModule = await import("./quota.service.js");
  let quotaUnits = 0;
  quotaModule.__setQuotaTestAdapters({
    getState: async () => ({ state: quotaUnits >= 7200 ? "degraded" : "ok", units: quotaUnits, budget: 9000, softLimitPct: 80, resetDay: "test", store: "mock" }),
    increment: async (cost) => (quotaUnits += cost),
    markQuotaExceeded: async () => { quotaUnits = 9000; }
  });
  resetQuotaAdapters = () => quotaModule.__setQuotaTestAdapters(null);

  const { CourseCurationCache } = await import("../models/CourseCurationCache.js");
  const { PlatformSetting } = await import("../models/PlatformSetting.js");
  for (const [target, name] of [
    [CourseCurationCache, "findOne"],
    [CourseCurationCache, "updateOne"],
    [PlatformSetting, "findOne"]
  ]) {
    originalModelMethods.push({ target, name, value: target[name] });
  }

  // Keep the fixture test self-contained: no DB/Redis access or writes.
  CourseCurationCache.findOne = () => ({ lean: async () => null });
  CourseCurationCache.updateOne = async () => ({ acknowledged: true });
  PlatformSetting.findOne = () => ({
    select: () => ({ lean: async () => null })
  });

  ({ curateNormalSearch } = await import("./courseCurationDecisionEngine.service.js"));
  ({ buildCourse } = await import("./aiRoadmap.service.js"));
});

after(() => {
  globalThis.fetch = originalFetch;
  resetQuotaAdapters?.();
  for (const { target, name, value } of originalModelMethods) target[name] = value;
  restoreEnv();
});

test("Phase 0 feature flags stay off under the baseline configuration", () => {
  assert.equal(env.useCurationEngineForAi, false);
  assert.equal(env.intentV2, false);
  assert.equal(env.asyncRoadmap, false);
  assert.equal(env.ytCombinedSearch, false);
  assert.equal(env.enableTrustedChannels, false);
  assert.equal(env.aiPrivateCoursesSkipReview, false);
  assert.equal(env.ytDailyQuotaBudget, 9000);
  assert.equal(env.ytSoftLimitPct, 80);
  assert.equal(env.nodeCacheTtlDays, 14);
  assert.equal(env.nodeConcurrency, 3);
});

test("MERN stack normal-search snapshot and structured request telemetry remain stable", async () => {
  const originalInfo = console.info;
  let missLog;
  console.info = (message, fields) => {
    if (message === "Course curation completed") missLog = fields;
    else originalInfo(message, fields);
  };

  let response;
  try {
    response = await curateNormalSearch("MERN stack", { level: "Beginner", language: "en" });
  } finally {
    console.info = originalInfo;
  }

  const actual = response.resources.map((resource) => ({
    id: resource.id,
    score: Number(Number(resource.score).toFixed(2))
  }));
  assert.deepEqual(actual, phase0ExpectedSnapshots.normalSearchRanked);
  assert.equal(typeof missLog.requestId, "string");
  assert.ok(missLog.requestId.length > 0);
  assert.equal(missLog.skillId, null);
  assert.equal(typeof missLog.cacheHit, "boolean");
  assert.equal(missLog.resultCacheHit, false);
  assert.ok(Number.isInteger(missLog.searchCalls));
  assert.ok(Number.isInteger(missLog.quotaUnits));
  assert.ok(missLog.searchCalls > 0, "the mocked cold query should issue YouTube search requests");
  assert.ok(missLog.quotaUnits >= missLog.searchCalls * 100, "search.list calls should contribute 100 estimated units each");

  let hitLog;
  console.info = (message, fields) => {
    if (message === "Course curation completed") hitLog = fields;
    else originalInfo(message, fields);
  };
  try {
    const cached = await curateNormalSearch("MERN stack", { level: "Beginner", language: "en" });
    assert.deepEqual(cached.resources.map((item) => ({ id: item.id, score: Number(Number(item.score).toFixed(2)) })), actual);
  } finally {
    console.info = originalInfo;
  }
  assert.equal(hitLog.cacheHit, true);
  assert.equal(hitLog.resultCacheHit, true);
  assert.equal(hitLog.searchCalls, 0);
  assert.equal(hitLog.quotaUnits, 0);
});

test("buildCourse output for the fixed Gemini response matches the Phase 0 snapshot", async () => {
  const built = await buildCourse(fixedGeminiRoadmapResponse, {
    topic: "MERN stack",
    level: "Beginner",
    studyTimeMinutesPerDay: 60,
    goals: ["Career or work growth"],
    knownSkills: []
  }, {
    resolveSkill: async (name, options = {}) => ({
      id: String(options.aliases?.[0] || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      name,
      aliases: options.aliases || [],
      domain: options.domain || "general"
    }),
    logger: { info() {} }
  });
  const actual = JSON.parse(JSON.stringify(built.course));
  // Later roadmap phases add goal-specific modules to the original Phase 0 output.
  // Keep this snapshot focused on the Phase 0 baseline while explicitly checking
  // that the additive interview module is present and well-formed.
  const goalModules = actual.modules.filter((module) => module.goalModule);
  assert.ok(goalModules.some((module) => module.goalModule === "interview"));
  for (const module of goalModules) {
    assert.ok(Array.isArray(module.lessons));
    assert.ok(module.lessons.length > 0);
  }
  actual.modules = actual.modules.filter((module) => !module.goalModule);

  assert.deepEqual(actual, phase0ExpectedSnapshots.builtCourse);
});

test("Phase 0 curation fixture uses mocked YouTube and Gemini providers only", () => {
  assert.ok(providerCalls.some((call) => call.provider === "youtube" && call.endpoint === "search"));
  assert.ok(providerCalls.some((call) => call.provider === "gemini" && call.kind === "syllabus"));
});
