import { createHash } from "node:crypto";
import { RoadmapTemplate } from "../models/RoadmapTemplate.js";
export const ROADMAP_TEMPLATE_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export function normalizeTemplateTopic(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}
export function buildRoadmapTemplateKey({ canonicalTopic, goal, level, language, promptVersion }) {
  const stable = JSON.stringify({
    canonicalTopic: normalizeTemplateTopic(canonicalTopic), goal: String(goal || "learn").trim().toLowerCase(),
    level: String(level || "Beginner"), language: String(language || "en").trim().toLowerCase(),
    promptVersion: String(promptVersion || "builtin-v1")
  });
  return createHash("sha256").update(stable).digest("hex");
}
export async function getOrCreateRoadmapTemplate({ profile, promptVersion, generate, model = RoadmapTemplate, now = new Date() }) {
  const canonicalTopic = normalizeTemplateTopic(profile.canonicalTopic || profile.topic);
  const goal = profile.goal || (Array.isArray(profile.goals) && profile.goals.length ? profile.goals.join(",") : "learn");
  const level = profile.level || "Beginner", language = profile.language || "en";
  const version = String(promptVersion || "builtin-v1");
  const key = buildRoadmapTemplateKey({ canonicalTopic, goal, level, language, promptVersion: version });
  const cached = await model.findOne({ key, expiresAt: { $gt: now } }).lean();
  if (cached?.roadmap && typeof cached.roadmap === "object") return { roadmap: cached.roadmap, cached: true, key };
  const roadmap = await generate();
  if (!roadmap || typeof roadmap !== "object" || !Array.isArray(roadmap.skills)) throw new TypeError("Roadmap template generator must return Gemini roadmap JSON");
  const expiresAt = new Date(now.getTime() + ROADMAP_TEMPLATE_TTL_DAYS * DAY_MS);
  await model.updateOne({ key }, { $set: { key, canonicalTopic, goal, level, language, promptVersion: version, roadmap, createdAt: now, expiresAt } }, { upsert: true, runValidators: true });
  return { roadmap, cached: false, key };
}
export function personalizeRoadmapTemplate(roadmap, profile = {}) {
  // Pure transformation: no model, provider, cache, or other I/O.
  return {
    roadmap: structuredClone(roadmap),
    profile: {
      topic: String(profile.topic || roadmap.canonicalTopic || ""), level: profile.level || "Beginner",
      goals: Array.isArray(profile.goals) ? [...profile.goals] : [],
      knownSkills: Array.isArray(profile.knownSkills) ? [...profile.knownSkills] : [],
      studyTimeMinutesPerDay: Number(profile.studyTimeMinutesPerDay) || 60,
      language: profile.language || "en", domain: profile.domain || null
    }
  };
}
