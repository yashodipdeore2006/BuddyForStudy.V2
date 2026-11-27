import assert from "node:assert/strict";
import test from "node:test";
import { appendUniqueCourses, hasMoreCoursePages } from "../src/lib/courseCatalogPagination.js";

test("server page count is authoritative when available", () => {
  assert.equal(hasMoreCoursePages(1, 8, 24, 24), true);
  assert.equal(hasMoreCoursePages(7, 8, 24, 24), true);
  assert.equal(hasMoreCoursePages(8, 8, 24, 24), false);
  assert.equal(hasMoreCoursePages(1, 0, 0, 24), false);
  assert.equal(hasMoreCoursePages(1, 8, 0, 24), false);
});

test("page size is the fallback when the API omits pagination metadata", () => {
  assert.equal(hasMoreCoursePages(1, undefined, 24, 24), true);
  assert.equal(hasMoreCoursePages(2, undefined, 7, 24), false);
  assert.equal(hasMoreCoursePages(0, undefined, 24, 24), false);
});

test("course pages append in server order and deduplicate overlapping IDs", () => {
  const merged = appendUniqueCourses(
    [{ id: "a", title: "Old A" }, { id: "b", title: "B" }],
    [{ id: "b", title: "Updated B" }, { _id: "c", title: "C" }, { title: "Missing ID" }]
  );

  assert.deepEqual(merged, [
    { id: "a", title: "Old A" },
    { id: "b", title: "Updated B" },
    { _id: "c", title: "C" }
  ]);
});
