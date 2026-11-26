import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCoursesByInferredDomain,
  inferCourseDomain
} from "../src/utils/courseTaxonomy.js";
import { rankCoursesForSearch } from "../src/utils/courseRanking.js";
import {
  CROSS_DOMAIN_COURSES,
  DISCOVERY_FIXTURE_NOW,
  QUALITY_ORDER_COURSES,
  RATING_CONFIDENCE_COURSES
} from "./fixtures/courseDiscoveryRanking.fixtures.js";

function paginationCourse(index) {
  return {
    _id: "pagination-course-" + String(index).padStart(3, "0"),
    title: "React Course " + String(index).padStart(3, "0"),
    description: "Learn React components, hooks, application state and frontend development.",
    category: "Web Development",
    domain: "software-development",
    tags: ["react", "frontend"],
    level: "Beginner",
    duration: "10 hours",
    learningOutcomes: ["Build React applications", "Use components", "Manage state"],
    moduleCount: 2 + (index % 5),
    lessonCount: 5 + (index % 17),
    ratingAverage: 3.5 + (index % 15) / 10,
    ratingCount: index % 8 === 0 ? 1 : 20 + index,
    enrollmentCount: (index * 37) % 1300,
    createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString()
  };
}

test("[DISC-005-CROSS-DOMAIN] React intent excludes known data-domain courses and preserves unknown legacy records", () => {
  const inferredDomain = inferCourseDomain("React complete tutorial");
  assert.equal(inferredDomain, "software-development");

  const results = filterCoursesByInferredDomain(CROSS_DOMAIN_COURSES, inferredDomain);
  assert.deepEqual(
    results.map((course) => course._id).sort(),
    ["react-software-course", "unknown-legacy-react-course"]
  );

  // Explicit canonical metadata wins over a conflicting legacy category alias.
  assert.equal(
    results.some((course) => course._id === "contradictory-domain-metadata"),
    false
  );

  // An ambiguous, cross-domain query must not invent a domain boundary.
  assert.equal(inferCourseDomain("React for Data Analytics"), null);
  assert.equal(filterCoursesByInferredDomain(CROSS_DOMAIN_COURSES, null).length, CROSS_DOMAIN_COURSES.length);
});

test("[DISC-005-LOW-REVIEW] one perfect review cannot outrank established 4.7-star feedback", () => {
  const ranked = rankCoursesForSearch(
    RATING_CONFIDENCE_COURSES,
    "React",
    { sort: "highest_rated", now: DISCOVERY_FIXTURE_NOW }
  );
  assert.equal(ranked[0]._id, "established-4-7-rating");

  const lowSample = ranked.find((course) => course._id === "one-five-star-review");
  const established = ranked.find((course) => course._id === "established-4-7-rating");
  assert.equal(lowSample.ranking.rating.rawAverage, 5);
  assert.equal(lowSample.ranking.rating.confidence, 0.0909);
  assert.ok(lowSample.ranking.rating.adjustedAverage < established.ranking.rating.adjustedAverage);
});

test("[DISC-005-QUALITY] structural completeness wins the quality sort without overstating learning outcomes", () => {
  const ranked = rankCoursesForSearch(
    QUALITY_ORDER_COURSES,
    "",
    { sort: "quality", now: DISCOVERY_FIXTURE_NOW }
  );
  assert.equal(ranked[0]._id, "complete-structured-course");
  assert.ok(ranked[0].ranking.qualityScore > ranked[1].ranking.qualityScore);
  assert.equal(ranked[0].ranking.components.curriculumCoverage, 100);
  assert.ok(ranked.every((course) => course.ranking.version === "course-ranking-v1"));
});

test("[DISC-005-PAGINATION] rank the entire filtered candidate set before slicing stable pages", () => {
  const candidates = Array.from({ length: 37 }, (_, index) => paginationCourse(index));
  const ranked = rankCoursesForSearch(candidates, "React Course", {
    sort: "best_match",
    now: DISCOVERY_FIXTURE_NOW
  });
  const pages = [];
  const pageSize = 6;
  for (let offset = 0; offset < ranked.length; offset += pageSize) {
    pages.push(ranked.slice(offset, offset + pageSize).map((course) => course._id));
  }

  assert.equal(pages.length, 7);
  assert.deepEqual(pages.flat(), ranked.map((course) => course._id));
  assert.equal(new Set(pages.flat()).size, candidates.length);
  assert.equal(pages[6].length, 1);

  const reversed = rankCoursesForSearch([...candidates].reverse(), "React Course", {
    sort: "best_match",
    now: DISCOVERY_FIXTURE_NOW
  });
  assert.deepEqual(reversed.map((course) => course._id), ranked.map((course) => course._id));

  // An excellent match placed at the end of the unsorted candidate set must
  // still move into the first page after full-set ranking.
  const strongest = paginationCourse(99);
  strongest._id = "late-arriving-strongest-match";
  strongest.title = "React Course Complete";
  strongest.description = "React Course Complete";
  const withLateMatch = rankCoursesForSearch([...candidates, strongest], "React Course Complete", {
    sort: "best_match",
    now: DISCOVERY_FIXTURE_NOW
  });
  assert.equal(withLateMatch[0]._id, "late-arriving-strongest-match");
});

test("[DISC-005-RELEVANCE] relevant candidates remain ahead even when weaker candidates are more popular", () => {
  const relevant = {
    ...paginationCourse(1),
    _id: "relevant-react-course",
    title: "React Complete Course",
    enrollmentCount: 2
  };
  const irrelevant = {
    ...paginationCourse(2),
    _id: "weak-topic-match",
    title: "Introduction to Unrelated Office Tools",
    description: "General productivity and presentation software.",
    category: "Productivity",
    domain: "productivity-tools",
    tags: ["office"],
    enrollmentCount: 100000
  };
  const ranked = rankCoursesForSearch([irrelevant, relevant], "React Complete Course", {
    sort: "best_match",
    now: DISCOVERY_FIXTURE_NOW
  });
  assert.equal(ranked[0]._id, "relevant-react-course");
  assert.ok(ranked[0].ranking.components.relevance > ranked[1].ranking.components.relevance);
});
