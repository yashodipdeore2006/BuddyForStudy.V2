#!/usr/bin/env node
/**
 * Build with AI v2 selector comparison.
 *
 * Default mode is fully deterministic and does not contact YouTube or Gemini.
 * Opt in to live provider calls with --live. Live mode is capped at five skills.
 */

const SKILLS = [
  { id: "javascript-fundamentals", name: "JavaScript Fundamentals", topics: ["variables", "functions", "closures"], durationPolicy: { minMinutes: 30, targetMinutes: 90, maxMinutes: 180 } },
  { id: "react-components", name: "React Components", topics: ["props", "state", "composition"], durationPolicy: { minMinutes: 30, targetMinutes: 90, maxMinutes: 180 } },
  { id: "node-express", name: "Node.js and Express", topics: ["routing", "middleware", "error handling"], durationPolicy: { minMinutes: 60, targetMinutes: 180, maxMinutes: 300 } },
  { id: "mongodb-modeling", name: "MongoDB Data Modeling", topics: ["documents", "indexes", "references"], durationPolicy: { minMinutes: 30, targetMinutes: 90, maxMinutes: 180 } },
  { id: "sql-joins", name: "SQL Joins", topics: ["inner join", "left join", "aggregation"], durationPolicy: { minMinutes: 15, targetMinutes: 45, maxMinutes: 90 } },
  { id: "python-basics", name: "Python Basics", topics: ["types", "loops", "functions"], durationPolicy: { minMinutes: 30, targetMinutes: 90, maxMinutes: 180 } },
  { id: "git-workflows", name: "Git Workflows", topics: ["branching", "merging", "pull requests"], durationPolicy: { minMinutes: 15, targetMinutes: 45, maxMinutes: 90 } },
  { id: "rest-api-design", name: "REST API Design", topics: ["HTTP", "status codes", "pagination"], durationPolicy: { minMinutes: 30, targetMinutes: 90, maxMinutes: 180 } },
  { id: "typescript-types", name: "TypeScript Types", topics: ["unions", "generics", "narrowing"], durationPolicy: { minMinutes: 30, targetMinutes: 90, maxMinutes: 180 } },
  { id: "web-security", name: "Web Application Security", topics: ["authentication", "authorization", "input validation"], durationPolicy: { minMinutes: 30, targetMinutes: 120, maxMinutes: 240 } }
];

const MOCK_CANDIDATES = [
  { id: "a", title: "Complete {{skill}} Course for Beginners", durationMinutes: 90, topicCoverage: 0.85, instruction: 0.82, engagement: 0.70, authority: 0.72, freshness: 0.80 },
  { id: "b", title: "{{skill}} Full Tutorial and Practical Project", durationMinutes: 120, topicCoverage: 0.92, instruction: 0.94, engagement: 0.66, authority: 0.68, freshness: 0.91 },
  { id: "c", title: "{{skill}} Quick Tips and Tricks", durationMinutes: 12, topicCoverage: 0.35, instruction: 0.30, engagement: 0.96, authority: 0.55, freshness: 0.98 },
  { id: "d", title: "{{skill}} Deep Dive", durationMinutes: 180, topicCoverage: 0.88, instruction: 0.90, engagement: 0.74, authority: 0.83, freshness: 0.60 }
];

function oldMockSelector(skill) {
  const candidates = MOCK_CANDIDATES.map((candidate) => {
    const durationFit = candidate.durationMinutes >= skill.durationPolicy.minMinutes &&
      candidate.durationMinutes <= skill.durationPolicy.maxMinutes ? 1 : 0;
    const targetFit = 1 - Math.min(1, Math.abs(candidate.durationMinutes - skill.durationPolicy.targetMinutes) /
      Math.max(skill.durationPolicy.maxMinutes - skill.durationPolicy.minMinutes, 1));
    const score = candidate.topicCoverage * 0.30 + candidate.instruction * 0.20 +
      candidate.engagement * 0.15 + candidate.authority * 0.10 +
      candidate.freshness * 0.10 + targetFit * 0.15;
    return { ...candidate, score: Number((score * durationFit * 100).toFixed(2)) };
  }).filter((candidate) => candidate.score > 0);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function newMockSelector(skill) {
  const candidates = MOCK_CANDIDATES.map((candidate) => {
    const durationFit = candidate.durationMinutes >= skill.durationPolicy.minMinutes &&
      candidate.durationMinutes <= skill.durationPolicy.maxMinutes;
    const fit = 1 - Math.min(1, Math.abs(candidate.durationMinutes - skill.durationPolicy.targetMinutes) /
      Math.max(skill.durationPolicy.maxMinutes - skill.durationPolicy.minMinutes, 1));
    const quality = candidate.topicCoverage * 0.30 + candidate.instruction * 0.20 +
      candidate.engagement * 0.15 + candidate.authority * 0.10 +
      candidate.freshness * 0.10 + fit * 0.15;
    return { ...candidate, score: Number((quality * (durationFit ? 100 : 0)).toFixed(2)) };
  }).filter((candidate) => candidate.score > 0);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function summarize(result) {
  if (!result) return { selected: null, score: null };
  return {
    selected: result.id || result.videoId || result.playlistId || result.title || null,
    title: result.title || null,
    score: Number.isFinite(Number(result.score ?? result.finalScore)) ? Number(Number(result.score ?? result.finalScore).toFixed(2)) : null,
    cacheHit: result.meta?.cacheHit ?? null,
    searchCalls: Number(result.meta?.searchCalls || 0),
    quotaUnits: Number(result.meta?.quotaUnits || 0),
    state: result.meta?.state || null
  };
}

async function runMock() {
  // Configure safe test values before importing services. env.js skips dotenv in
  // this mode, so this path does not read a local .env file.
  process.env.BUILD_WITH_AI_SELECTOR_MOCK = "true";
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017/selector_mock_only";
  process.env.JWT_SECRET = "selector-mock-only-not-a-secret";
  process.env.YOUTUBE_API_KEY = "selector-mock-provider";
  const [youtubeModule, nodeModule, engineModule] = await Promise.all([
    import("../server/src/services/youtube.service.js"),
    import("../server/src/services/nodeCuration.service.js"),
    import("../server/src/services/courseCurationDecisionEngine.service.js")
  ]);
  const { searchBestYouTubeCourse, __setYouTubeSelectorAdaptersForTests } = youtubeModule;
  const { curateForNode, __setNodeCurationCacheForTests } = nodeModule;
  const { __setCurationDecisionEngineAdaptersForTests } = engineModule;
  let activeSkill = SKILLS[0];
  const mockVideo = (skill, index) => ({
    id: `mock-video-${skill.id}-${index}`,
    snippet: {
      title: `${skill.name} complete tutorial ${index}`,
      description: `Learn ${skill.topics.join(", ")} with examples, projects, practice and course content.`,
      tags: skill.topics,
      channelId: `mock-channel-${index}`,
      channelTitle: `Mock Academy ${index}`,
      publishedAt: "2025-01-01T00:00:00Z",
      thumbnails: { high: { url: "https://example.invalid/mock.jpg" } }
    },
    contentDetails: { duration: `PT${Math.max(1, Math.round(skill.durationPolicy.targetMinutes + (index ? Math.min(15, (skill.durationPolicy.maxMinutes - skill.durationPolicy.targetMinutes) / 2) : 0)))}M` },
    statistics: { viewCount: String(100000 + index * 10000), likeCount: String(5000 + index * 100) },
    status: { embeddable: true, privacyStatus: "public" }
  });
  const mockVideos = () => [mockVideo(activeSkill, 0), mockVideo(activeSkill, 1)];
  const mockCurationCandidates = () => mockVideos().map((video, index) => ({
    videoId: video.id,
    title: video.snippet.title,
    description: `${video.snippet.description} Full course tutorial. Course content: ${activeSkill.topics.join(", ")}. 00:00 Introduction 05:00 ${activeSkill.topics[0]} 15:00 ${activeSkill.topics[1]} 25:00 ${activeSkill.topics[2]}.`,
    tags: video.snippet.tags,
    channelId: video.snippet.channelId,
    channelTitle: video.snippet.channelTitle,
    publishedAt: video.snippet.publishedAt,
    durationSeconds: Number(video.contentDetails.duration.match(/PT(\d+)M/)?.[1] || 0) * 60,
    viewCount: Number(video.statistics.viewCount),
    likeCount: Number(video.statistics.likeCount),
    thumbnail: video.snippet.thumbnails.high.url,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    privacyStatus: "public", embeddable: true, isShort: false, hasChapters: true,
    hasSyllabus: true, defaultAudioLanguage: "en", regionRestriction: {}
  }));
  __setYouTubeSelectorAdaptersForTests({
    searchVideos: async () => ({ items: mockVideos().map((video) => ({ id: { videoId: video.id }, snippet: video.snippet })) }),
    getVideoDetails: async () => mockVideos(),
    getChannelDetails: async () => [0, 1].map((i) => ({ id: `mock-channel-${i}`, statistics: { subscriberCount: String(10000 + i * 1000) } }))
  });
  __setNodeCurationCacheForTests({ read: async () => null, write: async () => {} });
  __setCurationDecisionEngineAdaptersForTests({
    getCache: async () => null,
    setCache: async () => {},
    getSearchResultCount: async () => 30,
    searchVideos: async () => mockCurationCandidates(),
    searchPlaylists: async () => [],
    searchChannelPlaylists: async () => [],
    getPlaylistCourse: async () => null,
    loadLearnerFeedback: async () => new Map(),
    evaluateMetadata: async () => ({ byCandidateId: new Map(), source: "deterministic-test-fixture", judgedCount: 0 })
  });
  const rows = [];
  try {
    for (const skill of SKILLS) {
      activeSkill = skill;
      const searchPolicy = {
        minDurationMinutes: skill.durationPolicy.minMinutes,
        maxDurationMinutes: skill.durationPolicy.maxMinutes,
        excludeShorts: true, requireEmbeddable: true, requiredTopics: skill.topics
      };
      const oldResult = await searchBestYouTubeCourse({
        skill: skill.name, searchQueries: [`${skill.name} full course tutorial`],
        searchPolicy, maxResultsPerQuery: 10
      });
      const newResult = await curateForNode({
        skill: { ...skill, canonicalSkillId: skill.id, searchQueries: [`${skill.name} practical tutorial`] },
        profile: { topic: skill.name, level: "Beginner", language: "en" },
        durationPolicy: skill.durationPolicy
      });
      const oldSummary = summarize(oldResult);
      const newSummary = summarize({ ...newResult.best, meta: newResult.meta });
      rows.push({ skill: skill.name, oldSelector: oldSummary, newSelector: newSummary,
        sameSelectedFixture: Boolean(oldSummary.selected && oldSummary.selected === newSummary.selected) });
    }
  } finally {
    __setYouTubeSelectorAdaptersForTests(null);
    __setCurationDecisionEngineAdaptersForTests(null);
    __setNodeCurationCacheForTests(null);
  }
  const validRows = rows.length === SKILLS.length && rows.every((row) => row.oldSelector?.selected && row.newSelector?.selected);
  console.log("Mode: MOCK (deterministic provider/dependency fixtures; real selector decision and ranking pipelines exercised)");
  console.table(rows.map((row) => ({ skill: row.skill, oldPick: row.oldSelector.title || "none",
    newPick: row.newSelector.title || "none", samePick: row.sameSelectedFixture })));
  console.log(JSON.stringify({
    mode: "mock",
    comparisonValid: validRows,
    selectorAgreement: validRows ? `${rows.filter((row) => row.sameSelectedFixture).length}/${rows.length}` : null,
    skillsExercised: rows.length,
    reason: validRows ? "Both selectors ran against deterministic fixtures. This compares selector outcomes without contacting YouTube or Gemini." : "One or more selectors returned no selection; inspect row-level results before treating this run as acceptance evidence.",
    rows
  }, null, 2));
  if (!validRows) process.exitCode = 2;
}
async function runLive() {
  const [{ searchBestYouTubeCourse }, { curateForNode }, { getState }] = await Promise.all([
    import("../server/src/services/youtube.service.js"),
    import("../server/src/services/nodeCuration.service.js"),
    import("../server/src/services/quota.service.js")
  ]);
  const selectedSkills = SKILLS.slice(0, 5);
  console.log(`Mode: LIVE (hard cap: ${selectedSkills.length}/5 skills)`);
  const before = await getState();
  console.log("Quota counter before:", JSON.stringify(before));
  const rows = [];
  for (const skill of selectedSkills) {
    const legacy = await searchBestYouTubeCourse({
      skill: skill.name,
      searchQueries: [`${skill.name} full course tutorial`, `${skill.name} practical project`],
      searchPolicy: {
        minDurationMinutes: skill.durationPolicy.minMinutes,
        maxDurationMinutes: skill.durationPolicy.maxMinutes,
        excludeShorts: true,
        requireEmbeddable: true,
        requiredTopics: skill.topics
      },
      maxResultsPerQuery: 10
    }).catch((error) => ({ error: error?.message || String(error) }));
    const current = await curateForNode({
      skill: { ...skill, canonicalSkillId: skill.id, searchQueries: [`${skill.name} practical tutorial`] },
      profile: { topic: skill.name, level: "Beginner", language: "en" },
      durationPolicy: skill.durationPolicy
    }).catch((error) => ({ error: error?.message || String(error) }));
    rows.push({ skill: skill.name, oldSelector: summarize(legacy), newSelector: summarize(current) });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  const after = await getState();
  console.log("Quota counter after:", JSON.stringify(after));
  console.log(JSON.stringify({ mode: "live", skills: rows.length, rows, quotaBefore: before, quotaAfter: after }, null, 2));
}

if (process.argv.includes("--live")) await runLive();
else await runMock();
