#!/usr/bin/env node
/**
 * Build with AI v2 selector comparison.
 *
 * Default mode is fully deterministic and does not contact YouTube or Gemini.
 * Opt in to live provider calls with --live. Live mode is capped at five skills.
 */
import { searchBestYouTubeCourse } from "../server/src/services/youtube.service.js";
import { curateForNode } from "../server/src/services/nodeCuration.service.js";
import { getState } from "../server/src/services/quota.service.js";

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
  console.log("Mode: MOCK (no provider/network calls)");
  console.log("Note: mock mode compares deterministic selector-contract fixtures; it does not measure live selector quality.");
  const rows = SKILLS.map((skill) => {
    const oldResult = oldMockSelector(skill);
    const newResult = newMockSelector(skill);
    return {
      skill: skill.name,
      oldSelector: summarize(oldResult),
      newSelector: summarize(newResult),
      sameSelectedFixture: oldResult?.id === newResult?.id
    };
  });
  console.table(rows.map((row) => ({
    skill: row.skill,
    oldPick: row.oldSelector.title || "none",
    oldScore: row.oldSelector.score,
    newPick: row.newSelector.title || "none",
    newScore: row.newSelector.score,
    samePick: row.sameSelectedFixture
  })));
  const agreement = rows.filter((row) => row.sameSelectedFixture).length;
  console.log(JSON.stringify({ mode: "mock", skills: rows.length, selectorAgreement: agreement, rows }, null, 2));
}

async function runLive() {
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
