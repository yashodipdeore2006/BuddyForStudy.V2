import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateCurationRanking, summarizeCurationEvaluation, ndcgAtK, hiddenGemRecallAtK, junkRateAtK } from "../src/services/courseCurationEvaluation.service.js";

// The curation rules are pure; set required config before loading the service module.
process.env.NODE_ENV ||= "test";
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_curation_tests";
process.env.JWT_SECRET ||= "curation-tests-only-not-a-production-secret";

const engine = await import("../src/services/courseCurationDecisionEngine.service.js");
const { getYouTubeSearchOptions, __youtubeSelectorTestUtils } = await import("../src/services/youtube.service.js");
const {
  classifyCurationIntent,
  scoreLearnerCommunityConsensus,
  blendMetadataJudgeScores,
  adjustFreshnessWithCurationFeedback,
  evaluateCurationHardGates,
  selectCurationResultSlots,
  curateNormalSearch,
  __setCurationDecisionEngineAdaptersForTests
} = engine;

function baseCandidate(overrides = {}) {
  return {
    id: "video:abc123",
    sourceType: "video",
    sourceId: "abc123",
    title: "SQL Quick Reference With Chapters",
    description: "SQL query reference, syllabus, chapters, examples and practice.",
    channelTitle: "Learning Lab",
    channelId: "channel-a",
    publishedAt: new Date().toISOString(),
    durationSeconds: 120,
    duration: "2m",
    viewCount: 1000,
    likeCount: 70,
    commentCount: 8,
    subscriberCount: 15000,
    privacyStatus: "public",
    embeddable: true,
    regionRestriction: {},
    defaultAudioLanguage: "en",
    hasChapters: true,
    chapterCount: 5,
    hasSyllabus: true,
    hasHandsOn: false,
    hasResourceLinks: false,
    isShort: false,
    queryTermStats: { relevance: 100, titleRelevance: 100 },
    ...overrides
  };
}

function slotCandidate(index, overrides = {}) {
  return {
    id: "resource-" + index,
    sourceType: "video",
    sourceId: "video-" + index,
    title: "Learning course " + index,
    description: "Course description " + index,
    thumbnail: "",
    channelTitle: "Creator " + (overrides.channelId || index),
    channelId: overrides.channelId || "channel-" + index,
    url: "https://www.youtube.com/watch?v=video-" + index,
    duration: "8h",
    durationSeconds: 8 * 3600 + index,
    durationEstimated: false,
    itemCount: 1,
    viewCount: 500 + index,
    likeCount: 50 + index,
    commentCount: 10,
    subscriberCount: 10000,
    publishedAt: new Date().toISOString(),
    finalScore: 90 - index,
    qualityScore: 80 - index,
    confidence: 0.8,
    isHiddenGem: Boolean(overrides.isHiddenGem),
    beginnerFit: 80,
    slots: [],
    features: {
      coverage: { score: 80, gapModules: [], moduleCount: 10, coverageCount: 8 },
      instruction: { score: 80, handsOnScore: 90 },
      engagement: { score: 70, likePercentile: 50, viewsPercentile: 0.25 },
      community: { score: 50, confidence: 0, explicitVotes: 0, thumbsUp: 0, status: "unavailable" },
      authority: { score: 70 },
      freshness: { score: 90 },
      fit: { score: 80 }
    },
    ...overrides
  };
}

test("YouTube curation accepts only public embeddable resources with valid IDs", () => {
  const isUsable = __youtubeSelectorTestUtils.isPublicEmbeddableCandidate;
  assert.equal(isUsable({ videoId: "public-123", privacyStatus: "public", embeddable: true }), true);
  assert.equal(isUsable({ videoId: "private-123", privacyStatus: "private", embeddable: true }), false);
  assert.equal(isUsable({ videoId: "unlisted-123", privacyStatus: "unlisted", embeddable: true }), false);
  assert.equal(isUsable({ videoId: "unknown-123", privacyStatus: "unknown", embeddable: true }), false);
  assert.equal(isUsable({ videoId: "blocked-123", privacyStatus: "public", embeddable: false }), false);
  assert.equal(isUsable({ videoId: "missing-status", embeddable: true }), false);
  assert.equal(isUsable({ videoId: "bad id", privacyStatus: "public", embeddable: true }), false);
  assert.equal(isUsable(null), false);
});

test("YouTube candidate search follows explicit requested-language intent", () => {
  assert.deepEqual(getYouTubeSearchOptions("hi", true), {
    relevanceLanguage: "hi",
    regionCode: "IN"
  });
  assert.deepEqual(getYouTubeSearchOptions("es", true), {
    relevanceLanguage: "es",
    regionCode: "ES"
  });
  assert.deepEqual(getYouTubeSearchOptions("hi", false), {
    relevanceLanguage: "en",
    regionCode: "IN"
  });
});

test("intent profile defaults to full course and parses crash, reference, level and language hints", () => {
  const normal = classifyCurationIntent("Data Analytics");
  assert.equal(normal.mode, "full_course");
  assert.equal(normal.level, "Beginner");
  assert.equal(normal.language, "en");
  assert.equal(normal.minVideoSeconds, 3 * 60 * 60);
  assert.equal(normal.minPlaylistSeconds, 5 * 60 * 60);
  assert.equal(normal.minPlaylistItems, 8);

  const crash = classifyCurationIntent("React crash course in Hindi for intermediate learners");
  assert.equal(crash.mode, "crash_course");
  assert.equal(crash.level, "Intermediate");
  assert.equal(crash.language, "hi");
  assert.equal(crash.languageExplicit, true);
  assert.equal(crash.minVideoSeconds, 60 * 60);

  const reference = classifyCurationIntent("SQL quick reference");
  assert.equal(reference.mode, "quick_reference");
  assert.equal(reference.maxVideoSeconds, 60 * 60);

  const filtered = classifyCurationIntent("Python", {
    category: "Data Science & AI",
    level: "Advanced"
  });
  assert.equal(filtered.category, "Data Science & AI");
  assert.equal(filtered.level, "Advanced");
  assert.equal(classifyCurationIntent("History of India").halfLifeDays, 3650);

  const explicitLanguage = classifyCurationIntent("Data science course", { language: "Hindi" });
  assert.equal(explicitLanguage.language, "hi");
  assert.equal(explicitLanguage.languageExplicit, true);

  const nonLatin = classifyCurationIntent("हिंदी में गणित का पूरा कोर्स");
  assert.match(nonLatin.normalizedQuery, /हिंदी/);
});

test("learner community consensus uses a Bayesian prior and bounded feedback", () => {
  const noFeedback = scoreLearnerCommunityConsensus({});
  assert.equal(noFeedback.score, 50);
  assert.equal(noFeedback.blendWeight, 0);

  const positive = scoreLearnerCommunityConsensus({ thumbsUp: 10 });
  const negative = scoreLearnerCommunityConsensus({ thumbsDown: 10 });
  assert.ok(positive.score > 50, "positive feedback should lift engagement quality");
  assert.ok(negative.score < 50, "negative feedback should lower engagement quality");
  assert.ok(positive.blendWeight <= 0.35, "learner feedback influence must remain capped");
});

test("outdated learner reports reduce freshness only through a bounded penalty", () => {
  const none = adjustFreshnessWithCurationFeedback(80, {});
  const one = adjustFreshnessWithCurationFeedback(80, { outdated: 1 });
  const several = adjustFreshnessWithCurationFeedback(80, { outdated: 100 });
  assert.equal(none, 80);
  assert.ok(one < none);
  assert.ok(several >= 60 && several < one);
});

test("quick reference permits a short ordinary video; duration alone is not a Shorts gate", () => {
  const profile = classifyCurationIntent("SQL quick reference");
  const decision = evaluateCurationHardGates(baseCandidate(), profile);
  assert.equal(decision.passed, true, decision.reason);
});

test("explicit-language searches keep relevant videos when YouTube omits audio-language metadata", () => {
  const profile = classifyCurationIntent("React course in Hindi");
  const candidate = baseCandidate({
    title: "React Complete Course in Hindi",
    description: "React course content, chapters, syllabus, and a practical project.",
    durationSeconds: 4 * 60 * 60,
    defaultAudioLanguage: "",
    queryTermStats: { relevance: 100, titleRelevance: 100 }
  });
  const decision = evaluateCurationHardGates(candidate, profile);
  assert.equal(decision.passed, true, decision.reason);
});

test("quick-reference title and syntax cues count as structure without requiring timestamps", () => {
  const profile = classifyCurationIntent("SQL quick reference");
  const candidate = baseCandidate({
    title: "SQL Quick Reference",
    description: "A concise SQL syntax reference with practical command examples.",
    durationSeconds: 20 * 60,
    hasChapters: false,
    chapterCount: 0,
    hasSyllabus: false,
    queryTermStats: { relevance: 100, titleRelevance: 100 }
  });
  const decision = evaluateCurationHardGates(candidate, profile);
  assert.equal(decision.passed, true, decision.reason);
});

test("hard gates reject short-form markers, private videos, wrong runtime and weak playlists", () => {
  const quickProfile = classifyCurationIntent("SQL quick reference");
  assert.equal(
    evaluateCurationHardGates(baseCandidate({ isShort: true }), quickProfile).reason,
    "short_form"
  );
  assert.equal(
    evaluateCurationHardGates(baseCandidate({ privacyStatus: "private" }), quickProfile).reason,
    "not_public"
  );

  const courseProfile = classifyCurationIntent("Data Analytics");
  assert.equal(
    evaluateCurationHardGates(baseCandidate({
      title: "Data Analytics Full Course",
      description: "Data Analytics syllabus and modules",
      durationSeconds: 2 * 60 * 60,
      hasChapters: true,
      chapterCount: 12
    }), courseProfile).reason,
    "runtime_outside_mode"
  );

  const playlist = {
    ...baseCandidate({
      sourceType: "playlist",
      title: "Data Analytics Complete Course Playlist",
      description: "Data Analytics syllabus, Excel, SQL and Python modules",
      durationSeconds: 6 * 60 * 60,
      itemCount: 10,
      items: [],
      hasStructure: true,
      integrity: 0.79
    })
  };
  assert.equal(evaluateCurationHardGates(playlist, courseProfile).reason, "playlist_integrity_below_80_percent");
});

test("ranking slots return the configured result limit up to the available eligible candidates", () => {
  const candidates = Array.from({ length: 36 }, (_, index) =>
    slotCandidate(index + 1, {
      channelId: "creator-" + (index + 1),
      finalScore: 99 - index,
      isHiddenGem: index === 8
    })
  );
  const results = selectCurationResultSlots(candidates, 30);
  assert.equal(results.length, 30);
  assert.equal(new Set(results.map((item) => item.id)).size, 30);
  assert.ok(results.some((item) => item.primarySlot === "Best overall"));
});

test("short-course wording does not trigger the YouTube Shorts gate", () => {
  const profile = classifyCurationIntent("SQL quick reference");
  const playlist = baseCandidate({
    id: "playlist:sql-short-course",
    sourceType: "playlist",
    sourceId: "sql-short-course",
    title: "SQL Short Course Playlist",
    description: "SQL quick reference examples, query practice, and core concepts.",
    durationSeconds: 30 * 60,
    itemCount: 3,
    hasStructure: true,
    integrity: 1,
    isShort: false,
    queryTermStats: { relevance: 100, titleRelevance: 100 }
  });
  const decision = evaluateCurationHardGates(playlist, profile);
  assert.equal(decision.passed, true, decision.reason);
});

test("curated resource attribution uses canonical YouTube URLs and rejects malformed identifiers", () => {
  const video = selectCurationResultSlots([
    slotCandidate(1, {
      sourceId: "video-123",
      url: "https://attacker.example/fake",
      videoId: "video-123",
      items: [
        { videoId: "lesson-123", title: "Lesson one", url: "https://attacker.example/lesson" },
        { videoId: "", title: "Malformed lesson" }
      ]
    })
  ])[0];
  assert.equal(video.sourceUrl, "https://www.youtube.com/watch?v=video-123");
  assert.equal(video.channelTitle, "Creator 1");
  assert.equal(video.items.length, 1);
  assert.equal(video.items[0].url, "https://www.youtube.com/watch?v=lesson-123");

  const playlist = selectCurationResultSlots([
    slotCandidate(2, {
      sourceType: "playlist",
      sourceId: "playlist_123",
      url: "https://attacker.example/playlist",
      playlistSearchUrl: "https://attacker.example/playlist"
    })
  ])[0];
  assert.equal(playlist.sourceUrl, "https://www.youtube.com/playlist?list=playlist_123");

  const malformed = selectCurationResultSlots([
    slotCandidate(3, { sourceId: "not a valid id", videoId: "", url: "javascript:alert(1)" })
  ])[0];
  assert.equal(malformed.sourceUrl, "");
});

test("ranking slots cap creators at two results and deduplicate resources", () => {
  const candidates = [
    slotCandidate(1, { channelId: "same-channel", finalScore: 96 }),
    slotCandidate(2, { channelId: "same-channel", finalScore: 93, isHiddenGem: true }),
    slotCandidate(3, { channelId: "same-channel", finalScore: 91 }),
    slotCandidate(4, { channelId: "another-channel", finalScore: 89 }),
    slotCandidate(5, { channelId: "third-channel", finalScore: 86 })
  ];
  const results = selectCurationResultSlots(candidates);
  assert.ok(results.length <= 10);
  assert.equal(new Set(results.map((item) => item.id)).size, results.length);
  const sameChannel = results.filter((item) => item.channelId === "same-channel");
  assert.ok(sameChannel.length <= 2);
  assert.ok(results.some((item) => item.primarySlot === "Best overall"));
});

test("feedback endpoint, route, and learner controls are connected", async () => {
  const controller = await readFile(new URL("../src/controllers/discovery.controller.js", import.meta.url), "utf8");
  const routes = await readFile(new URL("../src/routes/discovery.routes.js", import.meta.url), "utf8");
  const ui = await readFile(new URL("../../src/components/YouTubeSearchFallback.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/services/courseCurationDecisionEngine.service.js", import.meta.url), "utf8");

  assert.ok(controller.includes("export async function recordCurationFeedback"));
  assert.ok(controller.includes("invalidateNormalSearchCurationCache(input.query, { category: input.category, level: input.level })"));
  assert.ok(routes.includes('router.post("/curation-feedback", curationFeedbackLimiter, optionalAuthMiddleware, recordCurationFeedback)'));
  assert.ok(ui.includes('"thumbs_up"'));
  assert.ok(ui.includes('"thumbs_down"'));
  assert.ok(ui.includes('"outdated"'));
  assert.ok(ui.includes("/api/discovery/curation-feedback"));
  assert.ok(service.includes("loadLearnerFeedbackSignals"));
  assert.ok(service.includes("scoreFinalCandidates(deduplicated, profile, syllabus, feedbackSignals, metadataJudgment.byCandidateId)"));
});

test("quota exhaustion is exposed as a recoverable discovery error", async () => {
  __setCurationDecisionEngineAdaptersForTests({
    getCache: async () => null,
    setCache: async () => {},
    getSearchResultCount: async () => ({ value: 5 }),
    searchVideos: async () => { throw Object.assign(new Error("quota budget exhausted"), { name: "QuotaBudgetError" }); },
    searchPlaylists: async () => { throw Object.assign(new Error("quota budget exhausted"), { name: "QuotaBudgetError" }); },
    searchChannelPlaylists: async () => []
  });
  try {
    const result = await curateNormalSearch("React full course", {
      cacheScope: "quota-regression",
      maxQueries: 1,
      syllabus: { topic: "React", source: "injected", confidence: 1, modules: [{ name: "React foundations", weight: 1, keyConcepts: ["components"], prerequisites: [] }] }
    });
    assert.equal(result.resources.length, 0);
    assert.match(result.meta.youtubeError, /YouTube API daily quota exceeded/i);
  } finally {
    __setCurationDecisionEngineAdaptersForTests(null);
  }
});

test("cached curation results remain available without calling YouTube providers", async () => {
  let providerCalls = 0;
  const cached = {
    resources: [{ id: "cached-video", sourceType: "video", sourceId: "cached-video", title: "Cached React course", sourceUrl: "https://www.youtube.com/watch?v=cached-video" }],
    meta: { version: "cached-engine-version", poolCandidates: 1, resultsShown: 1 }
  };
  __setCurationDecisionEngineAdaptersForTests({
    getCache: async (key) => key.includes(":curated-results:") ? cached : null,
    setCache: async () => {},
    getSearchResultCount: async () => ({ value: 5 }),
    searchVideos: async () => { providerCalls += 1; throw new Error("provider must not be called for a cache hit"); },
    searchPlaylists: async () => { providerCalls += 1; throw new Error("provider must not be called for a cache hit"); }
  });
  try {
    const result = await curateNormalSearch("Cached React course", { cacheScope: "cached-result-regression" });
    assert.equal(result.resources[0].title, "Cached React course");
    assert.equal(result.meta.cacheHit, true);
    assert.equal(result.meta.resultCacheHit, true);
    assert.equal(result.meta.searchCalls, 0);
    assert.equal(providerCalls, 0);
  } finally {
    __setCurationDecisionEngineAdaptersForTests(null);
  }
});

test("golden-set evaluation computes nDCG, hidden-gem recall, junk rate and a summary", () => {
  const perfect = [
    { sourceId: "sql-course-a", evidence: { coverage: 90 } },
    { sourceId: "sql-course-b", evidence: { coverage: 70 } },
    { sourceId: "sql-course-c", evidence: { coverage: 55 } }
  ];
  const judgments = {
    topic: "SQL",
    relevanceByResourceId: {
      "sql-course-a": 3,
      "sql-course-b": 2,
      "sql-course-c": 1
    },
    hiddenGemResourceIds: ["sql-course-b"],
    junkResourceIds: ["sql-course-c"]
  };
  assert.equal(ndcgAtK(perfect.map((item) => item.sourceId), judgments.relevanceByResourceId, 3), 1);
  assert.equal(hiddenGemRecallAtK(perfect.map((item) => item.sourceId), judgments.hiddenGemResourceIds, 3), 1);
  assert.equal(junkRateAtK(perfect.map((item) => item.sourceId), judgments.junkResourceIds, 3), 1 / 3);

  const evaluation = evaluateCurationRanking(perfect, judgments, 3);
  assert.equal(evaluation.topic, "SQL");
  assert.equal(evaluation.metrics.topResultReportedCoverage, 0.9);
  assert.equal(evaluation.metrics.ndcgAtK, 1);

  const summary = summarizeCurationEvaluation([evaluation], { junkRateTarget: 0.05 });
  assert.equal(summary.evaluatedTopics, 1);
  assert.equal(summary.junkRateTargetMet, false);
});

test("ranking metrics return null rather than misleading perfect scores when no labels exist", () => {
  const ranked = ["result-a", "result-b"];
  assert.equal(ndcgAtK(ranked, {}, 10), null);
  assert.equal(hiddenGemRecallAtK(ranked, [], 10), null);
  assert.equal(junkRateAtK([], ["result-a"], 10), null);
});

test("metadata rubric blends with heuristics without overriding them or exceeding half the score", () => {
  const heuristicOnly = blendMetadataJudgeScores(40, 50, 30, null);
  assert.deepEqual(heuristicOnly, {
    coverageScore: 40,
    instructionScore: 50,
    handsOnScore: 30,
    judgeWeight: 0
  });

  const highJudge = blendMetadataJudgeScores(40, 50, 30, {
    coverageScore: 100,
    instructionScore: 100,
    handsOnScore: 100,
    confidence: 0.75
  });
  assert.ok(highJudge.coverageScore > 40);
  assert.ok(highJudge.instructionScore > 50);
  assert.ok(highJudge.handsOnScore > 30);
  assert.ok(highJudge.judgeWeight <= 0.48);
  assert.ok(highJudge.coverageScore < 100, "heuristic evidence must retain influence");
});
