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

export async function findRecentGeneratedCourse({ mode, topicKeys, exactQuery, includeUnpublished = false }) {
  const keys = buildTopicKeys(topicKeys);
  if (!keys.length) return null;

  const baseFilter = {
    "generation.mode": mode,
    "generation.topicKeys": { $in: keys },
    createdAt: { $gte: generatedCourseCutoff() },
    deletedAt: null
  };

  // Do not reuse a roadmap for a different user query with overlapping topic keys.
  if (typeof exactQuery === "string" && exactQuery.trim()) {
    baseFilter["generation.query"] = exactQuery.trim();
  }

  const filter = includeUnpublished
    ? {
        ...baseFilter,
        $or: [
          {
            isPublished: true,
            aiReviewStatus: "approved",
            $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
          },
          {
            isPublished: false,
            status: { $ne: "archived" },
            aiReviewStatus: { $in: ["pending", "approved"] },
            visibility: { $ne: "private" },
            createdForUser: null
          }
        ]
      }
    : {
        ...baseFilter,
        isPublished: true,
        aiReviewStatus: "approved",
        $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
      };

  return Course.findOne(filter).sort({ createdAt: -1 });
}
