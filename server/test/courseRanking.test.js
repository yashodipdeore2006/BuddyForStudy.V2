import test from "node:test";
import assert from "node:assert/strict";
import {
  COURSE_RANKING_POLICY,
  calculateConfidenceAdjustedRating,
  calculateCourseRanking,
  rankCoursesForSearch,
  scorePopularity
} from "../src/utils/courseRanking.js";

const NOW = new Date("2026-11-26T10:00:00.000Z");

function course(overrides = {}) {
  return {
    _id: "course-1",
    title: "React Complete Course",
    description: "Build interactive web applications using React and modern JavaScript.",
    category: "Web Development",
    domain: "software-development",
    tags: ["react", "frontend", "javascript"],
    level: "Beginner",
    duration: "20 hours",
    learningOutcomes: ["Build components", "Manage state", "Create React applications", "Use hooks"],
    moduleCount: 4,
    lessonCount: 16,
    ratingAverage: 4.7,
    ratingCount: 80,
    enrollmentCount: 250,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("ranking policy is versioned and its weights sum to 100", () => {
  assert.equal(COURSE_RANKING_POLICY.version, "course-ranking-v1");
  assert.equal(Object.values(COURSE_RANKING_POLICY.weights).reduce((sum, weight) => sum + weight, 0), 100);
});

test("search relevance rewards title and topic matches deterministically", () => {
  const strong = calculateCourseRanking(course(), "React complete course", { now: NOW });
  const weak = calculateCourseRanking(course({
    title: "Introduction to Business Management",
    category: "Business",
    domain: "business-management",
    tags: ["management"],
    learningOutcomes: ["Understand leadership"]
  }), "React complete course", { now: NOW });

  assert.ok(strong.components.relevance > weak.components.relevance);
  assert.equal(strong.version, COURSE_RANKING_POLICY.version);
  assert.equal(calculateCourseRanking(course(), "React complete course", { now: NOW }).score, strong.score);
});

test("confidence-adjusted ratings shrink small samples toward the neutral prior", () => {
  const oneReview = calculateConfidenceAdjustedRating({ ratingAverage: 5, ratingCount: 1 });
  const established = calculateConfidenceAdjustedRating({ ratingAverage: 4.7, ratingCount: 150 });
  const noReviews = calculateConfidenceAdjustedRating({ ratingAverage: 0, ratingCount: 0 });

  assert.ok(oneReview.details.adjustedAverage < 5);
  assert.ok(established.details.adjustedAverage > oneReview.details.adjustedAverage);
  assert.equal(noReviews.details.adjustedAverage, COURSE_RANKING_POLICY.ratingPriorAverage);
  assert.equal(noReviews.details.confidence, 0);
  assert.equal(oneReview.details.priorStrength, 10);
});

test("popularity grows logarithmically with diminishing returns", () => {
  const earlyGrowth = scorePopularity(20) - scorePopularity(10);
  const laterGrowth = scorePopularity(110) - scorePopularity(100);
  assert.ok(earlyGrowth > laterGrowth);
  assert.ok(scorePopularity(10000) <= 100);
});

test("catalogue completeness and curriculum coverage remain bounded", () => {
  const sparse = calculateCourseRanking(course({
    description: "Short",
    domain: null,
    tags: [],
    learningOutcomes: [],
    moduleCount: 0,
    lessonCount: 0
  }), "React", { now: NOW });
  const complete = calculateCourseRanking(course(), "React", { now: NOW });

  assert.ok(complete.components.catalogueCompleteness > sparse.components.catalogueCompleteness);
  assert.ok(complete.components.curriculumCoverage > sparse.components.curriculumCoverage);
  for (const value of Object.values(complete.components)) {
    assert.ok(value >= 0 && value <= 100);
  }
});

test("search ranking sorts the full candidate set before pagination and uses deterministic tie-breakers", () => {
  const items = [
    course({ _id: "weak", title: "Java Course", createdAt: "2026-10-01T00:00:00.000Z" }),
    course({ _id: "strong", title: "React Complete Course", createdAt: "2026-09-01T00:00:00.000Z" })
  ];
  const ranked = rankCoursesForSearch(items, "React complete course", { now: NOW });

  assert.deepEqual(ranked.map((item) => item._id), ["strong", "weak"]);
  assert.ok(ranked.every((item) => item.ranking.version === "course-ranking-v1"));
  assert.notEqual(ranked[0].ranking.score, undefined);
});
