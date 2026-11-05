import type { Course } from "@/types";

const GENERIC_DESCRIPTION = /^(?:an ai[- ]assembled|ai[- ]selected|ai[- ]generated|this course covers the following|a buddyforstudy course built from|a comprehensive curriculum designed|a comprehensive path from|a comprehensive deep-dive into|a comprehensive course|a course built from|course overview|course description)\b/i;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isUsefulDescription(value: string, courseTitle: string): boolean {
  if (value.length < 12 || GENERIC_DESCRIPTION.test(value)) return false;
  const normalized = value.toLocaleLowerCase().replace(/[.!?…]+$/, "");
  const normalizedTitle = normalizeText(courseTitle).toLocaleLowerCase().replace(/[.!?…]+$/, "");
  if (normalized === normalizedTitle) return false;
  if (normalized === "learn " + normalizedTitle) return false;
  return true;
}

/**
 * Return meaningful card copy from authored course content when available.
 * Legacy/catalogue courses sometimes have empty or auto-generated descriptions;
 * in that case, use learning outcomes or topics before a factual title/level fallback.
 */
export function getCourseCardDescription(course: Course): string {
  const title = normalizeText(course.title) || "this subject";
  const candidates: string[] = [
    normalizeText(course.description),
    ...(Array.isArray(course.learning_outcomes) ? course.learning_outcomes.map(normalizeText) : []),
    ...(Array.isArray(course.modules) ? course.modules.flatMap((module) => [
      normalizeText(module?.description),
      ...(Array.isArray(module?.lessons) ? module.lessons.flatMap((lesson) => [
        normalizeText(lesson?.description),
        ...(Array.isArray(lesson?.tutorial?.videos) ? lesson.tutorial.videos.map((video) => normalizeText(video?.title)) : []),
      ]) : []),
    ]) : []),
  ].filter(Boolean);

  const selected = candidates.find((candidate) => isUsefulDescription(candidate, title));
  if (selected) return selected;

  const topics = Array.isArray(course.modules)
    ? [...new Set(course.modules
      .flatMap((module) => [
        normalizeText(module?.title),
        ...(Array.isArray(module?.lessons) ? module.lessons.map((lesson) => normalizeText(lesson?.title)) : []),
      ])
      .filter((topic) => topic && topic.toLocaleLowerCase() !== title.toLocaleLowerCase())
      .filter((topic) => !/^(introduction|overview|conclusion|resources|getting started)$/i.test(topic)))]
      .slice(0, 2)
    : [];

  if (topics.length) return "Topics include " + topics.join(" and ") + ".";
  const level = normalizeText(course.level).toLocaleLowerCase();
  return (level ? "A " + level + "-level course focused on " : "A course focused on ") + title + ".";
}
