/**
 * Helpers for server-paginated Explore results.
 * Keep ordering from the server while avoiding duplicates across overlapping pages.
 */
export function hasMoreCoursePages(page, pages, batchLength, pageSize) {
  const currentPage = Number(page);
  const totalPages = Number(pages);
  const received = Number(batchLength);
  const size = Number(pageSize);

  if (!Number.isInteger(currentPage) || currentPage < 1) return false;
  if (!Number.isFinite(received) || received <= 0) return false;
  if (Number.isFinite(totalPages) && totalPages >= 0) return currentPage < totalPages;
  return Number.isFinite(size) && size > 0 && received >= size;
}

export function appendUniqueCourses(current, next) {
  const merged = new Map();
  for (const course of Array.isArray(current) ? current : []) {
    const id = String(course?.id ?? course?._id ?? "").trim();
    if (id) merged.set(id, course);
  }
  for (const course of Array.isArray(next) ? next : []) {
    const id = String(course?.id ?? course?._id ?? "").trim();
    if (id) merged.set(id, { ...merged.get(id), ...course });
  }
  return [...merged.values()];
}
