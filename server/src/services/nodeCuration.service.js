import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { CourseCurationCache } from "../models/CourseCurationCache.js";
import { curateNormalSearch, extractCurationChapters } from "./courseCurationDecisionEngine.service.js";
import { withYouTubeRequestMetrics } from "./youtubeRequestMetrics.js";
import { QuotaBudgetError } from "./quota.service.js";

const ENGINE_VERSION = "node-curation-v1";
const LOW_CONFIDENCE_THRESHOLD = 45;
let selectorForNode = curateNormalSearch;
const GENERIC_SKILL = /\b(basics|fundamentals|introduction|overview|intermediate|advanced|projects)\b/i;

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}+#.]+/gu, " ").trim().replace(/\s+/g, " ");
}
function durationBounds(durationPolicy = {}) {
  const minMinutes = Math.max(1, Number(durationPolicy.minMinutes) || 30);
  const targetMinutes = Math.max(minMinutes, Number(durationPolicy.targetMinutes) || minMinutes);
  const maxMinutes = Math.max(targetMinutes, Number(durationPolicy.maxMinutes) || targetMinutes);
  const mode = targetMinutes >= 180 ? "full_course" : targetMinutes >= 60 ? "crash_course" : "quick_reference";
  return {
    mode,
    minVideoSeconds: minMinutes * 60,
    maxVideoSeconds: maxMinutes * 60,
    minPlaylistSeconds: minMinutes * 60,
    minPlaylistItems: 2,
    halfLifeDays: Number(durationPolicy.halfLifeDays) > 0 ? Number(durationPolicy.halfLifeDays) : undefined
  };
}
function buildInjectedSyllabus(skill) {
  const topics = [...new Set((Array.isArray(skill.topics) ? skill.topics : []).map((topic) => String(topic || "").trim()).filter(Boolean))];
  const names = topics.length ? topics : [String(skill.name || "Skill").trim()];
  return {
    topic: String(skill.name || names[0] || "Skill"),
    aliases: [],
    source: "roadmap-skill",
    confidence: 1,
    modules: names.slice(0, 15).map((name) => ({ name, weight: 1, keyConcepts: [name], prerequisites: [] }))
  };
}
function nodeCacheKey({ canonicalSkillId, mode, level, language, boundsHash }) {
  return `node:${ENGINE_VERSION}:${digest([canonicalSkillId, mode, level, language, boundsHash].join("|"))}`;
}
async function readNodeCache(key) {
  try {
    const cached = await CourseCurationCache.findOne({ key, kind: "node", expiresAt: { $gt: new Date() } }).lean();
    return cached?.payload || null;
  } catch {
    return null;
  }
}
async function writeNodeCache(key, payload) {
  const expiresAt = new Date(Date.now() + env.nodeCacheTtlDays * 24 * 60 * 60 * 1000);
  try {
    await CourseCurationCache.updateOne({ key }, { $set: { kind: "node", payload, expiresAt } }, { upsert: true });
  } catch (error) {
    console.warn("Node curation cache persistence unavailable", { message: error?.message || String(error) });
  }
}
function scoreOf(resource) {
  return Number(resource?.finalScore ?? resource?.score ?? resource?.qualityScore ?? 0);
}
function mapResource(resource, reason = "Selected by shared course curation engine") {
  if (!resource) return null;
  const item = resource.items?.[0] || {};
  const videoId = resource.videoId || item.videoId || (String(resource.id || "").startsWith("video:") ? String(resource.id).slice(6) : "");
  const playlistId = resource.playlistId || (String(resource.id || "").startsWith("playlist:") ? String(resource.id).slice(9) : "");
  const chapters = extractCurationChapters(resource.description || item.description || "");
  return {
    videoId,
    playlistId,
    title: String(resource.title || item.title || ""),
    channelTitle: String(resource.channelTitle || item.channelTitle || ""),
    durationSeconds: Math.max(0, Number(resource.durationSeconds || item.durationSeconds) || 0),
    thumbnail: String(resource.thumbnail || item.thumbnail || ""),
    chapters: chapters.map((chapter) => ({ title: chapter.title, timestampSeconds: chapter.timestampSeconds, timestampLabel: chapter.timestampLabel })),
    fetchedAt: new Date(),
    reason,
    url: resource.sourceUrl || resource.url || item.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""),
    score: scoreOf(resource)
  };
}

export async function curateForNode({ skill, profile = {}, durationPolicy = {} }) {
  const skillName = String(skill?.name || "").trim();
  if (skillName.length < 2) return { best: null, alternatives: [], meta: { cacheHit: false, searchCalls: 0, quotaUnits: 0, lowConfidence: true, state: "failed" } };
  const canonicalSkillId = String(skill.canonicalSkillId || skill.id || normalized(skillName).replace(/\s+/g, "-")).slice(0, 160);
  const query = GENERIC_SKILL.test(skillName) && profile.topic
    ? `${String(profile.topic).trim()} ${skillName}`
    : skillName;
  const extraQueries = (Array.isArray(skill.searchQueries) ? skill.searchQueries : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 2);
  const syllabus = buildInjectedSyllabus(skill);
  const bounds = durationBounds(durationPolicy);
  const level = ["Beginner", "Intermediate", "Advanced"].includes(profile.level) ? profile.level : "Beginner";
  const language = String(profile.language || "en").slice(0, 10);
  const boundsHash = digest(JSON.stringify(bounds));
  const key = nodeCacheKey({ canonicalSkillId, mode: bounds.mode, level, language, boundsHash });
  const cached = await readNodeCache(key);
  if (cached) return { ...cached, meta: { ...cached.meta, cacheHit: true, searchCalls: 0, quotaUnits: 0 } };

  const callSelector = async (overrides) => selectorForNode(query, {
    level,
    language,
    syllabus,
    overrides,
    maxQueries: 8,
    extraQueries,
    cacheScope: `node:${canonicalSkillId}`,
    skillId: canonicalSkillId
  });
  const requestMetrics = { requestId: `node:${canonicalSkillId}`, skillId: canonicalSkillId, searchCalls: 0, quotaUnits: 0 };
  let searchCalls = 0;
  let quotaUnits = 0;
  let result;
  let widened = false;
  try {
    result = await withYouTubeRequestMetrics(requestMetrics, () => callSelector(bounds));
    searchCalls = Number(result?.meta?.searchCalls ?? requestMetrics.searchCalls ?? 0);
    quotaUnits = Number(result?.meta?.quotaUnits ?? requestMetrics.quotaUnits ?? 0);
    let resources = Array.isArray(result?.resources) ? result.resources : [];
    if (!resources.length) {
      widened = true;
      const widenedBounds = {
        ...bounds,
        minVideoSeconds: Math.floor(bounds.minVideoSeconds * 0.5),
        maxVideoSeconds: Math.ceil(bounds.maxVideoSeconds * 1.5),
        minPlaylistSeconds: Math.floor(bounds.minPlaylistSeconds * 0.5)
      };
      result = await withYouTubeRequestMetrics(requestMetrics, () => callSelector(widenedBounds));
      searchCalls += Number(result?.meta?.searchCalls ?? requestMetrics.searchCalls ?? 0);
      quotaUnits += Number(result?.meta?.quotaUnits ?? requestMetrics.quotaUnits ?? 0);
      resources = Array.isArray(result?.resources) ? result.resources : [];
    }
    const ranked = resources.map((resource) => ({ raw: resource, score: scoreOf(resource) })).sort((a, b) => b.score - a.score);
    const best = mapResource(ranked[0]?.raw, widened ? "Selected after widening duration bounds" : "Selected by shared course curation engine");
    const alternatives = ranked.slice(1, 3).map(({ raw }) => mapResource(raw, "Alternative from shared course curation engine")).filter(Boolean);
    const output = {
      best,
      alternatives,
      meta: {
        cacheHit: Boolean(result?.meta?.resultCacheHit || result?.meta?.cacheHit),
        searchCalls,
        quotaUnits,
        lowConfidence: !best || scoreOf(ranked[0]?.raw) < LOW_CONFIDENCE_THRESHOLD,
        state: best ? (scoreOf(ranked[0]?.raw) < LOW_CONFIDENCE_THRESHOLD ? "low_confidence" : "ready") : "failed",
        widenedBounds: widened
      }
    };
    await writeNodeCache(key, output);
    return output;
  } catch (error) {
    if (error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") {
      return { best: null, alternatives: [], meta: { cacheHit: false, searchCalls, quotaUnits, lowConfidence: true, state: "queued", quotaState: error.state } };
    }
    throw error;
  }
}

export function __setNodeCurationSelectorForTests(selector = null) { selectorForNode = selector || curateNormalSearch; }

export const __nodeCurationTestHooks = Object.freeze({
  buildInjectedSyllabus,
  durationBounds,
  nodeCacheKey,
  scoreOf,
  GENERIC_SKILL
});
