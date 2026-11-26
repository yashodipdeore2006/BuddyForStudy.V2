import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCourseRuntime,
  selectLongFormCourses,
  toLongFormCourseCard
} from "../src/lib/longFormCourses.js";

function course(overrides = {}) {
  return {
    _id: "course-1",
    title: "Complete MERN Stack Developer Path",
    category: "Software Development & IT",
    domain: "software-development",
    tags: ["mern", "full stack"],
    isPublished: true,
    thumbnail: "https://cdn.example.com/mern.webp",
    modules: [{ title: "Foundations" }, { title: "Backend" }, { title: "Frontend" }],
    cardMetadata: {
      videoCount: 12,
      youtubeVideoCount: 12,
      youtubeRuntimeSeconds: 28 * 60 * 60 + 45 * 60
    },
    ...overrides
  };
}

test("only published technology courses with verified 20-hour YouTube runtime qualify", () => {
  const selected = selectLongFormCourses([
    course(),
    course({ _id: "unpublished", isPublished: false }),
    course({ _id: "short", cardMetadata: { youtubeRuntimeSeconds: 19 * 60 * 60 + 59 * 60 } }),
    course({ _id: "unknown-runtime", cardMetadata: {} }),
    course({ _id: "no-modules", modules: [] }),
    course({ _id: "non-tech", title: "Complete Italian Cooking", category: "Cooking", domain: "other-learning", tags: [] })
  ]);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "course-1");
});

test("course card metadata uses real module count, verified runtime and an inferred domain tag", () => {
  const selected = toLongFormCourseCard(course({
    title: "Build Production AI Agents with RAG",
    category: "Data, Analytics & AI",
    domain: "data-ai",
    tags: ["agents", "RAG"],
    modules: Array.from({ length: 8 }, (_, index) => ({ title: "Module " + (index + 1) }))
  }));

  assert.equal(selected.domainTag, "AI Agents");
  assert.equal(selected.durationLabel, "28h 45m");
  assert.equal(selected.moduleCount, 8);
  assert.equal(selected.thumbnailUrl, "https://cdn.example.com/mern.webp");
});

test("DSA topics receive a focused tag and exactly 20 verified hours qualify", () => {
  const selected = toLongFormCourseCard(course({
    title: "Data Structures and Algorithms in JavaScript",
    category: "Computer Science",
    domain: "science-mathematics",
    cardMetadata: { youtubeRuntimeSeconds: 20 * 60 * 60 },
    thumbnail: "javascript:alert(1)"
  }));

  assert.equal(selected.domainTag, "DSA");
  assert.equal(selected.durationLabel, "20h");
  assert.equal(selected.thumbnailUrl, null);
});

test("duration formatting rounds to minutes and carries into the next hour", () => {
  assert.equal(formatCourseRuntime(28 * 3600 + 45 * 60 + 20), "28h 45m");
  assert.equal(formatCourseRuntime(59 * 60 + 40), "1h");
  assert.equal(formatCourseRuntime(0), "");
});


test("showcase caps at ten real eligible courses without filling missing entries", () => {
  const courses = Array.from({ length: 12 }, (_, index) => course({
    _id: "real-course-" + index,
    title: "MERN Engineering Course " + index
  }));
  const selected = selectLongFormCourses(courses);
  assert.equal(selected.length, 10);
  assert.equal(selected[0].id, "real-course-0");
  assert.equal(selected[9].id, "real-course-9");
});


test("course cards use module count from the public list projection", () => {
  const selected = toLongFormCourseCard(course({
    modules: [],
    moduleCount: 6
  }));
  assert.equal(selected.moduleCount, 6);
});
