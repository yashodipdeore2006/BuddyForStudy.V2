import { createHash, randomUUID } from "node:crypto";
import { CourseCurationFeedback } from "../models/CourseCurationFeedback.js";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { CourseCurationCache } from "../models/CourseCurationCache.js";
import { cacheGet, cacheSet, cacheDelete } from "../config/cache.js";
import { searchYouTubeCurationCandidates, getYouTubeSearchOptions } from "./youtube.service.js";
import { withYouTubeRequestMetrics } from "./youtubeRequestMetrics.js";
import { searchStructuredPlaylists, searchChannelCoursePlaylists, getPlaylistCourse } from "./discovery.service.js";

const ENGINE_VERSION = "course-curation-decision-engine-v1.7";
const FINAL_RESULT_COUNT = 10;
const SYLLABUS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMPTY_RESULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_QUERIES = 8;
const memoryCache = new Map();
const aiClient = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

const SIGNAL_WEIGHTS = {
  coverage: 0.30,
  instruction: 0.20,
  engagement: 0.15,
  authority: 0.10,
  community: 0.10,
  freshness: 0.10,
  fit: 0.05
};

const syllabusSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    aliases: { type: "array", items: { type: "string" } },
    modules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          weight: { type: "number" },
          keyConcepts: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } }
        },
        required: ["name", "weight", "keyConcepts", "prerequisites"]
      }
    }
  },
  required: ["topic", "aliases", "modules"]
};

const metadataJudgeSchema = {
  type: "object",
  properties: {
    evaluations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidateId: { type: "string" },
          coverageScore: { type: "number" },
          instructionScore: { type: "number" },
          handsOnScore: { type: "number" },
          confidence: { type: "number" },
          supportedModuleNames: { type: "array", items: { type: "string" } },
          likelyGapModuleNames: { type: "array", items: { type: "string" } },
          rationale: { type: "string" }
        },
        required: [
          "candidateId",
          "coverageScore",
          "instructionScore",
          "handsOnScore",
          "confidence",
          "supportedModuleNames",
          "likelyGapModuleNames",
          "rationale"
        ]
      }
    }
  },
  required: ["evaluations"]
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
function normalizeText(value) {
  // Preserve Unicode letters and numbers so non-Latin learner queries remain searchable.
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}+#.]+/gu, " ").trim().replace(/\s+/g, " ");
}
function tokens(value) {
  return [...new Set(normalizeText(value).split(" ").filter((term) => term.length > 1))];
}
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function cacheKey(kind, value) {
  return "curation:" + ENGINE_VERSION + ":" + kind + ":" + digest(normalizeText(value));
}
function median(values) {
  const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 50;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function percentile(values, value) {
  const all = (values || []).filter(Number.isFinite);
  if (!all.length) return 0.5;
  return all.filter((item) => item <= value).length / all.length;
}
function logMetric(value) {
  return Math.log10(Math.max(0, Number(value) || 0) + 1);
}
function medianDate(values) {
  const dates = (values || []).map((v) => new Date(v || 0).getTime()).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return dates.length ? new Date(dates[Math.floor(dates.length / 2)]) : null;
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return minutes ? hours + "h " + minutes + "m" : hours + "h";
  return Math.max(1, minutes) + "m";
}
function readMemory(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.payload;
}
function trimMemoryCache() {
  if (memoryCache.size <= 5000) return;
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= Date.now()) memoryCache.delete(key);
  }
  while (memoryCache.size > 4000) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    memoryCache.delete(oldestKey);
  }
}
async function getCachedValue(key) {
  const local = readMemory(key);
  if (local !== null) return local;
  try {
    const redisValue = await cacheGet("bfs:" + key);
    if (redisValue !== null && redisValue !== undefined) return redisValue;
  } catch {}
  try {
    const found = await CourseCurationCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    if (found?.payload !== undefined) {
      memoryCache.set(key, { payload: found.payload, expiresAt: new Date(found.expiresAt).getTime() });
      return found.payload;
    }
  } catch {}
  return null;
}
async function setCachedValue(key, kind, payload, ttlMs) {
  const expiresAt = new Date(Date.now() + ttlMs);
  trimMemoryCache();
  memoryCache.set(key, { payload, expiresAt: expiresAt.getTime() });
  try {
    await cacheSet("bfs:" + key, payload, Math.max(1, Math.floor(ttlMs / 1000)));
  } catch {}
  try {
    await CourseCurationCache.updateOne(
      { key },
      { $set: { kind, payload, expiresAt } },
      { upsert: true }
    );
  } catch (error) {
    console.warn("Curation cache persistence unavailable", { kind, message: error?.message || error });
  }
}
function languageFromQuery(query, requestedLanguage = "") {
  const codes = {
    english: "en", en: "en", hindi: "hi", hi: "hi", spanish: "es", es: "es",
    french: "fr", fr: "fr", german: "de", de: "de", portuguese: "pt", pt: "pt",
    japanese: "ja", ja: "ja", korean: "ko", ko: "ko", arabic: "ar", ar: "ar",
    bengali: "bn", bn: "bn", marathi: "mr", mr: "mr", tamil: "ta", ta: "ta",
    telugu: "te", te: "te"
  };
  const requested = normalizeText(requestedLanguage).replace(/\s+/g, "");
  if (requested && codes[requested]) return { code: codes[requested], explicit: true };
  const match = normalizeText(query).match(/\b(?:in|spoken in|taught in|language)\s+(english|hindi|spanish|french|german|portuguese|japanese|korean|arabic|bengali|marathi|tamil|telugu)\b/);
  if (!match) return { code: "en", explicit: false };
  return { code: codes[match[1]] || "en", explicit: true };
}
function halfLifeForTopic(query) {
  const q = normalizeText(query);
  if (/\b(ai|artificial intelligence|llm|generative ai|machine learning|deep learning|react|nextjs|next js|nestjs|node js|framework|library)\b/.test(q)) return 450;
  if (/\b(cloud|aws|azure|gcp|kubernetes|docker|devops|cybersecurity|cyber security)\b/.test(q)) return 730;
  if (/\b(python|javascript|java|typescript|programming|coding|web development|mobile development)\b/.test(q)) return 1095;
  if (/\b(sql|statistics|math|mathematics|algebra|calculus|physics|chemistry|history|literature|language|grammar|philosophy|art|music|photography|painting|cooking|writing)\b/.test(q)) return 3650;
  return 3650;
}
export function classifyCurationIntent(query, options = {}) {
  const original = String(query || "").trim();
  const normalized = normalizeText(original);
  const mode = /\b(cheat sheet|quick reference|syntax reference|command reference|quick answer|definition of|meaning of)\b/.test(normalized)
    ? "quick_reference"
    : /\b(crash course|crash-course|short course|fast overview|quick overview|concept explainer)\b/.test(normalized)
      ? "crash_course"
      : "full_course";
  const requestedLevel = String(options.level || "").trim().toLowerCase();
  const inferredLevel = /\b(advanced|expert|deep dive|mastery)\b/.test(normalized)
    ? "Advanced"
    : /\b(intermediate|some experience|beyond basics)\b/.test(normalized)
      ? "Intermediate"
      : "Beginner";
  const level = ({ beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" })[requestedLevel] || inferredLevel;
  const category = String(options.category || "").trim();
  const language = languageFromQuery(original, options.language);
  return {
    query: original,
    normalizedQuery: normalized,
    mode,
    level,
    category,
    language: language.code,
    languageExplicit: language.explicit,
    halfLifeDays: halfLifeForTopic(normalized),
    targetRuntimeSeconds: mode === "quick_reference" ? 30 * 60 : mode === "crash_course" ? 3 * 3600 : 20 * 3600,
    minVideoSeconds: mode === "quick_reference" ? 0 : mode === "crash_course" ? 60 * 60 : 3 * 3600,
    maxVideoSeconds: mode === "quick_reference" ? 60 * 60 : mode === "crash_course" ? 5 * 3600 : Number.MAX_SAFE_INTEGER,
    minPlaylistSeconds: mode === "quick_reference" ? 0 : mode === "crash_course" ? 60 * 60 : 5 * 3600,
    minPlaylistItems: mode === "full_course" ? 8 : mode === "crash_course" ? 2 : 1
  };
}
function fallbackSyllabus(topic) {
  return {
    topic,
    aliases: [],
    source: "rules-fallback",
    confidence: 0.22,
    modules: [
      { name: "Foundations and vocabulary", weight: 0.14, keyConcepts: ["foundations", "terminology", "definitions", "fundamentals"], prerequisites: [] },
      { name: "Core concepts and principles", weight: 0.16, keyConcepts: ["principles", "core concepts", "theory", "models"], prerequisites: ["Foundations and vocabulary"] },
      { name: "Tools and working methods", weight: 0.12, keyConcepts: ["tools", "workflow", "materials", "setup"], prerequisites: ["Core concepts and principles"] },
      { name: "Essential techniques", weight: 0.14, keyConcepts: ["techniques", "methods", "process", "approach"], prerequisites: ["Core concepts and principles"] },
      { name: "Guided examples and practice", weight: 0.12, keyConcepts: ["examples", "practice", "exercises", "worked example"], prerequisites: ["Essential techniques"] },
      { name: "Problem solving and analysis", weight: 0.11, keyConcepts: ["problem solving", "analysis", "troubleshooting", "reasoning"], prerequisites: ["Guided examples and practice"] },
      { name: "Applied work or case studies", weight: 0.12, keyConcepts: ["project", "case study", "application", "real world"], prerequisites: ["Problem solving and analysis"] },
      { name: "Evaluation and best practices", weight: 0.09, keyConcepts: ["evaluation", "best practices", "quality", "review"], prerequisites: ["Applied work or case studies"] }
    ]
  };
}
function normalizeSyllabus(raw, topic) {
  const list = Array.isArray(raw?.modules) ? raw.modules.slice(0, 15) : [];
  const modules = list.map((item, index) => ({
    name: String(item?.name || "Module " + (index + 1)).trim(),
    weight: Math.max(0.01, Number(item?.weight) || 1),
    keyConcepts: [...new Set((Array.isArray(item?.keyConcepts) ? item.keyConcepts : []).map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 12),
    prerequisites: (Array.isArray(item?.prerequisites) ? item.prerequisites : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8)
  })).filter((item) => item.name && item.keyConcepts.length);
  if (modules.length < 5) return fallbackSyllabus(topic);
  const total = modules.reduce((sum, item) => sum + item.weight, 0) || 1;
  return {
    topic: String(raw.topic || topic).trim(),
    aliases: [...new Set((Array.isArray(raw.aliases) ? raw.aliases : []).map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 12),
    source: "gemini-syllabus",
    confidence: 0.9,
    modules: modules.map((item) => ({ ...item, weight: item.weight / total }))
  };
}
async function getTopicSyllabus(profile) {
  const key = cacheKey("syllabus", profile.normalizedQuery);
  const cached = await getCachedValue(key);
  if (cached) return cached;
  let syllabus;
  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: env.geminiModel,
        contents: [
          "Create a course-neutral master syllabus for the subject below. This must work for academic, professional, creative, personal, health/wellness, language, trade, and technical domains. Do not assume programming or technology.",
          "Return 8 to 15 ordered modules, each with 3-8 concrete key concepts, a relative weight, and prerequisites. Weights should represent importance. Include practice, application, and ways to evaluate progress where appropriate. Do not invent specific certifications or claims.",
          "Provide common topic aliases that learners may use.",
          "Subject: " + profile.query
        ].join("\n"),
        config: {
          responseMimeType: "application/json",
          responseSchema: syllabusSchema,
          thinkingConfig: { thinkingLevel: "LOW" },
          maxOutputTokens: 6000
        }
      });
      syllabus = normalizeSyllabus(JSON.parse(response.text), profile.query);
    } catch (error) {
      console.warn("Curation syllabus generation fell back to rules", { query: profile.normalizedQuery, message: error?.message || error });
      syllabus = fallbackSyllabus(profile.query);
    }
  } else {
    syllabus = fallbackSyllabus(profile.query);
  }
  await setCachedValue(key, "syllabus", syllabus, syllabus.source === "gemini-syllabus" ? SYLLABUS_TTL_MS : 6 * 60 * 60 * 1000);
  return syllabus;
}

async function evaluateCandidatesWithMetadataRubric(candidates, profile, syllabus) {
  if (!aiClient || !candidates.length) {
    return { byCandidateId: new Map(), source: aiClient ? "not-needed" : "not-configured", judgedCount: 0 };
  }

  const selected = [...candidates]
    .sort((a, b) => Number(b.preliminaryScore || 0) - Number(a.preliminaryScore || 0))
    .slice(0, 15);
  if (!selected.length) return { byCandidateId: new Map(), source: "not-needed", judgedCount: 0 };

  const moduleBrief = (syllabus.modules || []).map((item) => ({
    name: item.name,
    weight: item.weight,
    keyConcepts: (item.keyConcepts || []).slice(0, 8),
    prerequisites: (item.prerequisites || []).slice(0, 4)
  }));
  const candidateBrief = selected.map((candidate) => ({
    candidateId: String(candidate.id),
    type: candidate.sourceType,
    title: String(candidate.title || "").slice(0, 300),
    description: String(candidate.description || "").slice(0, 1600),
    totalRuntimeSeconds: Number(candidate.durationSeconds || 0),
    itemCount: Number(candidate.itemCount || 1),
    advertisedChapters: Boolean(candidate.hasChapters),
    advertisedSyllabus: Boolean(candidate.hasSyllabus),
    handsOnCues: Boolean(candidate.hasHandsOn),
    resourceLinksDetected: Boolean(candidate.hasResourceLinks),
    lessons: (candidate.items || []).slice(0, 12).map((item) => ({
      title: String(item.title || "").slice(0, 220),
      description: String(item.description || "").slice(0, 240)
    }))
  }));
  const cacheKeyValue = "curation:" + ENGINE_VERSION + ":candidate-evaluation:" +
    digest(JSON.stringify({
      query: profile.normalizedQuery,
      mode: profile.mode,
      level: profile.level,
      syllabus: moduleBrief,
      candidates: candidateBrief
    }));
  const cached = await getCachedValue(cacheKeyValue);
  if (Array.isArray(cached?.evaluations)) {
    return {
      byCandidateId: new Map(cached.evaluations.map((item) => [item.candidateId, item])),
      source: "cached-gemini-metadata-rubric",
      judgedCount: cached.evaluations.length
    };
  }

  try {
    const response = await aiClient.models.generateContent({
      model: env.geminiModel,
      contents: [
        "You are the Tier C metadata rubric judge in a learning-resource curation system.",
        "Review the syllabus and candidate metadata below. The system does NOT provide video transcripts, so you must NOT claim to have watched the videos, checked factual correctness, inspected demonstrations, verified prerequisite teaching, or confirmed actual syllabus coverage.",
        "Only score how strongly the supplied titles, descriptions, playlist lesson titles, timestamps/syllabus cues and resource indicators SUPPORT the advertised syllabus coverage and instructional structure. Penalize vague descriptions, missing lesson ordering, and unsupported promises. When metadata is thin, lower confidence and avoid optimistic scores.",
        "Scores are 0-100. Confidence must be between 0.2 and 0.75 because the evidence is metadata-only. supportedModuleNames and likelyGapModuleNames must exactly reuse names from the supplied syllabus. Rationale must explicitly describe evidence as metadata/outline evidence, not verified video content.",
        "This evaluation may refine scoring but must never override the hard gates already passed by each candidate.",
        "Intent: " + JSON.stringify({ topic: profile.query, mode: profile.mode, level: profile.level }),
        "Syllabus JSON: " + JSON.stringify(moduleBrief),
        "Candidate metadata JSON: " + JSON.stringify(candidateBrief)
      ].join("\n"),
      config: {
        responseMimeType: "application/json",
        responseSchema: metadataJudgeSchema,
        thinkingConfig: { thinkingLevel: "LOW" },
        maxOutputTokens: 4500
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    const allowedIds = new Set(selected.map((candidate) => String(candidate.id)));
    const allowedModules = new Map((syllabus.modules || []).map((module) => [normalizeText(module.name), module.name]));
    const evaluations = [...new Map((Array.isArray(parsed.evaluations) ? parsed.evaluations : [])
      .filter((item) => allowedIds.has(String(item.candidateId || "")))
      .map((item) => {
        const supportedModuleNames = [...new Set((Array.isArray(item.supportedModuleNames) ? item.supportedModuleNames : [])
          .map((name) => allowedModules.get(normalizeText(name)))
          .filter(Boolean))].slice(0, 15);
        const likelyGapModuleNames = [...new Set((Array.isArray(item.likelyGapModuleNames) ? item.likelyGapModuleNames : [])
          .map((name) => allowedModules.get(normalizeText(name)))
          .filter(Boolean))].slice(0, 15);
        return [String(item.candidateId), {
          candidateId: String(item.candidateId),
          coverageScore: clamp(item.coverageScore),
          instructionScore: clamp(item.instructionScore),
          handsOnScore: clamp(item.handsOnScore),
          confidence: Math.max(0.2, Math.min(0.75, Number(item.confidence) || 0.35)),
          supportedModuleNames,
          likelyGapModuleNames,
          rationale: String(item.rationale || "Metadata-only rubric assessment; video content was not verified.").slice(0, 360)
        }];
      })).values()];
    await setCachedValue(cacheKeyValue, "candidate-evaluation", { evaluations }, RESULT_TTL_MS);
    return {
      byCandidateId: new Map(evaluations.map((item) => [item.candidateId, item])),
      source: evaluations.length ? "gemini-metadata-rubric" : "gemini-empty-evaluation",
      judgedCount: evaluations.length
    };
  } catch (error) {
    console.warn("Curation metadata rubric evaluation unavailable", {
      query: profile.normalizedQuery,
      message: error?.message || error
    });
    return { byCandidateId: new Map(), source: "failed-fallback-to-metadata-heuristics", judgedCount: 0 };
  }
}

function buildCandidateQueries(profile, syllabus) {
  const baseTopic = profile.query.trim();
  const topic = [profile.category, baseTopic].filter(Boolean).join(" ");
  const year = new Date().getFullYear();
  const modules = [...(syllabus.modules || [])].sort((a, b) => b.weight - a.weight).slice(0, 2);
  const queries = [
    topic + " full course",
    topic + " bootcamp course",
    topic + " complete course for beginners",
    topic + " course chapters syllabus",
    topic + " course " + year,
    ...modules.map((item) => topic + " " + item.name + " tutorial")
  ];
  const aliases = (syllabus.aliases || []).slice(0, 1);
  if (aliases.length && queries.length < 8) queries.push(aliases[0] + " full course");
  return [...new Set(queries.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}
function queryTermStats(query, candidate) {
  const queryTerms = tokens(query);
  const title = normalizeText(candidate.title);
  const supportingMetadata = [
    candidate.description,
    ...(Array.isArray(candidate.tags) ? candidate.tags : []),
    ...(Array.isArray(candidate.items) ? candidate.items.flatMap((item) => [item.title, item.description]) : [])
  ].join(" ");
  const body = normalizeText(supportingMetadata);
  const full = title + " " + body;
  const matchedTitle = queryTerms.filter((term) => title.includes(term)).length;
  const matchedAll = queryTerms.filter((term) => full.includes(term)).length;
  return {
    termCount: queryTerms.length,
    titleMatchCount: matchedTitle,
    allMatchCount: matchedAll,
    titleRelevance: queryTerms.length ? matchedTitle / queryTerms.length * 100 : 50,
    relevance: queryTerms.length ? matchedAll / queryTerms.length * 100 : 50
  };
}
function isExplicitUpdate(text) {
  return /\b(updated|revised|latest edition|version 20\d\d|updated for 20\d\d|refreshed)\b/i.test(String(text || ""));
}
function isNegativeIntent(candidate, profile) {
  const text = normalizeText(candidate.title + " " + candidate.description);
  const query = normalizeText(profile.query);
  const negative = /\b(trailer|promo|promotional|reaction|reacts to|podcast|vlog|news coverage|news roundup|interview)\b/;
  if (negative.test(text) && !/\b(podcast|interview|news|reaction)\b/.test(query)) return true;
  if (/\broadmap\b/.test(text) && !/\broadmap\b/.test(query) && !/\bfull course\b/.test(text)) return true;
  const minutesClaim = String(candidate.title || "").match(/\bin\s+(\d+)\s+minutes?\b/i);
  if (minutesClaim && Number(minutesClaim[1]) * 60 < Number(candidate.durationSeconds || 0) * 0.65) return true;
  if (/\bget rich|guaranteed job|earn \$?\d[\d,]* per month|make money fast\b/i.test(text)) return true;
  return false;
}
function candidateText(candidate) {
  const items = Array.isArray(candidate.items) ? candidate.items : [];
  const lessonText = items.map((item) => [item.title, item.description].join(" ")).join(" ");
  return normalizeText([candidate.title, candidate.description, ...(candidate.tags || []), lessonText, candidate.channelTitle].join(" "));
}
function syllabusCoverage(candidate, syllabus) {
  const text = candidateText(candidate);
  const modules = syllabus.modules || [];
  let totalWeight = modules.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) || 1;
  let coveredWeight = 0;
  const covered = [];
  const gaps = [];
  for (const module of modules) {
    const concepts = [module.name, ...(module.keyConcepts || [])].map(normalizeText).filter((x) => x.length > 2);
    const matches = concepts.filter((concept) => {
      if (text.includes(concept)) return true;
      const words = tokens(concept);
      return words.length > 1 && words.filter((word) => text.includes(word)).length / words.length >= 0.75;
    });
    const moduleCovered = matches.length > 0;
    if (moduleCovered) {
      coveredWeight += Number(module.weight) || 0;
      covered.push(module.name);
    } else {
      gaps.push(module.name);
    }
  }
  const chapterBonus = candidate.hasChapters ? 5 : 0;
  const result = clamp((coveredWeight / totalWeight) * 100 + chapterBonus);
  return { score: result, coveredModules: covered, gapModules: gaps, coverageCount: covered.length, moduleCount: modules.length };
}
function freshnessScore(candidate, profile) {
  const published = new Date(candidate.publishedAt || 0).getTime();
  if (!published || !Number.isFinite(published)) return { score: 50, ageDays: null, stale: false, confidence: 0.4 };
  const ageDays = Math.max(0, (Date.now() - published) / 86400000);
  const updated = isExplicitUpdate(candidate.description + " " + candidate.title);
  const adjustedAge = updated ? ageDays * 0.5 : ageDays;
  return {
    score: clamp(100 * Math.pow(0.5, adjustedAge / Math.max(30, profile.halfLifeDays))),
    ageDays,
    stale: ageDays > profile.halfLifeDays * 2 && !updated,
    confidence: updated || candidate.publishedAt ? 0.95 : 0.4
  };
}
function hasSyllabusEvidence(candidate) {
  const lessonMetadata = (Array.isArray(candidate.items) ? candidate.items : [])
    .flatMap((item) => [item.title, item.description])
    .join(" ");
  const searchableMetadata = [
    candidate.title,
    candidate.description,
    lessonMetadata
  ].join(" ");
  return Boolean(candidate.hasSyllabus || /\b(what you(?:'|’)ll learn|course content|curriculum|syllabus|topics covered|learning objectives|course outline|contents|quick reference|syntax reference|command reference|cheat sheet|full course|complete course|crash course|tutorial|step by step|walkthrough|lesson plan)\b/i.test(searchableMetadata));
}
function hasStructureEvidence(candidate) {
  if (candidate.sourceType === "playlist" || candidate.sourceType === "series") {
    const items = Array.isArray(candidate.items) ? candidate.items : [];
    const numbered = items.filter((item) => /\b(?:part|episode|lesson|lecture|chapter)\s*#?\s*\d+\b|\[\s*\d+\s*\/\s*\d+\s*\]/i.test(item.title || "")).length;
    return numbered >= 3 || hasSyllabusEvidence(candidate) || candidate.hasChapters;
  }
  return Boolean(candidate.hasChapters || hasSyllabusEvidence(candidate));
}
function languageAllowed(candidate, profile) {
  const expected = String(profile.language || "en").toLowerCase();
  if (Array.isArray(candidate.items) && candidate.items.length) {
    const declared = candidate.items.map((item) => String(item.defaultAudioLanguage || "").toLowerCase()).filter(Boolean);
    if (declared.length) {
      const matching = declared.filter((language) => language === expected || language.startsWith(expected + "-")).length;
      return matching / declared.length >= 0.8;
    }
    // Search API language/region settings are used upstream. When per-video
    // language metadata is absent, do not falsely reject a relevant resource.
    return true;
  }
  const actual = String(candidate.defaultAudioLanguage || "").toLowerCase();
  if (!actual) return true;
  return actual === expected || actual.startsWith(expected + "-");
}
function passesHardGates(candidate, profile) {
  if (!candidate || !candidate.title) return { passed: false, reason: "missing_metadata" };
  if (candidate.isShort || /\/shorts\//i.test(String(candidate.url || candidate.sourceUrl || ""))) return { passed: false, reason: "short_form" };
  if (candidate.privacyStatus !== "public") return { passed: false, reason: "not_public" };
  if (candidate.embeddable === false) return { passed: false, reason: "not_embeddable" };
  const region = candidate.regionRestriction || {};
  if (Array.isArray(region.blocked) && region.blocked.includes("IN")) return { passed: false, reason: "region_blocked" };
  if (Array.isArray(region.allowed) && region.allowed.length && !region.allowed.includes("IN")) return { passed: false, reason: "region_blocked" };
  if (!languageAllowed(candidate, profile)) return { passed: false, reason: "language_mismatch" };
  if (isNegativeIntent(candidate, profile)) return { passed: false, reason: "negative_intent" };
  const runtime = Number(candidate.durationSeconds || 0);
  if (candidate.sourceType === "playlist") {
    if (Number(candidate.itemCount || 0) < profile.minPlaylistItems) return { passed: false, reason: "too_few_playlist_items" };
    if (runtime < profile.minPlaylistSeconds) return { passed: false, reason: "runtime_below_mode_minimum" };
    if (Number(candidate.integrity || 0) < 0.8) return { passed: false, reason: "playlist_integrity_below_80_percent" };
    if (!candidate.hasStructure) return { passed: false, reason: "no_structure_evidence" };
  } else {
    if (runtime < profile.minVideoSeconds || runtime > profile.maxVideoSeconds) return { passed: false, reason: "runtime_outside_mode" };
    if (!hasStructureEvidence(candidate)) return { passed: false, reason: "no_structure_evidence" };
  }
  const relevance = candidate.queryTermStats?.relevance ?? queryTermStats(profile.query, candidate).relevance;
  const titleRelevance = candidate.queryTermStats?.titleRelevance ?? queryTermStats(profile.query, candidate).titleRelevance;
  if (relevance < 40 && titleRelevance < 20) return { passed: false, reason: "query_mismatch" };
  const freshness = freshnessScore(candidate, profile);
  if (freshness.stale) return { passed: false, reason: "obsolete_without_update_note" };
  return { passed: true, reason: "" };
}
export function evaluateCurationHardGates(candidate, profile) {
  return passesHardGates(candidate, profile);
}

function durationFit(candidate, profile) {
  const seconds = Math.max(0, Number(candidate.durationSeconds) || 0);
  const hours = seconds / 3600;
  let runtimeScore;
  if (profile.mode === "quick_reference") {
    runtimeScore = clamp(100 - hours * 60);
  } else if (profile.mode === "crash_course") {
    runtimeScore = clamp(100 - Math.abs(hours - 3) * 35);
  } else if (hours < 6) {
    runtimeScore = clamp(50 + hours * 6);
  } else if (hours <= 40) {
    runtimeScore = 94 + Math.min(6, (hours - 6) / 34 * 6);
  } else {
    runtimeScore = 96;
  }
  const levelText = normalizeText(candidate.title + " " + candidate.description);
  let levelScore = 60;
  if (profile.level === "Beginner") {
    if (/\b(beginner|beginners|fundamentals|from scratch|introduction|introductory|basics)\b/.test(levelText)) levelScore = 100;
    else if (/\b(advanced|expert|masterclass|deep dive)\b/.test(levelText)) levelScore = 30;
  } else if (profile.level === "Intermediate") {
    if (/\b(intermediate|practical|hands on|applied)\b/.test(levelText)) levelScore = 90;
    else if (/\b(absolute beginner|from scratch)\b/.test(levelText)) levelScore = 55;
  } else if (/\b(advanced|expert|deep dive|masterclass|professional)\b/.test(levelText)) {
    levelScore = 100;
  }
  return clamp(runtimeScore * 0.65 + levelScore * 0.35);
}
function preliminaryScore(candidate, profile) {
  const relevance = candidate.queryTermStats || queryTermStats(profile.query, candidate);
  const structure = candidate.sourceType === "playlist"
    ? clamp(40 + Math.min(60, Number(candidate.itemCount || 0) / 60 * 60))
    : clamp((candidate.chapterCount || 0) * 8 + (candidate.hasSyllabus ? 30 : 0) + (candidate.hasHandsOn ? 10 : 0));
  const freshness = freshnessScore(candidate, profile).score;
  const depth = candidate.sourceType === "playlist"
    ? clamp(Math.log10(Number(candidate.itemCount || 0) + 1) / Math.log10(301) * 100)
    : clamp((Number(candidate.durationSeconds || 0) / 3600) * 3);
  return clamp(relevance.relevance * 0.5 + relevance.titleRelevance * 0.15 + structure * 0.15 + depth * 0.15 + freshness * 0.05);
}
function partMarker(title) {
  const match = String(title || "").match(/\b(?:part|pt|episode|ep|lesson|lecture)\s*#?\s*(\d{1,3})\b/i)
    || String(title || "").match(/\[\s*(\d{1,3})\s*\/\s*\d{1,3}\s*\]/);
  if (!match) return null;
  const number = Number(match[1] || match[0].match(/\d+/)?.[0]);
  const base = normalizeText(String(title || "").replace(match[0], " ").replace(/\b(full course|complete course|tutorial series)\b/ig, " "));
  if (!base || !Number.isFinite(number)) return null;
  return { number, base };
}
function assemblePartSeries(videos, profile) {
  const groups = new Map();
  for (const video of videos) {
    const marker = partMarker(video.title);
    if (!marker || !video.channelId) continue;
    const key = video.channelId + ":" + marker.base;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ video, marker });
  }
  const consumed = new Set();
  const series = [];
  for (const group of groups.values()) {
    const unique = [...new Map(group.map((entry) => [entry.video.videoId, entry])).values()].sort((a, b) => a.marker.number - b.marker.number);
    if (unique.length < 2) continue;
    let sequencePairs = 0;
    for (let i = 1; i < unique.length; i++) if (unique[i].marker.number - unique[i - 1].marker.number === 1) sequencePairs += 1;
    if (!sequencePairs) continue;
    const items = unique.slice(0, 12).map((entry, index) => ({ ...entry.video, order: index + 1, partNumber: entry.marker.number }));
    const ids = items.map((item) => item.videoId);
    ids.forEach((id) => consumed.add(id));
    const first = items[0];
    const runtime = items.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
    const latestPublished = items.map((item) => item.publishedAt).filter(Boolean).sort().at(-1) || first.publishedAt;
    const description = items.map((item) => item.description).filter(Boolean).join("\n").slice(0, 6000);
    series.push({
      ...first,
      id: "series:" + ids.join(","),
      sourceType: "series",
      sourceId: ids.join(","),
      title: unique[0].marker.base.replace(/\b\w/g, (letter) => letter.toUpperCase()),
      description,
      items,
      itemCount: items.length,
      durationSeconds: runtime,
      duration: formatDuration(runtime),
      publishedAt: latestPublished,
      isShort: false,
      privacyStatus: items.every((item) => item.privacyStatus === "public") ? "public" : first.privacyStatus,
      embeddable: items.every((item) => item.embeddable !== false),
      hasChapters: items.some((item) => item.hasChapters),
      chapterCount: items.reduce((sum, item) => sum + Number(item.chapterCount || 0), 0),
      hasSyllabus: items.some((item) => item.hasSyllabus),
      hasHandsOn: items.some((item) => item.hasHandsOn),
      hasResourceLinks: items.some((item) => item.hasResourceLinks),
      viewCount: Math.round(items.reduce((sum, item) => sum + Number(item.viewCount || 0), 0) / items.length),
      likeCount: Math.round(items.reduce((sum, item) => sum + Number(item.likeCount || 0), 0) / items.length),
      commentCount: Math.round(items.reduce((sum, item) => sum + Number(item.commentCount || 0), 0) / items.length),
      subscriberCount: first.subscriberCount,
      matchedSearchQueries: [...new Set(items.flatMap((item) => item.matchedSearchQueries || []))],
      searchMatchCount: Math.max(...items.map((item) => Number(item.searchMatchCount || 1))),
      channelSeriesShare: 1,
      durationEstimated: false,
      descriptionStructure: true
    });
  }
  return {
    series,
    singles: videos.filter((video) => !consumed.has(video.videoId))
  };
}
function playlistCandidate(playlist, profile) {
  const candidate = {
    id: "playlist:" + playlist.playlistId,
    sourceType: "playlist",
    sourceId: playlist.playlistId,
    title: playlist.title,
    description: playlist.description || "",
    thumbnail: playlist.thumbnail || "",
    channelTitle: playlist.channelTitle || "",
    channelId: playlist.channelId || "",
    publishedAt: playlist.publishedAt || null,
    itemCount: Number(playlist.itemCount || 0),
    durationSeconds: 0,
    duration: "",
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    subscriberCount: 0,
    privacyStatus: "public",
    embeddable: true,
    integrity: 0,
    items: [],
    isShort: false,
    playlistSearchScore: Number(playlist.score || 0),
    playlistSearchUrl: playlist.url || ("https://www.youtube.com/playlist?list=" + playlist.playlistId),
    queryTermStats: queryTermStats(profile.query, playlist)
  };
  return candidate;
}
function computePlaylistStats(candidate, playlistDetail, originalCount) {
  const rawLessons = Array.isArray(playlistDetail?.lessons) ? playlistDetail.lessons : [];
  const totalCount = Math.max(0, Number(playlistDetail?.totalItemCount || originalCount || rawLessons.length));
  const observedCount = Math.max(0, Math.min(totalCount || rawLessons.length, Number(playlistDetail?.observedItemCount || rawLessons.length)));
  const validLessons = rawLessons.filter((item) =>
    item.videoId &&
    item.embeddable !== false &&
    item.privacyStatus === "public" &&
    !item.isShort
  );
  const integrity = observedCount ? validLessons.length / observedCount : 0;
  const observedRuntime = validLessons.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
  const averageRuntime = validLessons.length ? observedRuntime / validLessons.length : 0;
  const runtimeEstimated = totalCount > observedCount && averageRuntime > 0;
  const runtimeSeconds = runtimeEstimated ? averageRuntime * totalCount : observedRuntime;
  const orderedTitles = validLessons.map((item) => String(item.title || ""));
  const numberedCount = orderedTitles.filter((title) => /\b(?:part|episode|lesson|lecture|chapter)\s*#?\s*\d+\b|\[\s*\d+\s*\/\s*\d+\s*\]/i.test(title)).length;
  const lessonText = validLessons.map((item) => item.title + " " + (item.description || "")).join(" ");
  const hasSyllabus = hasSyllabusEvidence(candidate) || /\b(what you(?:'|’)ll learn|course contents|modules|curriculum|syllabus|chapters covered)\b/i.test(lessonText);
  candidate.title = playlistDetail?.title || candidate.title;
  candidate.description = playlistDetail?.description || candidate.description;
  candidate.thumbnail = playlistDetail?.thumbnail || candidate.thumbnail;
  candidate.channelTitle = playlistDetail?.channelTitle || candidate.channelTitle;
  candidate.itemCount = Number(totalCount || playlistDetail?.itemCount || validLessons.length);
  candidate.items = validLessons;
  candidate.observedItemCount = observedCount;
  candidate.integrity = integrity;
  candidate.integrityEstimated = totalCount > observedCount;
  candidate.durationSeconds = runtimeSeconds;
  candidate.duration = formatDuration(runtimeSeconds);
  candidate.durationEstimated = runtimeEstimated;
  candidate.hasSyllabus = hasSyllabus;
  candidate.hasChapters = numberedCount >= 3;
  candidate.chapterCount = numberedCount;
  candidate.hasHandsOn = validLessons.some((item) => /\b(project|hands[- ]on|practice|dataset|exercise|lab|build|demo|workshop|assignment|capstone)\b/i.test(item.title + " " + item.description));
  candidate.hasResourceLinks = validLessons.some((item) => /https?:\/\//i.test(item.description || ""));
  candidate.embeddable = integrity >= 0.8;
  candidate.privacyStatus = "public";
  const languages = validLessons.map((item) => String(item.defaultAudioLanguage || "").toLowerCase()).filter(Boolean);
  candidate.languageEvidenceCount = languages.length;
  candidate.languageMatches = languages.filter((language) => language === "en" || language.startsWith("en-")).length;
  // Never label a playlist English merely because language metadata exists.
  candidate.defaultAudioLanguage = "";
  candidate.publishedAt = medianDate(validLessons.map((item) => item.publishedAt)) || candidate.publishedAt;
  candidate.viewCount = Math.round(validLessons.reduce((sum, item) => sum + Number(item.viewCount || 0), 0) / Math.max(1, validLessons.length));
  candidate.likeCount = Math.round(validLessons.reduce((sum, item) => sum + Number(item.likeCount || 0), 0) / Math.max(1, validLessons.length));
  candidate.commentCount = Math.round(validLessons.reduce((sum, item) => sum + Number(item.commentCount || 0), 0) / Math.max(1, validLessons.length));
  candidate.subscriberCount = Number(validLessons[0]?.subscriberCount || 0);
  candidate.hasStructure = candidate.hasSyllabus || candidate.hasChapters;
  candidate.isShort = false;
  return candidate;
}
function getCandidateText(candidate) {
  return normalizeText([candidate.title, candidate.description, ...(candidate.items || []).map((item) => item.title + " " + item.description)].join(" "));
}
function authorityFeatures(candidates, candidate) {
  const own = candidates.filter((item) => item.channelId && item.channelId === candidate.channelId);
  const focused = own.filter((item) => (item.queryTermStats?.relevance || 0) >= 60).length;
  const topicFocusShare = own.length ? focused / own.length * 100 : 50;
  const subsValues = candidates.map((item) => logMetric(item.subscriberCount)).filter(Number.isFinite);
  const subscriberPercentile = percentile(subsValues, logMetric(candidate.subscriberCount));
  const credential = /\b(university|institute|professor|academy|school|official education|college)\b/i.test(candidate.channelTitle || "") ? 70 : 50;
  const confidence = candidate.subscriberCount ? 0.75 : 0.45;
  return {
    score: clamp(topicFocusShare * 0.60 + subscriberPercentile * 100 * 0.25 + credential * 0.15),
    topicFocusShare: Math.round(topicFocusShare),
    subscriberPercentile: Math.round(subscriberPercentile * 100),
    confidence
  };
}
function chapterCountFromCandidate(candidate) {
  if (candidate.sourceType === "playlist") return Math.max(Number(candidate.chapterCount || 0), (candidate.items || []).length >= 8 ? Number(candidate.items.length) : 0);
  return Number(candidate.chapterCount || 0);
}
function instructionalFeatures(candidate) {
  const text = normalizeText([candidate.title, candidate.description, ...(candidate.items || []).map((item) => item.title + " " + item.description)].join(" "));
  const chapterScore = clamp(chapterCountFromCandidate(candidate) * 5);
  const handsOnScore = candidate.hasHandsOn || /\b(project|practice|exercise|dataset|lab|demo|assignment|capstone|hands on)\b/.test(text) ? 90 : 40;
  const resourcesScore = candidate.hasResourceLinks || /\b(github|notebook|dataset|source code|download|worksheet|reading list)\b/.test(text) ? 85 : 45;
  const syllabusScore = candidate.hasSyllabus ? 95 : 45;
  const repetitionPenalty = /\b(repeated|repeat this|subscribe now|sponsor message)\b/.test(text) ? 10 : 0;
  const score = clamp(chapterScore * 0.30 + handsOnScore * 0.25 + resourcesScore * 0.20 + syllabusScore * 0.25 - repetitionPenalty);
  return { score, handsOnScore, chapterScore, resourcesScore, confidence: candidate.sourceType === "playlist" ? 0.75 : candidate.hasChapters || candidate.hasSyllabus ? 0.65 : 0.40 };
}
export function scoreLearnerCommunityConsensus(feedback = {}) {
  const up = Math.max(0, Number(feedback.thumbsUp || 0));
  const down = Math.max(0, Number(feedback.thumbsDown || 0));
  const outdated = Math.max(0, Number(feedback.outdated || 0));
  const saves = Math.max(0, Number(feedback.saves || 0));
  const enrollments = Math.max(0, Number(feedback.enrollments || 0));
  const explicitVotes = up + down + outdated;
  // Saves and enrollments are weak intent signals; explicit relevance votes are stronger.
  const positiveEvidence = up + 0.15 * saves + 0.30 * enrollments;
  const negativeEvidence = down + outdated;
  const posteriorScore = clamp(((positiveEvidence + 2) / (positiveEvidence + negativeEvidence + 4)) * 100);
  const evidenceStrength = explicitVotes + 0.25 * saves + 0.5 * enrollments;
  const feedbackConfidence = evidenceStrength / (evidenceStrength + 8);
  const blendWeight = Math.min(0.35, 0.35 * feedbackConfidence);
  const baseScore = 50;
  return {
    score: clamp(baseScore * (1 - blendWeight) + posteriorScore * blendWeight),
    baseScore,
    feedbackScore: posteriorScore,
    feedbackConfidence,
    blendWeight,
    explicitVotes,
    thumbsUp: up,
    thumbsDown: down,
    outdated,
    saves,
    enrollments
  };
}

export function adjustFreshnessWithCurationFeedback(freshnessScoreValue, feedback = {}) {
  const outdated = Math.max(0, Number(feedback.outdated || 0));
  const confidence = outdated / (outdated + 4);
  return clamp(Number(freshnessScoreValue || 0) * (1 - 0.25 * confidence));
}

function engagementFeatures(candidates, candidate) {
  const medianLikeRate = median(candidates.map((item) => Number(item.viewCount) > 0 ? Number(item.likeCount || 0) / Number(item.viewCount) : NaN).filter(Number.isFinite));
  const views = Math.max(0, Number(candidate.viewCount) || 0);
  const likes = Math.max(0, Number(candidate.likeCount) || 0);
  const comments = Math.max(0, Number(candidate.commentCount) || 0);
  const smoothedLikeRate = (likes + 500 * medianLikeRate) / (views + 500);
  const likeRates = candidates.map((item) => {
    const iv = Math.max(0, Number(item.viewCount) || 0);
    const il = Math.max(0, Number(item.likeCount) || 0);
    return (il + 500 * medianLikeRate) / (iv + 500);
  });
  const commentsRates = candidates.map((item) => Number(item.viewCount) > 0 ? Number(item.commentCount || 0) / Number(item.viewCount) : NaN);
  const likePct = percentile(likeRates, smoothedLikeRate) * 100;
  const commentPct = comments ? percentile(commentsRates.filter(Number.isFinite), views > 0 ? comments / views : 0) * 100 : 50;
  const score = clamp((likePct * 0.8) + (commentPct * 0.2));
  return {
    score,
    smoothedLikeRate,
    likePercentile: likePct,
    commentRatioPercentile: commentPct,
    viewsPercentile: percentile(candidates.map((item) => logMetric(item.viewCount)), logMetric(views)),
    confidence: views > 0 ? 0.95 : 0.40
  };
}

function communityFeatures(feedback = {}) {
  const adjustment = scoreLearnerCommunityConsensus(feedback);
  const evidenceCount = Number(adjustment.explicitVotes || 0);
  const softEvidence = 0.25 * Number(adjustment.saves || 0) + 0.5 * Number(adjustment.enrollments || 0);
  const evidenceStrength = evidenceCount + softEvidence;
  return {
    score: evidenceStrength > 0 ? adjustment.score : 50,
    confidence: evidenceStrength / (evidenceStrength + 8),
    evidenceCount,
    explicitVotes: evidenceCount,
    thumbsUp: Number(adjustment.thumbsUp || 0),
    thumbsDown: Number(adjustment.thumbsDown || 0),
    outdated: Number(adjustment.outdated || 0),
    saves: Number(adjustment.saves || 0),
    enrollments: Number(adjustment.enrollments || 0),
    status: evidenceStrength > 0 ? "learner-feedback-only" : "unavailable"
  };
}
function freshnessFeatures(candidate, profile, feedback = {}) {
  const freshness = freshnessScore(candidate, profile);
  const ageDays = freshness.ageDays === null ? null : freshness.ageDays;
  const text = normalizeText(candidate.title + " " + candidate.description);
  const updateMentions = /\b(updated|revised|latest|version 20\d\d|updated for 20\d\d)\b/.test(text);
  return {
    score: adjustFreshnessWithCurationFeedback(freshness.score, feedback),
    ageDays,
    halfLifeDays: profile.halfLifeDays,
    updatedMention: updateMentions,
    outdatedFeedbackCount: Math.max(0, Number(feedback.outdated || 0)),
    confidence: freshness.confidence
  };
}
function fitFeatures(candidate, profile) {
  return { score: durationFit(candidate, profile), runtimeSeconds: Number(candidate.durationSeconds || 0), targetRuntimeSeconds: profile.targetRuntimeSeconds, confidence: candidate.durationSeconds ? 0.95 : 0.2 };
}
function calculatePenalty(candidate, features) {
  const text = String(candidate.title || "") + " " + String(candidate.description || "");
  const title = String(candidate.title || "");
  const letters = title.replace(/[^A-Za-z]/g, "");
  const upper = letters ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  let penalty = 0;
  const penalties = [];
  if (title.length > 10 && upper > 0.65) { penalty += 0.08; penalties.push("all-caps clickbait heuristic"); }
  if (/\b(guaranteed job|earn \$?\d[\d,]*|make money fast|secret trick|you won't believe)\b/i.test(text)) { penalty += 0.12; penalties.push("promotional or clickbait promise"); }
  if (/\b(join my paid course|buy my course|use my affiliate|limited time offer)\b/i.test(text)) { penalty += 0.08; penalties.push("promotional density heuristic"); }
  const coverage = Number(features.coverage.score || 0);
  if (coverage < 45) { penalty += Math.min(0.18, (45 - coverage) / 250); penalties.push("weak syllabus match"); }
  const engagement = Number(features.engagement.score || 50);
  if (Number(candidate.viewCount || 0) > 100000 && engagement < 15) { penalty += 0.08; penalties.push("high exposure with weak relative engagement"); }
  return { value: Math.min(0.6, penalty), reasons: penalties };
}
function candidateDuplicateKey(candidate) {
  const title = normalizeText(candidate.title).replace(/\b(full course|complete course|tutorial|course|part \d+|episode \d+)\b/g, "");
  return { title, channelId: candidate.channelId || "", runtime: Number(candidate.durationSeconds || 0) };
}
function dedupeCandidates(candidates) {
  const sorted = [...candidates].sort((a, b) => Number(b.preliminaryScore || 0) - Number(a.preliminaryScore || 0));
  const kept = [];
  for (const candidate of sorted) {
    const a = candidateDuplicateKey(candidate);
    const duplicateIndex = kept.findIndex((existing) => {
      if (candidate.sourceType !== existing.sourceType && candidate.sourceType !== "series" && existing.sourceType !== "series") {
        const aIds = new Set(candidate.componentVideoIds || []);
        const bIds = new Set(existing.componentVideoIds || existing.items?.map((item) => item.videoId) || []);
        if ([...(candidate.items || []).map((item) => item.videoId), candidate.sourceId].some((id) => bIds.has(id)) || [...aIds].some((id) => bIds.has(id))) return true;
      }
      const b = candidateDuplicateKey(existing);
      const titleTermsA = tokens(a.title), titleTermsB = tokens(b.title);
      const overlap = titleTermsA.filter((term) => titleTermsB.includes(term)).length / Math.max(1, new Set([...titleTermsA, ...titleTermsB]).size);
      const runtimeClose = !a.runtime || !b.runtime || Math.abs(a.runtime - b.runtime) <= Math.max(120, Math.min(a.runtime, b.runtime) * 0.08);
      return overlap >= 0.88 && runtimeClose && (!a.channelId || !b.channelId || a.channelId === b.channelId);
    });
    if (duplicateIndex < 0) {
      kept.push(candidate);
      continue;
    }
    const existing = kept[duplicateIndex];
    // For a same-course video/playlist pair, keep the more structured assembled resource.
    if (candidate.sourceType === "playlist" && existing.sourceType === "video") kept[duplicateIndex] = candidate;
  }
  return kept;
}
export function blendMetadataJudgeScores(heuristicCoverage, heuristicInstruction, heuristicHandsOn, judgment) {
  if (!judgment) {
    return {
      coverageScore: clamp(heuristicCoverage),
      instructionScore: clamp(heuristicInstruction),
      handsOnScore: clamp(heuristicHandsOn),
      judgeWeight: 0
    };
  }
  // The judge only sees metadata and outlines, not transcripts; keep its influence below 50%.
  const confidence = Math.max(0.2, Math.min(0.75, Number(judgment.confidence) || 0.35));
  const judgeWeight = Math.min(0.48, 0.35 + (confidence - 0.2) * 0.25);
  const heuristicWeight = 1 - judgeWeight;
  return {
    coverageScore: clamp(clamp(heuristicCoverage) * heuristicWeight + clamp(judgment.coverageScore) * judgeWeight),
    instructionScore: clamp(clamp(heuristicInstruction) * heuristicWeight + clamp(judgment.instructionScore) * judgeWeight),
    handsOnScore: clamp(clamp(heuristicHandsOn) * heuristicWeight + clamp(judgment.handsOnScore) * judgeWeight),
    judgeWeight
  };
}

function makeFeatureSet(candidate, candidates, profile, syllabus, feedbackMap = new Map(), metadataJudgeMap = new Map()) {
  const relevance = queryTermStats(profile.query, candidate);
  candidate.queryTermStats = relevance;
  const feedback = feedbackMap.get(candidate.sourceId) || {};
  const metadataJudgment = metadataJudgeMap.get(candidate.id) || null;
  let coverage = syllabusCoverage(candidate, syllabus);
  let instruction = instructionalFeatures(candidate);
  if (metadataJudgment) {
    const blended = blendMetadataJudgeScores(
      coverage.score,
      instruction.score,
      instruction.handsOnScore,
      metadataJudgment
    );
    const exactModuleNames = new Map((syllabus.modules || []).map((item) => [normalizeText(item.name), item.name]));
    const judgeCovered = (metadataJudgment.supportedModuleNames || [])
      .map((name) => exactModuleNames.get(normalizeText(name)))
      .filter(Boolean);
    const coveredModules = [...new Set([...coverage.coveredModules, ...judgeCovered])];
    const coveredSet = new Set(coveredModules.map(normalizeText));
    coverage = {
      ...coverage,
      score: blended.coverageScore,
      coveredModules,
      gapModules: (syllabus.modules || []).map((item) => item.name).filter((name) => !coveredSet.has(normalizeText(name))),
      coverageCount: coveredModules.length,
      moduleCount: (syllabus.modules || []).length,
      metadataJudgeUsed: true,
      metadataJudgeConfidence: Math.min(0.65, Number(metadataJudgment.confidence) || 0.35)
    };
    instruction = {
      ...instruction,
      score: blended.instructionScore,
      handsOnScore: blended.handsOnScore,
      confidence: Math.max(instruction.confidence, Math.min(0.7, Number(metadataJudgment.confidence) || 0.35)),
      metadataJudgeUsed: true
    };
  }
  const engagement = engagementFeatures(candidates, candidate);
  const authority = authorityFeatures(candidates, candidate);
  const community = communityFeatures(feedback);
  const freshness = freshnessFeatures(candidate, profile, feedback);
  const fit = fitFeatures(candidate, profile);
  const rawQuality =
    coverage.score * SIGNAL_WEIGHTS.coverage +
    instruction.score * SIGNAL_WEIGHTS.instruction +
    engagement.score * SIGNAL_WEIGHTS.engagement +
    authority.score * SIGNAL_WEIGHTS.authority +
    community.score * SIGNAL_WEIGHTS.community +
    freshness.score * SIGNAL_WEIGHTS.freshness +
    fit.score * SIGNAL_WEIGHTS.fit;
  const coverageConfidence = coverage.metadataJudgeUsed
    ? Math.min(0.65, Number(coverage.metadataJudgeConfidence) || 0.35)
    : (syllabus.confidence >= 0.8 ? 0.62 : 0.40);
  const confidence =
    SIGNAL_WEIGHTS.coverage * coverageConfidence +
    SIGNAL_WEIGHTS.instruction * instruction.confidence +
    SIGNAL_WEIGHTS.engagement * engagement.confidence +
    SIGNAL_WEIGHTS.authority * authority.confidence +
    SIGNAL_WEIGHTS.community * community.confidence +
    SIGNAL_WEIGHTS.freshness * freshness.confidence +
    SIGNAL_WEIGHTS.fit * fit.confidence;
  const penalty = calculatePenalty(candidate, { coverage, instruction, engagement, authority, freshness, fit });
  return { coverage, instruction, engagement, authority, community, freshness, fit, feedback, metadataJudgmentUsed: Boolean(metadataJudgment), rawQuality, confidence, penalty, relevance };
}
function addExplanations(candidate, features, syllabus) {
  const why = [];
  const coverage = features.coverage;
  if (coverage.moduleCount) why.push("Metadata matches " + coverage.coverageCount + " of " + coverage.moduleCount + " syllabus areas.");
  if (coverage.metadataJudgeUsed) why.push("A metadata-only rubric compared the description and lesson outline with the syllabus; it did not inspect transcripts or verify video correctness.");
  if (candidate.sourceType === "playlist" || candidate.sourceType === "series") {
    why.push(String(candidate.itemCount || 0) + " ordered lessons · " + (candidate.durationEstimated ? "estimated " : "") + formatDuration(candidate.durationSeconds || 0) + " total.");
  } else {
    why.push(formatDuration(candidate.durationSeconds || 0) + " long-form lesson.");
  }
  if (candidate.hasChapters && candidate.chapterCount) {
    if (candidate.sourceType === "playlist") why.push("Has " + candidate.chapterCount + " sequentially numbered lessons.");
    else if (candidate.sourceType === "series") why.push("Has " + candidate.chapterCount + " detected numbered parts or lesson markers.");
    else why.push("Contains " + candidate.chapterCount + " detected chapter/timestamp markers.");
  }
  if (candidate.hasHandsOn) why.push("Description or lesson titles indicate practical exercises, projects, or demonstrations.");
  if (features.engagement.likePercentile >= 80) why.push("Engagement quality is in the top 20% of this candidate set after smoothing for low view counts.");
  if (features.community.explicitVotes >= 3) {
    const voteCount = features.community.explicitVotes;
    const positiveCount = features.community.thumbsUp;
    why.push(positiveCount + " of " + voteCount + " learner relevance votes were positive.");
  }
  if (features.freshness.outdatedFeedbackCount >= 2) why.push(features.freshness.outdatedFeedbackCount + " learners reported this resource as potentially outdated.");
  if (features.freshness.score >= 85) why.push("Recent relative to this topic's freshness window.");
  if (candidate.isHiddenGem) why.push("Hidden gem: strong quality evidence with below-median views.");
  if (candidate.sourceType === "series") why.push("Numbered parts from the same creator were assembled into one series.");
  if (features.community.status === "learner-feedback-only") why.push("Community consensus currently reflects BuddyForStudy learner feedback only; external forum recommendations are not connected.");
  if (features.community.status === "unavailable" && features.coverage.score < 45) why.push("This is a metadata-level match; transcript and independent community checks are not available.");
  return why.slice(0, 5);
}
export function extractCurationChapters(description = "") {
  const text = String(description || "");
  const chapterRegex = /^\s*(?:[-*•]\s*)?((?:\d{1,2}:)?[0-5]?\d:[0-5]\d)\s+(.+?)\s*$/gm;
  const chapters = [];
  for (const match of text.matchAll(chapterRegex)) {
    const timestamp = match[1];
    const title = String(match[2] || "").trim();
    const pieces = timestamp.split(":").map(Number);
    let seconds = 0;
    if (pieces.length === 3) seconds = pieces[0] * 3600 + pieces[1] * 60 + pieces[2];
    else if (pieces.length === 2) seconds = pieces[0] * 60 + pieces[1];
    if (!title || !Number.isFinite(seconds) || chapters.some((item) => item.timestampSeconds === seconds)) continue;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const timestampLabel = hours
      ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0")
      : minutes + ":" + String(remainder).padStart(2, "0");
    chapters.push({ timestampSeconds: seconds, timestampLabel, title });
  }
  return chapters.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

function moduleTextMatchScore(module, text) {
  const source = normalizeText(text);
  const concepts = [module.name, ...(module.keyConcepts || [])].map(normalizeText).filter(Boolean);
  if (!concepts.length || !source) return 0;
  let best = 0;
  for (const concept of concepts) {
    if (source.includes(concept)) {
      best = 100;
      break;
    }
    const words = tokens(concept);
    if (!words.length) continue;
    const score = words.filter((word) => source.includes(word)).length / words.length * 100;
    best = Math.max(best, score);
  }
  return best;
}

/**
 * Build a best-of-best route from available course metadata, lesson titles and
 * creator-supplied timestamps. This is not transcript-derived coverage and does
 * not assert that a chapter's actual video content was independently verified.
 */
export function buildComposedLearningPath(candidates, syllabus) {
  const modules = Array.isArray(syllabus?.modules) ? syllabus.modules : [];
  if (!modules.length || !Array.isArray(candidates) || !candidates.length) return [];
  const resources = [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate.items) && candidate.items.length
      ? candidate.items
      : [{
          videoId: candidate.videoId || (candidate.sourceType === "video" ? candidate.sourceId : ""),
          title: candidate.title,
          description: candidate.description || "",
          channelTitle: candidate.channelTitle || "",
          url: candidate.url || "",
          thumbnail: candidate.thumbnail || ""
        }];
    for (const part of parts) {
      const videoId = String(part.videoId || part.id || "");
      if (!videoId) continue;
      const description = String(part.description || candidate.description || "");
      const chapters = extractCurationChapters(description);
      const units = chapters.length
        ? chapters.map((chapter) => ({ ...chapter, titleForMatch: chapter.title, verifiedTimecode: true }))
        : [{
            timestampSeconds: 0,
            timestampLabel: "Start",
            title: String(part.title || candidate.title || "Learning lesson"),
            titleForMatch: String(part.title || candidate.title || "Learning lesson"),
            verifiedTimecode: false
          }];
      for (const unit of units) {
        const matchText = chapters.length
          ? [unit.titleForMatch, part.title].join(" ")
          : [unit.titleForMatch, part.title, description.slice(0, 1800)].join(" ");
        resources.push({
          candidate,
          videoId,
          videoTitle: String(unit.titleForMatch || part.title || candidate.title || "Learning lesson"),
          channelTitle: String(part.channelTitle || candidate.channelTitle || ""),
          moduleMatchText: normalizeText(matchText),
          timestampSeconds: Number(unit.timestampSeconds || 0),
          timestampLabel: String(unit.timestampLabel || "Start"),
          verifiedTimecode: Boolean(unit.verifiedTimecode)
        });
      }
    }
  }

  const result = [];
  const usedUnits = new Set();
  for (const module of modules) {
    const matches = resources.map((resource) => {
      const matchScore = moduleTextMatchScore(module, resource.moduleMatchText);
      const overallScore = matchScore * 0.65 + clamp(resource.candidate.finalScore || resource.candidate.preliminaryScore || 50) * 0.35;
      return { ...resource, matchScore, overallScore };
    }).filter((resource) => resource.matchScore >= 45)
      .sort((a, b) => b.overallScore - a.overallScore);
    const best = matches.find((resource) => !usedUnits.has(resource.videoId + ":" + resource.timestampSeconds));
    if (!best) continue;
    usedUnits.add(best.videoId + ":" + best.timestampSeconds);
    const url = "https://www.youtube.com/watch?v=" + best.videoId + (best.timestampSeconds > 0 ? "&t=" + best.timestampSeconds + "s" : "");
    result.push({
      moduleOrder: result.length + 1,
      moduleName: module.name,
      videoTitle: best.videoTitle,
      resourceTitle: String(best.candidate.title || best.videoTitle),
      resourceType: best.candidate.sourceType || "video",
      channelTitle: best.channelTitle,
      videoId: best.videoId,
      timestampSeconds: best.timestampSeconds,
      timestampLabel: best.timestampLabel,
      verifiedTimecode: best.verifiedTimecode,
      url,
      embedUrl: "https://www.youtube-nocookie.com/embed/" + best.videoId + "?start=" + best.timestampSeconds + "&rel=0&playsinline=1",
      matchScore: Math.round(best.matchScore),
      overallScore: Math.round(best.overallScore)
    });
  }
  return result;
}

function setRankingSlots(candidates, resultLimit = FINAL_RESULT_COUNT) {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(resultLimit) || FINAL_RESULT_COUNT)));
  const list = [...candidates];
  if (!list.length) return [];
  const byScore = (selector) => list.filter(selector).sort((a, b) => b.finalScore - a.finalScore);
  const slots = [
    { label: "Best overall", items: byScore(() => true) },
    { label: "Hidden gem", items: byScore((item) => item.isHiddenGem) },
    { label: "Best for beginners", items: byScore((item) => item.beginnerFit >= 65) },
    { label: "Fastest path", items: byScore((item) => item.durationSeconds > 0).sort((a, b) => a.durationSeconds - b.durationSeconds || b.finalScore - a.finalScore) },
    { label: "Best hands-on", items: byScore((item) => item.features.instruction.handsOnScore >= 65) },
    { label: "Most up to date", items: byScore((item) => true).sort((a, b) => b.features.freshness.score - a.features.freshness.score || b.finalScore - a.finalScore) }
  ];
  const selected = [];
  const selectedIds = new Set();
  const channelCounts = new Map();
  function canUse(candidate) {
    if (selectedIds.has(candidate.id)) return true;
    return (channelCounts.get(candidate.channelId || candidate.id) || 0) < 2;
  }
  function add(candidate, label) {
    let target = selected.find((item) => item.id === candidate.id);
    if (!target) {
      if (!canUse(candidate)) return false;
      target = { ...candidate, slots: [] };
      selected.push(target);
      selectedIds.add(candidate.id);
      const channelKey = candidate.channelId || candidate.id;
      channelCounts.set(channelKey, (channelCounts.get(channelKey) || 0) + 1);
    }
    if (!target.slots.includes(label)) target.slots.push(label);
    return true;
  }
  for (const slot of slots) {
    let assigned = false;
    for (const candidate of slot.items) {
      if (add(candidate, slot.label)) { assigned = true; break; }
    }
    if (!assigned) continue;
  }
  for (const candidate of [...list].sort((a, b) => b.finalScore - a.finalScore)) {
    if (selected.length >= limit) break;
    if (selectedIds.has(candidate.id) || !canUse(candidate)) continue;
    const similar = selected.some((other) => {
      const a = new Set(tokens(candidate.title));
      const b = new Set(tokens(other.title));
      const intersection = [...a].filter((item) => b.has(item)).length;
      const jaccard = intersection / Math.max(1, new Set([...a, ...b]).size);
      return jaccard >= 0.75;
    });
    const mmrPenalty = similar ? 18 : 0;
    selected.push({ ...candidate, slots: ["Recommended"], finalScore: clamp(candidate.finalScore - mmrPenalty) });
    selectedIds.add(candidate.id);
    const channelKey = candidate.channelId || candidate.id;
    channelCounts.set(channelKey, (channelCounts.get(channelKey) || 0) + 1);
  }
  return selected.slice(0, limit).map((candidate) => ({
    id: candidate.id,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    title: candidate.title,
    description: candidate.description || "",
    thumbnail: candidate.thumbnail || "",
    channelTitle: candidate.channelTitle || "",
    channelId: candidate.channelId || "",
    sourceUrl: candidate.url || candidate.playlistSearchUrl || "",
    duration: candidate.duration || formatDuration(candidate.durationSeconds),
    durationSeconds: Math.round(candidate.durationSeconds || 0),
    durationEstimated: Boolean(candidate.durationEstimated),
    itemCount: candidate.itemCount || 1,
    viewCount: Math.round(candidate.viewCount || 0),
    likeCount: Math.round(candidate.likeCount || 0),
    commentCount: Math.round(candidate.commentCount || 0),
    subscriberCount: Math.round(candidate.subscriberCount || 0),
    publishedAt: candidate.publishedAt || null,
    score: Math.round(candidate.finalScore),
    qualityScore: Math.round(candidate.qualityScore),
    confidence: Number(candidate.confidence.toFixed(2)),
    isHiddenGem: Boolean(candidate.isHiddenGem),
    slots: candidate.slots,
    primarySlot: candidate.slots[0] || "Recommended",
    whyThis: candidate.whyThis,
    gaps: candidate.features.coverage.gapModules.slice(0, 5),
    evidence: {
      coverage: Math.round(candidate.features.coverage.score),
      instruction: Math.round(candidate.features.instruction.score),
      engagement: Math.round(candidate.features.engagement.score),
      authority: Math.round(candidate.features.authority.score),
      freshness: Math.round(candidate.features.freshness.score),
      fit: Math.round(candidate.features.fit.score),
      learnerFeedback: Math.round(candidate.features.community.score),
      learnerFeedbackVotes: Math.round(candidate.features.community.explicitVotes),
      community: candidate.features.community.status,
      metadataJudge: candidate.features.metadataJudgmentUsed ? "gemini_metadata_only" : "heuristics_only"
    },
    sourceTypeVersion: ENGINE_VERSION,
    items: (candidate.items || []).slice(0, 12).map((item) => ({
      videoId: item.videoId,
      title: item.title,
      description: item.description || "",
      durationSeconds: item.durationSeconds || 0,
      duration: formatDuration(item.durationSeconds || 0),
      thumbnail: item.thumbnail || "",
      channelTitle: item.channelTitle || "",
      publishedAt: item.publishedAt || null,
      url: item.url || ("https://www.youtube.com/watch?v=" + item.videoId)
    }))
  }));
}
export function selectCurationResultSlots(candidates, resultLimit = FINAL_RESULT_COUNT) {
  return setRankingSlots(candidates, resultLimit);
}

function selectInitialShortlist(videos, playlists, profile) {
  const videoEntries = videos.map((item) => ({ ...item, id: "video:" + item.videoId, sourceType: "video", sourceId: item.videoId, itemCount: 1 }));
  const assembled = assemblePartSeries(videoEntries, profile);
  const videoPool = [...assembled.series, ...assembled.singles];
  for (const candidate of videoPool) candidate.queryTermStats = queryTermStats(profile.query, candidate);
  const prefilteredVideos = videoPool.filter((candidate) => passesHardGates(candidate, profile).passed);
  const playlistPool = playlists.map((item) => playlistCandidate(item, profile)).filter((item) =>
    item.itemCount >= profile.minPlaylistItems &&
    !isNegativeIntent(item, profile) &&
    (item.queryTermStats.relevance >= 40 || item.queryTermStats.titleRelevance >= 20)
  );
  for (const candidate of [...prefilteredVideos, ...playlistPool]) candidate.preliminaryScore = preliminaryScore(candidate, profile);
  const videoTop = prefilteredVideos.sort((a, b) => b.preliminaryScore - a.preliminaryScore).slice(0, 25);
  const playlistTop = playlistPool.sort((a, b) => b.preliminaryScore - a.preliminaryScore).slice(0, 15);
  const chosen = [...videoTop, ...playlistTop].sort((a, b) => b.preliminaryScore - a.preliminaryScore);
  const ids = new Set(chosen.map((item) => item.id));
  const fill = [...prefilteredVideos, ...playlistPool].sort((a, b) => b.preliminaryScore - a.preliminaryScore);
  for (const candidate of fill) {
    if (chosen.length >= 40) break;
    if (ids.has(candidate.id)) continue;
    chosen.push(candidate);
    ids.add(candidate.id);
  }
  return {
    shortlist: dedupeCandidates(chosen).slice(0, 40),
    rawVideoCount: videos.length,
    rawPlaylistCount: playlists.length,
    prefilteredVideoCount: prefilteredVideos.length,
    prefilteredPlaylistCount: playlistPool.length
  };
}
async function enrichPlaylists(candidates, profile) {
  const playlists = candidates.filter((candidate) => candidate.sourceType === "playlist");
  const detailMap = new Map();
  const batchSize = 4;
  for (let offset = 0; offset < playlists.length; offset += batchSize) {
    const batch = playlists.slice(offset, offset + batchSize);
    const details = await Promise.all(batch.map(async (candidate) => {
      try {
        const detail = await getPlaylistCourse(candidate.sourceId);
        return { id: candidate.id, detail, originalCount: candidate.itemCount };
      } catch (error) {
        console.warn("Curation playlist enrichment failed", { playlistId: candidate.sourceId, message: error?.message || error });
        return { id: candidate.id, detail: null, originalCount: candidate.itemCount };
      }
    }));
    for (const result of details) detailMap.set(result.id, result);
  }
  return candidates.map((candidate) => {
    if (candidate.sourceType !== "playlist") return candidate;
    const result = detailMap.get(candidate.id);
    if (!result?.detail) return { ...candidate, integrity: 0, hasStructure: false, durationSeconds: 0 };
    const enriched = computePlaylistStats(candidate, result.detail, result.originalCount);
    enriched.hasStructure = hasStructureEvidence(enriched);
    enriched.queryTermStats = queryTermStats(profile.query, enriched);
    return enriched;
  });
}
function hardGateEnriched(candidates, profile) {
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    candidate.queryTermStats = queryTermStats(profile.query, candidate);
    const gate = passesHardGates(candidate, profile);
    if (gate.passed) accepted.push(candidate);
    else rejected.push({ id: candidate.id, reason: gate.reason });
  }
  return { accepted, rejected };
}
async function loadLearnerFeedbackSignals(profile, candidates) {
  const resourceIds = [...new Set(candidates.map((candidate) => String(candidate.sourceId || "")).filter(Boolean))];
  const result = new Map();
  if (!resourceIds.length || CourseCurationFeedback.db?.readyState !== 1) return result;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  try {
    const rows = await CourseCurationFeedback.aggregate([
      {
        $match: {
          normalizedQuery: profile.normalizedQuery,
          engineVersion: { $in: [ENGINE_VERSION, "course-curation-decision-engine-v1.6", "course-curation-decision-engine-v1.5", "course-curation-decision-engine-v1.4", "course-curation-decision-engine-v1.3", "course-curation-decision-engine-v1.2"] },
          resourceId: { $in: resourceIds },
          createdAt: { $gte: cutoff }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            resourceId: "$resourceId",
            user: "$user",
            interactionType: {
              $cond: [
                { $in: ["$event", ["thumbs_up", "thumbs_down", "outdated"]] },
                "opinion",
                "$event"
              ]
            }
          },
          event: { $first: "$event" }
        }
      },
      {
        $group: {
          _id: "$_id.resourceId",
          users: { $addToSet: "$_id.user" },
          thumbsUp: { $sum: { $cond: [{ $and: [{ $eq: ["$_id.interactionType", "opinion"] }, { $eq: ["$event", "thumbs_up"] }] }, 1, 0] } },
          thumbsDown: { $sum: { $cond: [{ $and: [{ $eq: ["$_id.interactionType", "opinion"] }, { $eq: ["$event", "thumbs_down"] }] }, 1, 0] } },
          outdated: { $sum: { $cond: [{ $and: [{ $eq: ["$_id.interactionType", "opinion"] }, { $eq: ["$event", "outdated"] }] }, 1, 0] } },
          saves: { $sum: { $cond: [{ $eq: ["$_id.interactionType", "save"] }, 1, 0] } },
          enrollments: { $sum: { $cond: [{ $eq: ["$_id.interactionType", "enroll"] }, 1, 0] } },
          previews: { $sum: { $cond: [{ $eq: ["$_id.interactionType", "preview"] }, 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          resourceId: "$_id",
          userCount: { $size: "$users" },
          thumbsUp: 1,
          thumbsDown: 1,
          outdated: 1,
          saves: 1,
          enrollments: 1,
          previews: 1
        }
      }
    ]);
    for (const row of rows) result.set(row.resourceId, row);
  } catch (error) {
    console.warn("Curation feedback signals unavailable", { message: error?.message || error });
  }
  return result;
}

function scoreFinalCandidates(candidates, profile, syllabus, feedbackMap = new Map(), metadataJudgeMap = new Map()) {
  const preliminaryFeatures = candidates.map((candidate) => ({ candidate, features: makeFeatureSet(candidate, candidates, profile, syllabus, feedbackMap, metadataJudgeMap) }));
  const prior = median(preliminaryFeatures.map((item) => item.features.rawQuality));
  for (const { candidate, features } of preliminaryFeatures) {
    const freshness = features.freshness.score;
    const viewsPercentile = features.engagement.viewsPercentile;
    const quality = features.rawQuality;
    const gem = quality >= 70 && features.coverage.score >= 70 && viewsPercentile <= 0.5
      ? 8 * features.confidence * (1 - viewsPercentile)
      : 0;
    candidate.features = features;
    candidate.qualityScore = quality;
    candidate.confidence = features.confidence;
    candidate.isHiddenGem = gem > 0;
    candidate.gemBonus = gem;
    candidate.finalScore = clamp(
      features.confidence * quality * (1 - features.penalty.value) +
      (1 - features.confidence) * prior +
      gem
    );
    const qFit = durationFit(candidate, profile);
    candidate.beginnerFit = profile.level === "Beginner"
      ? clamp(qFit + (/\b(beginner|from scratch|fundamentals|introduction|basics)\b/i.test(candidate.title + " " + candidate.description) ? 15 : -10))
      : qFit;
    candidate.whyThis = addExplanations(candidate, features, syllabus);
    candidate.queryTermStats = features.relevance;
    candidate.qualityEvidence = {
      weights: SIGNAL_WEIGHTS,
      prior: Math.round(prior),
      confidence: Number(features.confidence.toFixed(2)),
      penalty: Number(features.penalty.value.toFixed(3)),
      penaltyReasons: features.penalty.reasons,
      hiddenGemBonus: Number(gem.toFixed(2)),
      syllabusSource: syllabus.source
    };
  }
  return preliminaryFeatures.map((item) => item.candidate).sort((a, b) => b.finalScore - a.finalScore);
}

export async function invalidateNormalSearchCurationCache(query, options = {}) {
  const profile = classifyCurationIntent(query, options);
  let settingCount = 30;
  try {
    const setting = await PlatformSetting.findOne({ key: "discovery_search_results_per_query" }).select("value").lean();
    settingCount = Math.max(5, Math.min(50, Number(setting?.value) || 30));
  } catch {}
  const key = cacheKey("curated-results", profile.normalizedQuery + "|" + profile.category + "|" + profile.mode + "|" + profile.level + "|" + profile.language + "|" + settingCount);
  memoryCache.delete(key);
  try { await cacheDelete("bfs:" + key); } catch {}
  try {
    if (CourseCurationFeedback.db?.readyState === 1) await CourseCurationFeedback.db.collection("course_curation_cache").deleteOne({ key });
  } catch {}
}

/**
 * Normal-search course curation engine. The configured admin count controls the
 * number of candidates fetched per query and maximum final result count. The user-facing
 * list is quality-gated and diversified, and may be shorter when too few candidates pass.
 */
export async function curateNormalSearch(query, options = {}) {
  const normalizedQuery = String(query || "").trim();
  const requestId = typeof options.requestId === "string" && options.requestId.trim()
    ? options.requestId.trim().slice(0, 128)
    : randomUUID();
  const skillId = typeof options.skillId === "string" && options.skillId.trim()
    ? options.skillId.trim().slice(0, 120)
    : null;
  if (normalizedQuery.length < 2) {
    console.info("Course curation completed", {
      requestId,
      skillId,
      cacheHit: false,
      resultCacheHit: false,
      poolCacheHit: false,
      searchCalls: 0,
      quotaUnits: 0,
      results: 0
    });
    return { resources: [], meta: { version: ENGINE_VERSION, resultsShown: 0 } };
  }
  const profile = classifyCurationIntent(normalizedQuery, options);
  const hasInjectedSyllabus = options.syllabus && Array.isArray(options.syllabus.modules);
  if (options.overrides && typeof options.overrides === "object") {
    if (options.overrides.mode) profile.mode = options.overrides.mode;
    if (Number.isFinite(Number(options.overrides.halfLifeDays))) profile.halfLifeDays = Math.max(1, Number(options.overrides.halfLifeDays));
  }
  const overrides = options.overrides && typeof options.overrides === "object" ? options.overrides : {};
  const cacheScope = typeof options.cacheScope === "string" ? options.cacheScope.trim().slice(0, 180) : "";
  const overridesHash = digest(JSON.stringify(Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)))));
  const extraQueries = Array.isArray(options.extraQueries) ? options.extraQueries.map((item) => String(item || "").trim()).filter((item) => item.length >= 2).slice(0, 2) : [];
  const maxQueries = Math.max(1, Math.min(8, Math.floor(Number(options.maxQueries) || DEFAULT_MAX_QUERIES)));
  let settingCount = 30;
  try {
    const resultSetting = await PlatformSetting.findOne({ key: "discovery_search_results_per_query" }).select("value").lean();
    settingCount = Math.max(5, Math.min(50, Number(resultSetting?.value) || 30));
  } catch {}
  const resultKey = cacheKey("curated-results", profile.normalizedQuery + "|" + profile.category + "|" + profile.mode + "|" + profile.level + "|" + profile.language + "|" + settingCount + "|" + cacheScope + "|" + overridesHash);
  const cached = await getCachedValue(resultKey);
  if (cached?.resources) {
    console.info("Course curation completed", {
      requestId,
      skillId,
      query: profile.normalizedQuery,
      version: ENGINE_VERSION,
      candidates: cached.meta?.poolCandidates || 0,
      results: cached.resources.length,
      cacheHit: true,
      resultCacheHit: true,
      poolCacheHit: null,
      searchCalls: 0,
      quotaUnits: 0,
      elapsedMs: 0
    });
    return { ...cached, meta: { ...(cached.meta || {}), cacheHit: true } };
  }

  const startedAt = Date.now();
  const requestMetrics = { requestId, skillId, searchCalls: 0, quotaUnits: 0 };
  const syllabus = hasInjectedSyllabus ? normalizeSyllabus(options.syllabus, profile.query) : await getTopicSyllabus(profile);
  let queries = buildCandidateQueries(profile, syllabus).slice(0, maxQueries);
  if (extraQueries.length) queries = [...new Set([...queries, ...extraQueries])].slice(0, maxQueries);
  const poolKey = cacheKey("candidate-search", profile.normalizedQuery + "|" + profile.category + "|" + profile.mode + "|" + profile.level + "|" + profile.language + "|" + buildCandidateQueries(profile, hasInjectedSyllabus ? normalizeSyllabus(options.syllabus, profile.query) : { modules: [], aliases: [] }).join("|") + "|" + settingCount);
  let pool = await getCachedValue(poolKey);
  const poolCacheHit = Boolean(pool);
  let youtubeError = "";
  if (!pool) {
    const searchOptions = getYouTubeSearchOptions(profile.language, profile.languageExplicit);
    const [videoResult, playlistResult] = await withYouTubeRequestMetrics(requestMetrics, () => Promise.allSettled([
      searchYouTubeCurationCandidates(queries, settingCount, searchOptions),
      searchStructuredPlaylists(profile.query, Math.min(30, settingCount), searchOptions)
    ]));
    const videos = videoResult.status === "fulfilled" ? videoResult.value : [];
    let playlists = playlistResult.status === "fulfilled" ? playlistResult.value : [];
    if (videoResult.status === "rejected") youtubeError = videoResult.reason?.message || "YouTube video candidate search failed";
    if (playlistResult.status === "rejected") youtubeError = youtubeError ? youtubeError + "; " + (playlistResult.reason?.message || "Playlist search failed") : (playlistResult.reason?.message || "Playlist search failed");

    const topChannelIds = [...new Set(
      videos.slice(0, 80).map((candidate) => String(candidate.channelId || "")).filter(Boolean)
    )].slice(0, 6);
    let channelPlaylists = [];
    try {
      channelPlaylists = await withYouTubeRequestMetrics(
        requestMetrics,
        () => searchChannelCoursePlaylists(topChannelIds, 5)
      );
    } catch (error) {
      console.warn("Curation channel playlist expansion unavailable", { query: profile.normalizedQuery, message: error?.message || error });
    }
    const playlistsById = new Map();
    for (const playlist of [...playlists, ...channelPlaylists]) {
      if (playlist?.playlistId) playlistsById.set(playlist.playlistId, playlist);
    }
    playlists = [...playlistsById.values()];
    pool = {
      videos,
      playlists,
      channelPlaylistsFetched: channelPlaylists.length,
      expandedChannelCount: topChannelIds.length,
      queries,
      cachedAt: new Date().toISOString()
    };
    const ttl = videos.length || playlists.length ? 24 * 60 * 60 * 1000 : EMPTY_RESULT_TTL_MS;
    await setCachedValue(poolKey, "candidate-search", pool, ttl);
  }

  const selectionProfile = { ...profile, ...overrides };
  const boundedPool = {
    videos: (pool.videos || []).filter((item) => {
      const duration = Number(item.durationSeconds || 0);
      return (!Number.isFinite(Number(overrides.minVideoSeconds)) || duration >= Number(overrides.minVideoSeconds)) &&
        (!Number.isFinite(Number(overrides.maxVideoSeconds)) || duration <= Number(overrides.maxVideoSeconds));
    }),
    playlists: (pool.playlists || []).filter((item) => {
      const duration = Number(item.durationSeconds || 0);
      const count = Number(item.itemCount || item.videoCount || 0);
      return (!Number.isFinite(Number(overrides.minPlaylistSeconds)) || duration >= Number(overrides.minPlaylistSeconds)) &&
        (!Number.isFinite(Number(overrides.minPlaylistItems)) || count >= Number(overrides.minPlaylistItems));
    })
  };
  const initial = selectInitialShortlist(boundedPool.videos, boundedPool.playlists, selectionProfile);
  const enriched = await withYouTubeRequestMetrics(requestMetrics, () => enrichPlaylists(initial.shortlist, selectionProfile));
  const gates = hardGateEnriched(enriched, selectionProfile);
  const deduplicated = dedupeCandidates(gates.accepted);
  const feedbackSignals = await loadLearnerFeedbackSignals(profile, deduplicated);
  const metadataJudgment = await evaluateCandidatesWithMetadataRubric(deduplicated, selectionProfile, syllabus);
  const scored = scoreFinalCandidates(deduplicated, selectionProfile, syllabus, feedbackSignals, metadataJudgment.byCandidateId);
  const resources = setRankingSlots(scored, settingCount);
  const composedPath = buildComposedLearningPath(scored, syllabus);
  const meta = {
    version: ENGINE_VERSION,
    intent: {
      mode: profile.mode,
      level: profile.level,
      category: profile.category,
      language: profile.language,
      languageExplicit: profile.languageExplicit,
      halfLifeDays: profile.halfLifeDays
    },
    syllabus: { source: syllabus.source, confidence: syllabus.confidence, moduleCount: syllabus.modules.length },
    queryCount: queries.length,
    poolCandidates: initial.rawVideoCount + initial.rawPlaylistCount,
    videosFetched: initial.rawVideoCount,
    playlistsFetched: initial.rawPlaylistCount,
    channelPlaylistsFetched: Number(pool.channelPlaylistsFetched || 0),
    expandedChannelCount: Number(pool.expandedChannelCount || 0),
    tierAAfterGates: initial.prefilteredVideoCount + initial.prefilteredPlaylistCount,
    tierBShortlist: initial.shortlist.length,
    tierCEligible: gates.accepted.length,
    gateRejected: gates.rejected.length,
    learnerFeedbackCandidates: feedbackSignals.size,
    feedbackLookbackDays: 90,
    metadataJudgeSource: metadataJudgment.source,
    metadataJudgedCandidates: metadataJudgment.judgedCount,
    composedPath,
    composedPathSteps: composedPath.length,
    requestedResultLimit: settingCount,
    resultsShown: resources.length,
    cacheHit: false,
    poolCacheHit,
    elapsedMs: Date.now() - startedAt,
    youtubeError
  };
  const response = { query: normalizedQuery, resources, meta };
  await setCachedValue(resultKey, "curated-results", response, resources.length ? RESULT_TTL_MS : EMPTY_RESULT_TTL_MS);
  console.info("Course curation completed", {
    requestId,
    skillId,
    query: profile.normalizedQuery,
    version: ENGINE_VERSION,
    candidates: meta.poolCandidates,
    shortlisted: meta.tierBShortlist,
    eligible: meta.tierCEligible,
    results: meta.resultsShown,
    cacheHit: Boolean(poolCacheHit),
    resultCacheHit: false,
    poolCacheHit,
    searchCalls: requestMetrics.searchCalls,
    quotaUnits: requestMetrics.quotaUnits,
    quotaState: requestMetrics.quotaState || "unknown",
    elapsedMs: meta.elapsedMs
  });
  return response;
}
