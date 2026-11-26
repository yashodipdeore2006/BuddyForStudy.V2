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
  assert.equal(noReviews.details.adjustedAverage, 3.5);
  assert.equal(noReviews.details.confidence, 0);
  assert.equal(oneReview.details.priorStrength, 10);
});

test("invalid rating aggregates fall back to the prior without confidence", () => {
  for (const invalid of [
    { ratingAverage: 0, ratingCount: 40 },
    { ratingAverage: 6, ratingCount: 40 },
    { ratingAverage: "not-a-number", ratingCount: 40 },
    { ratingAverage: 4.5, ratingCount: -4 }
  ]) {
    const result = calculateConfidenceAdjustedRating(invalid);
    assert.equal(result.details.adjustedAverage, COURSE_RANKING_POLICY.ratingPriorAverage);
    assert.equal(result.details.count, 0);
    assert.equal(result.details.confidence, 0);
  }
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

test("all supported sort modes are deterministic and retain ranking explanations", () => {
  const items = [
    course({
      _id: "popular",
      title: "React popular course",
      enrollmentCount: 1200,
      ratingAverage: 4.1,
      ratingCount: 40,
      createdAt: "2026-02-01T00:00:00.000Z"
    }),
    course({
      _id: "quality",
      title: "React structured course",
      enrollmentCount: 30,
      ratingAverage: 3.7,
      ratingCount: 25,
      moduleCount: 7,
      lessonCount: 30,
      learningOutcomes: ["One", "Two", "Three", "Four", "Five"],
      description: "A detailed course description with prerequisites, learning structure, practice and examples."
    }),
    course({
      _id: "rated",
      title: "React highly rated course",
      enrollmentCount: 50,
      ratingAverage: 4.9,
      ratingCount: 300,
      createdAt: "2026-03-01T00:00:00.000Z"
    }),
    course({
      _id: "newest",
      title: "React newest course",
      enrollmentCount: 5,
      ratingAverage: 3.5,
      ratingCount: 0,
      createdAt: "2026-11-20T00:00:00.000Z"
    })
  ];

  assert.equal(rankCoursesForSearch(items, "React", { sort: "popular", now: NOW })[0]._id, "popular");
  assert.equal(rankCoursesForSearch(items, "React", { sort: "quality", now: NOW })[0]._id, "quality");
  assert.equal(rankCoursesForSearch(items, "React", { sort: "highest_rated", now: NOW })[0]._id, "rated");
  assert.equal(rankCoursesForSearch(items, "React", { sort: "newest", now: NOW })[0]._id, "newest");
  assert.ok(rankCoursesForSearch(items, "React", { sort: "best_match", now: NOW })[0].ranking.score >= 0);

  const explained = calculateCourseRanking(course(), "React", { now: NOW });
  assert.ok(explained.qualityScore >= 0 && explained.qualityScore <= 100);
  assert.ok(explained.reasons.includes("Structured learning path"));
  assert.ok(explained.reasonCodes.includes("structured_curriculum"));
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
