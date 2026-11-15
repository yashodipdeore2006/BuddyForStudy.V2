import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateCurationRanking, summarizeCurationEvaluation, ndcgAtK, hiddenGemRecallAtK, junkRateAtK } from "../src/services/courseCurationEvaluation.service.js";

// The curation rules are pure; set required config before loading the service module.
process.env.NODE_ENV ||= "test";
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_curation_tests";
process.env.JWT_SECRET ||= "curation-tests-only-not-a-production-secret";

const engine = await import("../src/services/courseCurationDecisionEngine.service.js");
const nodeCuration = await import("../src/services/nodeCuration.service.js");
const { getYouTubeSearchOptions, __youtubeSelectorTestUtils } = await import("../src/services/youtube.service.js");
const {
  classifyCurationIntent,
  scoreLearnerCommunityConsensus,
  blendMetadataJudgeScores,
  adjustFreshnessWithCurationFeedback,
  evaluateCurationHardGates,
  selectCurationResultSlots,
  curateNormalSearch,
  computePlaylistStats,
  __setCurationDecisionEngineAdaptersForTests
} = engine;

test("playlist eligibility count reflects playable lessons rather than advertised entries", () => {
  const lessons = Array.from({ length: 8 }, (_, index) => ({
    videoId: "playlist-video-" + index,
    title: "Python course lesson " + (index + 1),
    description: "Python lesson covering practical concepts",
    durationSeconds: 40 * 60,
    privacyStatus: "public",
    embeddable: true,
    isShort: false,
    defaultAudioLanguage: "en"
  }));
  lessons[7] = { ...lessons[7], isShort: true, title: "Python quick tip #Shorts" };
  const candidate = { title: "Python complete course", itemCount: 8 };
  const enriched = computePlaylistStats(candidate, {
    totalItemCount: 8,
    observedItemCount: 8,
    lessons
  }, 8);

  assert.equal(enriched.totalItemCount, 8, "retain the advertised count for diagnostics");
  assert.equal(enriched.itemCount, 7, "only playable long-form lessons count toward eligibility");
  assert.equal(enriched.items.length, 7);
  assert.equal(enriched.integrity, 7 / 8);
  assert.equal(enriched.durationSeconds, 7 * 40 * 60);
});

test("playlist runtime estimates add only unobserved entries, not filtered lessons", () => {
  const lessons = Array.from({ length: 8 }, (_, index) => ({
    videoId: "runtime-video-" + index,
    title: "Python course lesson " + (index + 1),
    description: "Python lesson covering practical concepts",
    durationSeconds: 30 * 60,
    privacyStatus: "public",
    embeddable: true,
    isShort: false
  }));
  lessons[7] = { ...lessons[7], privacyStatus: "private" };
  const enriched = computePlaylistStats({ title: "Python complete course" }, {
    totalItemCount: 10,
    observedItemCount: 8,
    lessons
  }, 10);

  assert.equal(enriched.itemCount, 7);
  assert.equal(enriched.durationEstimated, true);
  assert.equal(enriched.durationSeconds, 9 * 30 * 60,
    "seven valid observed lessons plus two unobserved lessons; exclude the observed private lesson");
});

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
  assert.equal(crash.minVideoSeconds, 20 * 60);

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

test("normal full-course intent enforces the complete-course video and playlist minimums", () => {
  const profile = classifyCurationIntent("Python");
  assert.equal(profile.minVideoSeconds, 3 * 60 * 60);
  assert.equal(profile.minPlaylistSeconds, 5 * 60 * 60);
  assert.equal(profile.minPlaylistItems, 8);

  const shortVideo = baseCandidate({
    title: "Python Complete Course With Chapters",
    description: "Python complete course syllabus, chapters, examples and practice.",
    durationSeconds: 2 * 60 * 60,
    hasChapters: true,
    chapterCount: 12
  });
  assert.equal(evaluateCurationHardGates(shortVideo, profile).reason, "runtime_outside_mode");

  const qualifyingVideo = {
    ...shortVideo,
    durationSeconds: 3 * 60 * 60
  };
  assert.equal(evaluateCurationHardGates(qualifyingVideo, profile).passed, true);

  const playlistBase = {
    ...baseCandidate({
      id: "playlist:python-complete",
      sourceType: "playlist",
      sourceId: "python-complete",
      title: "Python Complete Course Playlist",
      description: "Python syllabus and sequential lessons.",
      durationSeconds: 5 * 60 * 60,
      itemCount: 8,
      hasStructure: true,
      integrity: 1
    })
  };
  assert.equal(evaluateCurationHardGates({
    ...playlistBase,
    durationSeconds: 4 * 60 * 60
  }, profile).reason, "runtime_below_mode_minimum");
  assert.equal(evaluateCurationHardGates(playlistBase, profile).passed, true);
  assert.equal(evaluateCurationHardGates({
    ...playlistBase,
    itemCount: 7
  }, profile).reason, "too_few_playlist_items");
});

test("quick reference permits a short ordinary video; duration alone is not a Shorts gate", () => {
  const profile = classifyCurationIntent("SQL quick reference");
  const decision = evaluateCurationHardGates(baseCandidate(), profile);
  assert.equal(decision.passed, true, decision.reason);
});

test("explicit-language searches reject videos with unknown spoken-audio metadata", () => {
  const profile = classifyCurationIntent("React course in Hindi");
  const candidate = baseCandidate({
    title: "React Complete Course in Hindi",
    description: "React course content, chapters, syllabus, and a practical project.",
    durationSeconds: 4 * 60 * 60,
    defaultAudioLanguage: "",
    queryTermStats: { relevance: 100, titleRelevance: 100 }
  });
  const decision = evaluateCurationHardGates(candidate, profile);
  assert.equal(decision.passed, false);
  assert.equal(decision.reason, "language_mismatch");
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
      durationSeconds: 20 * 60,
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

test("normal search enriches playlist runtime before applying the full-course duration gate", async () => {
  const playlistId = "PLdsaCourse123";
  const lessonTitles = [
    "Arrays and Array Traversal",
    "Linked Lists and Operations",
    "Stacks and Queue Implementations",
    "Trees and Binary Search Trees",
    "Graph Traversal with BFS and DFS",
    "Sorting Algorithms and Complexity",
    "Searching Algorithms and Optimization",
    "Hash Tables and Collision Handling",
    "Dynamic Programming Fundamentals",
    "Greedy Algorithms and Problem Solving"
  ];
  const lessons = lessonTitles.map((title, index) => ({
    videoId: "dsa-lesson-" + String(index + 1).padStart(2, "0"),
    title,
    description: "Data structures and algorithms lesson covering " + title + ".",
    channelTitle: "DSA Academy",
    channelId: "dsa-academy",
    thumbnail: "",
    publishedAt: new Date().toISOString(),
    defaultAudioLanguage: "en",
    durationSeconds: 40 * 60,
    viewCount: 10000 + index,
    likeCount: 500 + index,
    commentCount: 20 + index,
    subscriberCount: 50000,
    privacyStatus: "public",
    embeddable: true,
    regionRestriction: {},
    isShort: false
  }));
  const playlist = {
    playlistId,
    title: "Data Structures and Algorithms Complete Course",
    description: "A complete data structures and algorithms course organized into sequential lessons.",
    channelTitle: "DSA Academy",
    channelId: "dsa-academy",
    publishedAt: new Date().toISOString(),
    itemCount: lessons.length,
    thumbnail: "",
    url: "https://www.youtube.com/playlist?list=" + playlistId
  };

  __setCurationDecisionEngineAdaptersForTests({
    getCache: async () => null,
    setCache: async () => {},
    getSearchResultCount: async () => ({ value: 5 }),
    searchVideos: async () => [],
    searchPlaylists: async () => [playlist],
    searchChannelPlaylists: async () => [],
    getPlaylistCourse: async () => ({
      playlistId,
      title: playlist.title,
      description: playlist.description,
      channelTitle: playlist.channelTitle,
      channelId: playlist.channelId,
      thumbnail: "",
      itemCount: lessons.length,
      totalItemCount: lessons.length,
      observedItemCount: lessons.length,
      lessons
    }),
    loadLearnerFeedback: async () => new Map(),
    evaluateMetadata: async () => ({
      byCandidateId: new Map(),
      source: "test-fixture",
      judgedCount: 0
    })
  });

  try {
    const result = await curateNormalSearch("Data Structures and Algorithms", {
      cacheScope: "normal-search-playlist-runtime-regression",
      maxQueries: 1,
      syllabus: {
        topic: "Data Structures and Algorithms",
        source: "injected",
        confidence: 1,
        modules: [{
          name: "Arrays",
          weight: 1,
          keyConcepts: ["arrays", "array traversal"],
          prerequisites: []
        }]
      }
    });

    assert.equal(result.meta.playlistsFetched, 1);
    assert.equal(result.meta.tierCEligible, 1);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].sourceType, "playlist");
    assert.equal(result.resources[0].itemCount, lessons.length);
    assert.equal(result.resources[0].durationSeconds, lessons.length * 40 * 60);
  } finally {
    __setCurationDecisionEngineAdaptersForTests(null);
  }
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

test("lesson-level curation accepts focused videos without full-course structure metadata", () => {
  const profile = classifyCurationIntent("Business Metrics and Data Storytelling KPIs tutorial", {
    level: "Beginner"
  });
  profile.nodeType = "lesson";
  profile.mode = "quick_reference";
  profile.minVideoSeconds = 60;
  const candidate = baseCandidate({
    title: "Business Metrics and KPIs Explained for Beginners",
    description: "Learn business questions, key performance indicators, metric definitions and practical examples.",
    durationSeconds: 420,
    hasChapters: false,
    chapterCount: 0,
    hasSyllabus: false,
    hasHandsOn: false,
    queryTermStats: { relevance: 35, titleRelevance: 15 }
  });
  const decision = evaluateCurationHardGates(candidate, profile);
  assert.equal(decision.passed, true, decision.reason);
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
  const ui = await readFile(new URL("../../client/src/components/YouTubeSearchFallback.tsx", import.meta.url), "utf8");
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


test("forced lesson refresh bypasses cached empty results and candidate pools", async () => {
  let videoSearchCalls = 0;
  const cacheReads = [];
  const cacheWrites = [];
  __setCurationDecisionEngineAdaptersForTests({
    getCache: async (key) => {
      cacheReads.push(key);
      if (key.includes(":curated-results:") || key.includes(":candidate-search:")) {
        return key.includes(":curated-results:")
          ? { resources: [], meta: { poolCandidates: 0, resultsShown: 0 } }
          : { videos: [], playlists: [], youtubeError: "", cachedAt: new Date().toISOString() };
      }
      return null;
    },
    setCache: async (key, kind, payload) => cacheWrites.push({ key, kind, payload }),
    getSearchResultCount: async () => ({ value: 5 }),
    searchVideos: async () => { videoSearchCalls += 1; return []; },
    searchPlaylists: async () => [],
    searchChannelPlaylists: async () => []
  });
  try {
    const result = await curateNormalSearch("Machine Learning Engineer Deep Learning Fundamentals", {
      nodeType: "lesson",
      forceRefresh: true,
      cacheScope: "forced-empty-cache-regression",
      maxQueries: 1,
      syllabus: {
        topic: "Machine Learning Engineer",
        source: "injected",
        confidence: 1,
        modules: [{ name: "Deep Learning Fundamentals", weight: 1, keyConcepts: ["neural networks"], prerequisites: [] }]
      }
    });
    assert.equal(result.resources.length, 0);
    assert.equal(videoSearchCalls, 1, "forced refresh must contact the video provider");
    assert.equal(cacheReads.some((key) => key.includes(":curated-results:")), false);
    assert.equal(cacheReads.some((key) => key.includes(":candidate-search:")), false);
    assert.equal(cacheWrites.some((entry) => entry.kind === "candidate-search" && !entry.payload.videos?.length && !entry.payload.playlists?.length), false);
    assert.equal(cacheWrites.some((entry) => entry.kind === "curated-results" && !entry.payload.resources?.length), false);
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

test("lesson-level relevance rejects generic resources with only weak description overlap", () => {
  const profile = classifyCurationIntent("React Hooks", { level: "Beginner" });
  profile.nodeType = "lesson";
  profile.mode = "quick_reference";
  profile.minVideoSeconds = 60;
  const candidate = baseCandidate({
    title: "Complete JavaScript Course for Beginners",
    description: "A broad introduction to frontend development.",
    durationSeconds: 900,
    hasChapters: false,
    hasSyllabus: false,
    queryTermStats: {
      termCount: 2,
      titleMatchCount: 0,
      allMatchCount: 1,
      titleRelevance: 0,
      relevance: 50
    }
  });

  const decision = evaluateCurationHardGates(candidate, profile);
  assert.equal(decision.passed, false);
  assert.equal(decision.reason, "query_mismatch");
});

test("lesson-level relevance accepts a direct title match or strong multi-term metadata match", () => {
  const profile = classifyCurationIntent("React Hooks", { level: "Beginner" });
  profile.nodeType = "lesson";
  profile.mode = "quick_reference";
  profile.minVideoSeconds = 60;

  const titleMatch = baseCandidate({
    title: "React Hooks: useState and useEffect Explained",
    durationSeconds: 900,
    hasChapters: false,
    hasSyllabus: false,
    queryTermStats: {
      termCount: 2,
      titleMatchCount: 1,
      allMatchCount: 1,
      titleRelevance: 50,
      relevance: 50
    }
  });
  assert.equal(evaluateCurationHardGates(titleMatch, profile).passed, true);

  const metadataMatch = baseCandidate({
    title: "Managing Component State in Modern Frontend Apps",
    description: "A focused tutorial covering React hooks, useState, useEffect, and custom hook patterns.",
    durationSeconds: 900,
    hasChapters: false,
    hasSyllabus: false,
    queryTermStats: {
      termCount: 4,
      titleMatchCount: 0,
      allMatchCount: 3,
      titleRelevance: 0,
      relevance: 75
    }
  });
  assert.equal(evaluateCurationHardGates(metadataMatch, profile).passed, true);
});

test("lesson-level playlists are rejected when most playable lessons do not match the skill", () => {
  const profile = classifyCurationIntent("React Hooks", { level: "Beginner" });
  profile.nodeType = "lesson";
  profile.mode = "quick_reference";
  profile.minPlaylistSeconds = 60;
  profile.minPlaylistItems = 4;

  const candidate = baseCandidate({
    id: "playlist:react-hooks",
    sourceType: "playlist",
    sourceId: "react-hooks",
    title: "Complete React Hooks Course",
    description: "A comprehensive React Hooks tutorial and course.",
    durationSeconds: 8 * 60 * 60,
    itemCount: 8,
    integrity: 1,
    hasStructure: true,
    items: [
      { title: "Introduction to React Hooks" },
      { title: "useState Hook Explained" },
      { title: "useEffect Hook Explained" },
      { title: "Custom Hooks in React" },
      { title: "JavaScript Variables and Data Types" },
      { title: "CSS Flexbox Complete Guide" },
      { title: "HTML Forms and Inputs" },
      { title: "Git and GitHub Basics" }
    ],
    queryTermStats: { termCount: 2, titleMatchCount: 2, allMatchCount: 2, titleRelevance: 100, relevance: 100 }
  });

  const decision = evaluateCurationHardGates(candidate, profile);
  assert.equal(decision.passed, false);
  assert.equal(decision.reason, "playlist_lesson_relevance_below_50_percent");
});

test("lesson-level playlists pass when at least half of playable lessons match the skill", () => {
  const profile = classifyCurationIntent("React Hooks", { level: "Beginner" });
  profile.nodeType = "lesson";
  profile.mode = "quick_reference";
  profile.minPlaylistSeconds = 60;
  profile.minPlaylistItems = 4;

  const candidate = baseCandidate({
    id: "playlist:react-hooks-focused",
    sourceType: "playlist",
    sourceId: "react-hooks-focused",
    title: "React Hooks Tutorial Series",
    description: "Learn React Hooks through focused lessons.",
    durationSeconds: 8 * 60 * 60,
    itemCount: 8,
    integrity: 1,
    hasStructure: true,
    items: [
      { title: "React Hooks Introduction" },
      { title: "useState Hook Explained" },
      { title: "useEffect Hook Explained" },
      { title: "Custom Hooks in React" },
      { title: "Rules of React Hooks" },
      { title: "useMemo and useCallback Hooks" },
      { title: "Context API with React Hooks" },
      { title: "Testing React Hook Components" }
    ],
    queryTermStats: { termCount: 2, titleMatchCount: 2, allMatchCount: 2, titleRelevance: 100, relevance: 100 }
  });

  assert.equal(evaluateCurationHardGates(candidate, profile).passed, true);
});

test("node curation cache keys change when a skill's topics or search context changes", () => {
  const { nodeCacheKey } = nodeCuration.__nodeCurationTestHooks;
  const base = {
    canonicalSkillId: "react-hooks",
    mode: "quick_reference",
    level: "Beginner",
    language: "en",
    boundsHash: "duration-policy",
    cacheScope: "learner-context"
  };
  const original = nodeCacheKey({ ...base, skillContextHash: "topics-useState-useEffect" });
  const changedTopics = nodeCacheKey({ ...base, skillContextHash: "topics-custom-hooks" });
  const changedQueries = nodeCacheKey({ ...base, skillContextHash: "queries-react-hooks-patterns" });
  const unchanged = nodeCacheKey({ ...base, skillContextHash: "topics-useState-useEffect" });

  assert.notEqual(original, changedTopics, "updated topic mappings must not reuse stale node resources");
  assert.notEqual(original, changedQueries, "updated search intent must not reuse stale node resources");
  assert.equal(original, unchanged, "identical skill context should remain cache-stable");
});

