import { Course } from "../models/Course.js";

export const GENERATED_COURSE_REUSE_DAYS = 30;

export function normalizeTopicKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTopicKeys(...values) {
  return [...new Set(
    values.flatMap((value) => Array.isArray(value) ? value : [value])
      .map(normalizeTopicKey)
      .filter(Boolean)
  )];
}

function generatedCourseCutoff(days = GENERATED_COURSE_REUSE_DAYS) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function findRecentGeneratedCourse({ mode, topicKeys, exactQuery }) {
  const keys = buildTopicKeys(topicKeys);
  if (!keys.length) return null;

  const filter = {
    isPublished: true,
    "generation.mode": mode,
    "generation.topicKeys": { $in: keys },
    createdAt: { $gte: generatedCourseCutoff() }
  };

  // AI roadmaps are personalized to the exact user request. Do not reuse a
  // neighboring topic just because its canonical title/category shares a key.
  if (typeof exactQuery === "string" && exactQuery.trim()) {
    const escaped = exactQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\    createdAt: { $gte: generatedCourseCutoff() }
  }).sort({ createdAt: -1 });");
    filter["generation.query"] = { $regex: `^${escaped}import { Course } from "../models/Course.js";

export const GENERATED_COURSE_REUSE_DAYS = 30;

export function normalizeTopicKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTopicKeys(...values) {
  return [...new Set(
    values.flatMap((value) => Array.isArray(value) ? value : [value])
      .map(normalizeTopicKey)
      .filter(Boolean)
  )];
}

function generatedCourseCutoff(days = GENERATED_COURSE_REUSE_DAYS) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function findRecentGeneratedCourse({ mode, topicKeys, exactQuery }) {
  const keys = buildTopicKeys(topicKeys);
  if (!keys.length) return null;

  const filter = {
    isPublished: true,
    "generation.mode": mode,
    "generation.topicKeys": { $in: keys },
, $options: "i" };
  }

  return Course.findOne(filter).sort({ createdAt: -1 });
}
