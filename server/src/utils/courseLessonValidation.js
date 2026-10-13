const SUPPORTED_LESSON_TYPES = new Set(["tutorial", "project", "quiz"]);

export function validateNewLessonInput(body = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { valid: false, error: "Learning item title is required" };
  if (title.length > 200) return { valid: false, error: "Learning item title must be 200 characters or fewer" };
  if (body.type !== undefined && !SUPPORTED_LESSON_TYPES.has(body.type)) {
    return { valid: false, error: "Learning item type must be tutorial, project, or quiz" };
  }
  const description = body.description === undefined ? "" : body.description;
  if (typeof description !== "string") {
    return { valid: false, error: "Learning item description must be text" };
  }
  return { valid: true, value: { title, type: body.type || "tutorial", description: description.trim() } };
}
