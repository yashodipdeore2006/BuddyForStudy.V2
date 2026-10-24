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
export async function findRoadmapTemplate({ profile, promptVersion, model = RoadmapTemplate, now = new Date() }) {
  const canonicalTopic = normalizeTemplateTopic(profile.canonicalTopic || profile.topic);
  const goal = profile.goal || (Array.isArray(profile.goals) && profile.goals.length ? profile.goals.join(",") : "learn");
  const level = profile.level || "Beginner", language = profile.language || "en";
  const version = String(promptVersion || "builtin-v1");
  const key = buildRoadmapTemplateKey({ canonicalTopic, goal, level, language, promptVersion: version });
  const cached = await model.findOne({ key, expiresAt: { $gt: now } }).lean();
  return cached?.roadmap && typeof cached.roadmap === "object" ? { roadmap: cached.roadmap, cached: true, key } : null;
}
export async function getOrCreateRoadmapTemplate({ profile, promptVersion, generate, model = RoadmapTemplate, now = new Date() }) {
  const canonicalTopic = normalizeTemplateTopic(profile.canonicalTopic || profile.topic);
  const goal = profile.goal || (Array.isArray(profile.goals) && profile.goals.length ? profile.goals.join(",") : "learn");
  const level = profile.level || "Beginner", language = profile.language || "en";
  const version = String(promptVersion || "builtin-v1");
  const key = buildRoadmapTemplateKey({ canonicalTopic, goal, level, language, promptVersion: version });
  const cached = await findRoadmapTemplate({ profile, promptVersion: version, model, now });
  if (cached) return cached;
  const roadmap = await generate();
  if (!roadmap || typeof roadmap !== "object" || !Array.isArray(roadmap.skills)) throw new TypeError("Roadmap template generator must return Gemini roadmap JSON");
  const expiresAt = new Date(now.getTime() + ROADMAP_TEMPLATE_TTL_DAYS * DAY_MS);
  await model.updateOne({ key }, { $set: { key, canonicalTopic, goal, level, language, promptVersion: version, roadmap, createdAt: now, expiresAt } }, { upsert: true, runValidators: true });
  return { roadmap, cached: false, key };
}
export function personalizeRoadmapTemplate(roadmap, profile = {}) {
  // Pure transformation: no model, provider, cache, or other I/O.
  const personalizedRoadmap = structuredClone(roadmap);
  const known = new Set((profile.knownSkills || []).map((item) => normalizeTemplateTopic(item).replace(/[^a-z0-9+#.]+/g, "-")));
  const removedSkills = [];
  personalizedRoadmap.skills = (personalizedRoadmap.skills || []).filter((skill) => {
    const candidates = [skill.id, skill.canonicalSkillId, skill.name].filter(Boolean)
      .map((item) => normalizeTemplateTopic(item).replace(/[^a-z0-9+#.]+/g, "-"));
    if (candidates.some((candidate) => known.has(candidate))) {
      removedSkills.push(skill.name || skill.id);
      return false;
    }
    return true;
  });
  const remainingIds = new Set(personalizedRoadmap.skills.map((skill) =>
    normalizeTemplateTopic(skill.id || skill.name).replace(/[^a-z0-9+#.]+/g, "-")
  ));
  personalizedRoadmap.skills = personalizedRoadmap.skills.map((skill) => ({
    ...skill,
    prerequisites: (skill.prerequisites || []).filter((item) =>
      !known.has(normalizeTemplateTopic(item).replace(/[^a-z0-9+#.]+/g, "-")) &&
      remainingIds.has(normalizeTemplateTopic(item).replace(/[^a-z0-9+#.]+/g, "-"))
    )
  }));
  const studyTimeMinutesPerDay = Number(profile.studyTimeMinutesPerDay) || 60;
  const totalTargetMinutes = personalizedRoadmap.skills.reduce((sum, skill) =>
    sum + Math.max(0, Number(skill.courseDuration?.targetMinutes) || 0), 0);
  return {
    roadmap: personalizedRoadmap,
    profile: {
      topic: String(profile.topic || roadmap.canonicalTopic || ""), level: profile.level || "Beginner",
      goals: Array.isArray(profile.goals) ? [...profile.goals] : [],
      // Known skills have already been removed by this pure transformation.
      knownSkills: [],
      studyTimeMinutesPerDay,
      language: profile.language || "en", domain: profile.domain || null
    },
    personalization: {
      knownSkills: Array.isArray(profile.knownSkills) ? [...profile.knownSkills] : [],
      skippedSkills: removedSkills,
      goals: Array.isArray(profile.goals) ? [...profile.goals] : [],
      studyTimeMinutesPerDay,
      estimatedStudyDays: Math.max(1, Math.ceil(totalTargetMinutes / Math.max(30, studyTimeMinutesPerDay))),
      goalModules: (personalizedRoadmap.goalModules || []).filter((module) =>
        !module.goal || (profile.goals || []).includes(module.goal)
      )
    }
  };
}
