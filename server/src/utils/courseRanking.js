const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
const finiteCount = (value) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0));

export const COURSE_RANKING_POLICY = Object.freeze({
  version: "course-ranking-v1",
  weights: Object.freeze({
    relevance: 35,
    catalogueCompleteness: 25,
    curriculumCoverage: 15,
    confidenceAdjustedRating: 15,
    popularity: 5,
    freshness: 5
  }),
  ratingPriorAverage: 3.5,
  ratingPriorStrength: 10,
  popularityReferenceEnrollments: 1000,
  freshnessDecayDays: 730
});

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}+#.]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueTokens(value) {
  return [...new Set(normalizeText(value).split(" ").filter(Boolean))];
}

function tokenCoverage(value, queryTokens) {
  if (!queryTokens.length) return 0;
  const tokens = new Set(uniqueTokens(value));
  return queryTokens.filter((token) => tokens.has(token)).length / queryTokens.length;
}

function listText(values) {
  return Array.isArray(values) ? values.filter(Boolean).join(" ") : "";
}

function countCurriculum(course) {
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const moduleCount = Number.isFinite(Number(course?.moduleCount))
    ? finiteCount(course.moduleCount)
    : modules.length;
  const lessonCount = Number.isFinite(Number(course?.lessonCount))
    ? finiteCount(course.lessonCount)
    : modules.reduce((total, module) => total + (Array.isArray(module?.lessons) ? module.lessons.length : 0), 0);
  return { moduleCount, lessonCount };
}

export function scoreSearchRelevance(course, query) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = uniqueTokens(normalizedQuery);
  if (!queryTokens.length) return 0;

  const title = normalizeText(course?.title);
  const taxonomy = [
    course?.domain,
    course?.category,
    listText(course?.tags)
  ].join(" ");
  const outcomes = listText(course?.learningOutcomes);
  const description = course?.description || "";

  const weightedCoverage =
    tokenCoverage(title, queryTokens) * 0.45 +
    tokenCoverage(taxonomy, queryTokens) * 0.15 +
    tokenCoverage(outcomes, queryTokens) * 0.20 +
    tokenCoverage(description, queryTokens) * 0.20;
  const phraseBonus = title.includes(normalizedQuery) ? 10 : 0;

  return round(clamp(weightedCoverage * 90 + phraseBonus));
}

/**
 * Measures catalogue completeness and curriculum structure only. It is not a
 * learner-outcome or instructional-quality claim; those metrics require
 * sufficiently populated, verified outcome data.
 */
export function scoreCatalogueCompleteness(course) {
  const { moduleCount, lessonCount } = countCurriculum(course);
  const outcomes = Array.isArray(course?.learningOutcomes)
    ? course.learningOutcomes.filter((item) => String(item || "").trim()).length
    : 0;
  const descriptionLength = String(course?.description || "").trim().length;
  const tags = Array.isArray(course?.tags) ? course.tags.filter(Boolean).length : 0;

  return round(clamp(
    (String(course?.title || "").trim() ? 5 : 0) +
    (clamp(descriptionLength / 300) * 15) +
    (String(course?.category || "").trim() ? 5 : 0) +
    (String(course?.domain || "").trim() ? 5 : 0) +
    (String(course?.duration || "").trim() ? 5 : 0) +
    (clamp(tags / 3) * 5) +
    (clamp(outcomes / 5) * 20) +
    (clamp(moduleCount / 4) * 15) +
    (clamp(lessonCount / 16) * 25)
  ));
}

/**
 * Curriculum coverage is a bounded structural proxy based on outcomes,
 * modules and lesson coverage. It does not infer that a learner mastered them.
 */
export function scoreCurriculumCoverage(course) {
  const { moduleCount, lessonCount } = countCurriculum(course);
  const outcomes = Array.isArray(course?.learningOutcomes)
    ? course.learningOutcomes.filter((item) => String(item || "").trim()).length
    : 0;
  return round(clamp(
    clamp(outcomes / 5) * 35 +
    clamp(moduleCount / 5) * 25 +
    clamp(lessonCount / 20) * 40
  ));
}

export function calculateConfidenceAdjustedRating(course) {
  const reportedCount = finiteCount(course?.ratingCount);
  const reportedAverage = Number(course?.ratingAverage);
  // Never treat an invalid or absent aggregate as evidence for a low/high
  // rating. Ignore the whole aggregate and fall back to the prior instead.
  const hasValidAggregate = reportedCount > 0 &&
    Number.isFinite(reportedAverage) &&
    reportedAverage >= 1 &&
    reportedAverage <= 5;
  const count = hasValidAggregate ? reportedCount : 0;
  const rawAverage = hasValidAggregate ? reportedAverage : null;
  const priorAverage = COURSE_RANKING_POLICY.ratingPriorAverage;
  const priorStrength = COURSE_RANKING_POLICY.ratingPriorStrength;
  const observedAverage = rawAverage ?? priorAverage;
  const adjustedAverage = (
    observedAverage * count + priorAverage * priorStrength
  ) / (count + priorStrength);
  const confidence = count / (count + priorStrength);

  return {
    score: round(clamp(((adjustedAverage - 1) / 4) * 100)),
    details: {
      rawAverage: rawAverage === null ? null : round(rawAverage, 2),
      count,
      adjustedAverage: round(adjustedAverage, 2),
      confidence: round(confidence, 4),
      priorAverage,
      priorStrength
    }
  };
}

export function scorePopularity(enrollmentCount) {
  const count = finiteCount(enrollmentCount);
  const reference = COURSE_RANKING_POLICY.popularityReferenceEnrollments;
  return round(clamp((Math.log1p(count) / Math.log1p(reference)) * 100));
}

export function scoreFreshness(course, now = new Date()) {
  const createdAt = course?.createdAt ? new Date(course.createdAt).getTime() : NaN;
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(nowTime)) return 0;
  const ageDays = Math.max(0, (nowTime - createdAt) / 86400000);
  return round(clamp(100 * Math.exp(-ageDays / COURSE_RANKING_POLICY.freshnessDecayDays)));
}

export function calculateCourseRanking(course, query, { now = new Date() } = {}) {
  const rating = calculateConfidenceAdjustedRating(course);
  const components = {
    relevance: scoreSearchRelevance(course, query),
    catalogueCompleteness: scoreCatalogueCompleteness(course),
    curriculumCoverage: scoreCurriculumCoverage(course),
    confidenceAdjustedRating: rating.score,
    popularity: scorePopularity(course?.enrollmentCount),
    freshness: scoreFreshness(course, now)
  };
  const weights = COURSE_RANKING_POLICY.weights;
  const score = Object.entries(weights).reduce(
    (total, [key, weight]) => total + components[key] * weight,
    0
  ) / 100;
  const qualityScore = (
    components.catalogueCompleteness * 0.45 +
    components.curriculumCoverage * 0.25 +
    components.confidenceAdjustedRating * 0.30
  );
  const enrollmentCount = finiteCount(course?.enrollmentCount);
  const reasons = [];
  const reasonCodes = [];
  if (components.relevance >= 75) {
    reasons.push("Strong match for your search");
    reasonCodes.push("strong_search_match");
  } else if (components.relevance >= 45) {
    reasons.push("Relevant to your search");
    reasonCodes.push("search_relevance");
  }
  if (components.catalogueCompleteness >= 75) {
    reasons.push("Detailed course information");
    reasonCodes.push("detailed_catalogue");
  }
  if (components.curriculumCoverage >= 65) {
    reasons.push("Structured learning path");
    reasonCodes.push("structured_curriculum");
  }
  if (rating.details.count >= 5 && rating.details.adjustedAverage >= 4.2) {
    reasons.push("Positive learner ratings");
    reasonCodes.push("positive_learner_ratings");
  }
  if (enrollmentCount >= 100) {
    reasons.push("Popular with learners");
    reasonCodes.push("learner_popularity");
  }
  if (components.freshness >= 75) {
    reasons.push("Recently added");
    reasonCodes.push("recently_added");
  }

  return {
    version: COURSE_RANKING_POLICY.version,
    score: round(score),
    qualityScore: round(qualityScore),
    weights,
    components,
    rating: rating.details,
    enrollmentCount,
    reasonCodes,
    reasons
  };
}

function compareDateDesc(left, right) {
  const leftDate = new Date(left?.createdAt || 0).getTime();
  const rightDate = new Date(right?.createdAt || 0).getTime();
  return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
}

export function rankCoursesForSearch(courses, query, options = {}) {
  if (!Array.isArray(courses)) return [];
  const sort = ["best_match", "quality", "popular", "highest_rated", "newest"].includes(options.sort)
    ? options.sort
    : "best_match";
  const ranked = courses.map((course) => ({
    ...course,
    ranking: calculateCourseRanking(course, query, options)
  }));
  const byStableId = (left, right) =>
    String(left._id || left.id || "").localeCompare(String(right._id || right.id || ""));
  const byBestMatch = (left, right) =>
    right.ranking.score - left.ranking.score ||
    right.ranking.components.relevance - left.ranking.components.relevance;
  const byQuality = (left, right) =>
    right.ranking.qualityScore - left.ranking.qualityScore ||
    right.ranking.score - left.ranking.score;
  const byPopularity = (left, right) =>
    right.ranking.enrollmentCount - left.ranking.enrollmentCount ||
    right.ranking.qualityScore - left.ranking.qualityScore;
  const byHighestRated = (left, right) =>
    right.ranking.rating.score - left.ranking.rating.score ||
    right.ranking.rating.count - left.ranking.rating.count ||
    right.ranking.qualityScore - left.ranking.qualityScore;
  const comparator = sort === "quality" ? byQuality
    : sort === "popular" ? byPopularity
      : sort === "highest_rated" ? byHighestRated
        : sort === "newest" ? (left, right) => compareDateDesc(left, right) || byBestMatch(left, right)
          : byBestMatch;

  return ranked.sort((left, right) =>
    comparator(left, right) ||
    compareDateDesc(left, right) ||
    byStableId(left, right)
  );
}
