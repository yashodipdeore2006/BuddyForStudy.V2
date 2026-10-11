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

  // Do not reuse a roadmap for a different user query with overlapping topic keys.
  if (typeof exactQuery === "string" && exactQuery.trim()) {
    filter["generation.query"] = exactQuery.trim();
  }

  return Course.findOne(filter).sort({ createdAt: -1 });
}
