import { evaluateCourseReadiness } from "./courseReadiness.js";

// Returns the readiness report only when a request would transition a draft into published state.
export function getCoursePublishBlock(course, currentlyPublished = Boolean(course?.isPublished)) {
  if (!course || currentlyPublished) return null;
  const readiness = evaluateCourseReadiness(course);
  return readiness.ready ? null : readiness;
}
