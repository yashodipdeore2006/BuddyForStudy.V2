import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const originalEnv = new Map(["NODE_ENV", "MONGO_URI", "JWT_SECRET", "YOUTUBE_API_KEY", "REDIS_URL", "YT_DAILY_QUOTA_BUDGET", "YT_SOFT_LIMIT_PCT", "YT_COMBINED_SEARCH"].map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let quota;
let gateway;
let quotaUnits = 0;
let quotaState = "ok";
let exhausted = false;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_phase1_test";
  process.env.JWT_SECRET ||= "phase1-test-only-secret";
  process.env.YOUTUBE_API_KEY = "phase1-mock-youtube-key";
  process.env.REDIS_URL = "";
  process.env.YT_DAILY_QUOTA_BUDGET = "1000";
  process.env.YT_SOFT_LIMIT_PCT = "80";
  process.env.YT_COMBINED_SEARCH = "false";
  quota = await import("./quota.service.js");
  quota.__setQuotaTestAdapters({
    getState: async () => ({ state: exhausted ? "exhausted" : quotaState, units: quotaUnits, budget: 1000, softLimitPct: 80, resetDay: "test", store: "mock" }),
    increment: async (cost) => (quotaUnits += cost),
    markQuotaExceeded: async () => { exhausted = true; quotaState = "exhausted"; },
  });
  gateway = await import("./youtubeGateway.js");
});

after(() => {
  globalThis.fetch = originalFetch;
  quota?.__setQuotaTestAdapters(null);
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("YouTube endpoint costs and Pacific reset day are explicit", () => {
  assert.equal(quota.YOUTUBE_API_COST.search, 100);
  assert.equal(quota.YOUTUBE_API_COST.default, 1);
  assert.match(quota.getPacificQuotaDay(new Date("2026-01-01T07:30:00Z")), /^2025-12-31$/);
  assert.match(quota.getPacificQuotaDay(new Date("2026-01-01T09:00:00Z")), /^2026-01-01$/);
});

test("quota states transition at the configured soft and hard thresholds", () => {
  assert.equal(quota.__quotaTestHooks.stateFor(799), "ok");
  assert.equal(quota.__quotaTestHooks.stateFor(800), "degraded");
  assert.equal(quota.__quotaTestHooks.stateFor(999), "degraded");
  assert.equal(quota.__quotaTestHooks.stateFor(1000), "exhausted");
  assert.equal(quota.__quotaTestHooks.stateFor(1, true), "exhausted");
});

test("degraded state refuses 100-unit search calls but allows 1-unit reads", async () => {
  quotaUnits = 800;
  quotaState = "degraded";
  exhausted = false;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return jsonResponse({ items: [] }); };
  await assert.rejects(gateway.youtubeRequest("search", { part: "snippet", q: "MERN" }), (error) => error.name === "QuotaBudgetError" && error.state === "degraded");
  assert.equal(calls, 0);
  const result = await gateway.youtubeRequest("videos", { part: "snippet", id: "mock-video" });
  assert.deepEqual(result.items, []);
  assert.equal(calls, 1);
});

test("gateway retries transient 5xx twice, with mocked provider responses", async () => {
  quotaUnits = 0;
  quotaState = "ok";
  exhausted = false;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls < 3 ? jsonResponse({ error: { message: "temporary" } }, 503) : jsonResponse({ items: [{ id: "mock-video" }] });
  };
  const result = await gateway.youtubeRequest("videos", { part: "snippet", id: "mock-video" });
  assert.equal(calls, 3);
  assert.equal(result.items[0].id, "mock-video");
  assert.equal(quotaUnits, 3, "each API attempt consumes one quota unit");
});

test("quotaExceeded marks the day exhausted and is never retried", async () => {
  quotaUnits = 0;
  quotaState = "ok";
  exhausted = false;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);
  };
  await assert.rejects(gateway.youtubeRequest("search", { part: "snippet", q: "MERN" }), (error) => error.name === "QuotaBudgetError" && error.state === "exhausted");
  assert.equal(calls, 1);
  assert.equal(exhausted, true);
  await assert.rejects(gateway.youtubeRequest("videos", { part: "snippet", id: "mock-video" }), (error) => error.name === "QuotaBudgetError" && error.state === "exhausted");
  assert.equal(calls, 1);
});

test("direct YouTube fetch is centralized in the gateway", async () => {
  const youtube = await readFile(new URL("./youtube.service.js", import.meta.url), "utf8");
  const discovery = await readFile(new URL("./discovery.service.js", import.meta.url), "utf8");
  const gatewaySource = await readFile(new URL("./youtubeGateway.js", import.meta.url), "utf8");
  assert.equal(/await fetch\(/.test(youtube), false);
  assert.equal(/await fetch\(/.test(discovery), false);
  assert.match(gatewaySource, /await fetch\(/);
});

test("combined search stays off by default and can be exercised with mocks when enabled", async () => {
  quotaUnits = 0;
  quotaState = "ok";
  exhausted = false;
  const { env } = await import("../config/env.js");
  assert.equal(env.ytCombinedSearch, false);
  const youtube = await import("./youtube.service.js");
  const originalCombined = env.ytCombinedSearch;
  env.ytCombinedSearch = true;
  const requestedTypes = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split("/").at(-1);
    requestedTypes.push({ endpoint, type: url.searchParams.get("type") });
    if (endpoint === "search") return jsonResponse({ items: [
      { id: { videoId: "mock-video" }, snippet: { title: "Mock video", channelId: "mock-channel" } },
      { id: { playlistId: "mock-playlist" }, snippet: { title: "Mock playlist" } }
    ] });
    if (endpoint === "videos") return jsonResponse({ items: [{
      id: "mock-video", snippet: { title: "Mock video", description: "MERN project tutorial", channelId: "mock-channel", channelTitle: "Mock channel", publishedAt: "2026-01-01T00:00:00Z", thumbnails: { high: { url: "https://mock.invalid/video.jpg" } } },
      contentDetails: { duration: "PT45M" }, statistics: { viewCount: "1000", likeCount: "100" }, status: { embeddable: true, privacyStatus: "public" }
    }] });
    if (endpoint === "channels") return jsonResponse({ items: [{
      id: "mock-channel", snippet: { title: "Mock channel" }, statistics: { subscriberCount: "100" }, contentDetails: { relatedPlaylists: { uploads: "" } }
    }] });
    return jsonResponse({ items: [] });
  };
  try {
    const results = await youtube.searchYouTubeCurationCandidates(["phase1 combined search test"], 5);
    assert.equal(requestedTypes.find((item) => item.endpoint === "search")?.type, "video,playlist");
    assert.ok(results.every((item) => item.videoId !== undefined));
  } finally {
    env.ytCombinedSearch = originalCombined;
  }
});

test("gateway retries rate limits with bounded backoff and stops after three attempts", async () => {
  quotaUnits = 0;
  quotaState = "ok";
  exhausted = false;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls < 3
      ? jsonResponse({ error: { message: "rate limited" } }, 429)
      : jsonResponse({ items: [{ id: "recovered-video" }] });
  };

  const result = await gateway.youtubeRequest("videos", { part: "snippet", id: "recovered-video" });
  assert.equal(calls, 3);
  assert.equal(result.items[0].id, "recovered-video");
  assert.equal(quotaUnits, 3, "each retry must consume quota before the provider call");
});

test("gateway caps repeated network failures at three total attempts", async () => {
  quotaUnits = 0;
  quotaState = "ok";
  exhausted = false;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  };

  await assert.rejects(
    gateway.youtubeRequest("videos", { part: "snippet", id: "unavailable-video" }),
    /fetch failed/
  );
  assert.equal(calls, 3);
  assert.equal(quotaUnits, 3);
});

test("quota counter allows no more than the remaining hard-budget units under concurrency", async () => {
  quotaUnits = 995;
  quotaState = "ok";
  exhausted = false;
  const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => quota.tryConsume(1)));
  const allowed = attempts.filter((result) => result.status === "fulfilled");
  const rejected = attempts.filter((result) => result.status === "rejected");

  assert.equal(allowed.length, 5);
  assert.equal(rejected.length, 5);
  assert.ok(rejected.every((result) => result.reason.name === "QuotaBudgetError"));
  assert.equal(quotaUnits, 1005, "rejected attempts remain counted so the counter fails closed");
  assert.equal((await quota.getState()).state, "exhausted");
});

test("quota reset TTL resolves midnight in both Pacific standard and daylight time", () => {
  assert.equal(quota.__quotaTestHooks.secondsUntilPacificReset(new Date("2026-01-01T07:59:00Z")), 60);
  assert.equal(quota.__quotaTestHooks.secondsUntilPacificReset(new Date("2026-07-01T06:59:00Z")), 60);
});
