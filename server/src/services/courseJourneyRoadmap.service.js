import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Progress } from "../models/Progress.js";

export function parseDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return 0;
  const iso = text.match(/^pt(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const clock = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) return clock[3] !== undefined ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : Number(clock[1]) * 60 + Number(clock[2]);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/);
  return Number(hours?.[1] || 0) * 3600 + Number(minutes?.[1] || 0) * 60;
}

function lessonSeconds(lesson) {
  const video = lesson?.tutorial?.videos?.[0] || lesson?.project?.videos?.[0] || {};
  return parseDurationSeconds(video.durationSeconds || video.duration || lesson?.durationSeconds || lesson?.duration || lesson?.tutorial?.duration || lesson?.tutorial?.durationMinutes && Number(lesson.tutorial.durationMinutes) * 60);
}

function flattenModules(modules = []) {
  return modules.map((module, index) => ({
    id: String(module._id || module.id || "module-" + (index + 1)),
    title: String(module.title || "Module " + (index + 1)),
    order: Number(module.order || index + 1),
    lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
      id: String(lesson._id || lesson.id || "lesson-" + (index + 1) + "-" + (lessonIndex + 1)),
      title: String(lesson.title || "Lesson " + (lessonIndex + 1)),
      seconds: lessonSeconds(lesson)
    }))
  }));
}

function splitLessonsByDuration(lessons, count = 5) {
  if (!lessons.length) return [];
  const stageCount = Math.min(count, lessons.length);
  const total = lessons.reduce((sum, lesson) => sum + lesson.seconds, 0);
  const groups = [];
  let start = 0;
  let accumulated = 0;
  for (let stage = 0; stage < stageCount; stage += 1) {
    const remainingGroups = stageCount - stage;
    const remainingLessons = lessons.length - start;
    const target = remainingGroups > 0 ? (total - accumulated) / remainingGroups : 0;
    let end = start;
    let duration = 0;
    while (end < lessons.length && lessons.length - (end + 1) >= remainingGroups - 1) {
      const next = lessons[end].seconds;
      if (end > start && duration + next > target && Math.abs(duration - target) <= Math.abs(duration + next - target)) break;
      duration += next;
      end += 1;
      if (duration >= target && end > start) break;
    }
    if (end === start) { duration = lessons[end].seconds; end += 1; }
    const selected = lessons.slice(start, end);
    groups.push({ title: selected.length === 1 ? selected[0].title : "Stage " + (stage + 1), lessonIds: selected.map((lesson) => lesson.id), seconds: selected.reduce((sum, lesson) => sum + lesson.seconds, 0), sourceTitle: selected[0].title });
    accumulated += groups[groups.length - 1].seconds;
    start = end;
    if (start >= lessons.length) break;
  }
  if (start < lessons.length && groups.length) {
    const last = groups[groups.length - 1];
    const extra = lessons.slice(start);
    last.lessonIds.push(...extra.map((lesson) => lesson.id));
    last.seconds += extra.reduce((sum, lesson) => sum + lesson.seconds, 0);
  }
  return groups;
}

export function buildJourneyStages(modules = [], cachedStages = []) {
  const normalized = flattenModules(modules);
  const lessonLookup = new Map(normalized.flatMap((module) => module.lessons.map((lesson) => [lesson.id, lesson])));
  const totalLessons = normalized.reduce((sum, module) => sum + module.lessons.length, 0);
  if (!totalLessons) return [];
  const existing = Array.isArray(cachedStages) ? cachedStages : [];
  const validCached = existing.length > 0 && existing.every((stage) => Array.isArray(stage.lessonIds) && stage.lessonIds.every((id) => lessonLookup.has(String(id)))) && existing.reduce((sum, stage) => sum + stage.lessonIds.length, 0) === totalLessons;
  if (validCached) return existing.map((stage, index) => ({ ...stage, id: String(stage.id || "stage-" + (index + 1)), order: index + 1, lessonIds: stage.lessonIds.map(String), hours: Number(stage.hours || stage.lessonIds.reduce((sum, id) => sum + (lessonLookup.get(String(id))?.seconds || 0), 0) / 3600) }));
  const withLessons = normalized.filter((module) => module.lessons.length);
  let groups;
  if (withLessons.length > 1) {
    const targetCount = Math.min(7, Math.max(3, Math.min(5, withLessons.length)));
    groups = [];
    let current = [];
    let remainingLessons = withLessons.reduce((sum, module) => sum + module.lessons.length, 0);
    for (let i = 0; i < withLessons.length; i += 1) {
      const module = withLessons[i];
      const remainingModules = withLessons.length - i;
      const remainingStages = targetCount - groups.length;
      if (current.length && groups.length < targetCount - 1 && current.length >= Math.ceil(withLessons.length / targetCount) && remainingModules >= remainingStages) {
        groups.push(current);
        current = [];
      }
      current.push(module);
      remainingLessons -= module.lessons.length;
    }
    if (current.length) groups.push(current);
    while (groups.length > 7) groups[groups.length - 2].push(...groups.pop());
    groups = groups.map((items, index) => {
      const lessons = items.flatMap((module) => module.lessons);
      return { title: items.length === 1 ? items[0].title : "Stage " + (index + 1), sourceTitle: items.map((module) => module.title).join(" · "), lessonIds: lessons.map((lesson) => lesson.id), seconds: lessons.reduce((sum, lesson) => sum + lesson.seconds, 0) };
    });
  } else {
    const lessons = withLessons[0]?.lessons || [];
    groups = splitLessonsByDuration(lessons, 5);
  }
  return groups.map((group, index) => {
    const cached = existing.find((stage) => String(stage.id) === "stage-" + (index + 1) || stage.order === index + 1);
    return {
      id: String(cached?.id || "stage-" + (index + 1)),
      order: index + 1,
      title: String(cached?.title || group.title || "Stage " + (index + 1)).slice(0, 100),
      hours: Math.round(group.seconds / 3600 * 100) / 100,
      lessonIds: group.lessonIds,
      skills: Array.isArray(cached?.skills) ? cached.skills.slice(0, 3).map(String) : [],
      outcome: String(cached?.outcome || ""),
      emoji: cached?.emoji ? String(cached.emoji) : undefined
    };
  });
}

export function calculateJourneyProgress(stages, completedIds = [], durationsById = {}) {
  const completed = new Set(completedIds.map(String));
  const allIds = stages.flatMap((stage) => stage.lessonIds.map(String));
  const totalLessons = allIds.length;
  const completedCount = allIds.filter((id) => completed.has(id)).length;
  const stageProgress = stages.map((stage) => {
    const ids = stage.lessonIds.map(String);
    const weights = ids.map((id) => Math.max(0, Number(durationsById[id] || 0)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    if (!ids.length) return 0;
    if (totalWeight > 0) return ids.reduce((sum, id, index) => sum + (completed.has(id) ? weights[index] : 0), 0) / totalWeight;
    return ids.filter((id) => completed.has(id)).length / ids.length;
  });
  const position = stageProgress.reduce((sum, value) => sum + value, 0);
  return { completedLessonIds: allIds.filter((id) => completed.has(id)), percent: totalLessons ? Math.round(completedCount / totalLessons * 100) : 0, stageProgress, position: Math.min(stages.length, position) };
}

function fingerprintModules(modules = []) {
  return JSON.stringify((modules || []).map((module) => ({
    id: String(module._id || module.id || ""),
    title: String(module.title || ""),
    lessons: (module.lessons || []).map((lesson) => ({ id: String(lesson._id || lesson.id || ""), title: String(lesson.title || ""), duration: lessonSeconds(lesson) }))
  })));
}

export async function regenerateCourseJourney(courseId, stages = null) {
  const course = await Course.findById(courseId);
  if (!course || course.deletedAt) return null;
  const generated = Array.isArray(stages) ? stages : buildJourneyStages(course.modules || [], []);
  course.roadmap = {
    theme: course.roadmap?.theme || "trail",
    sourceFingerprint: fingerprintModules(course.modules || []),
    generatedAt: new Date(),
    stages: generated.map((stage, index) => ({
      id: String(stage.id || "stage-" + (index + 1)), order: index + 1, title: String(stage.title || "Stage " + (index + 1)).slice(0, 100),
      hours: Number(stage.hours || 0), lessonIds: (stage.lessonIds || []).map(String), skills: (stage.skills || []).slice(0, 3).map(String),
      outcome: String(stage.outcome || "").slice(0, 1000), emoji: String(stage.emoji || "")
    }))
  };
  await course.save();
  return course.roadmap;
}

export async function getCourseJourney(courseId, userId = null) {
  const course = await Course.findOne({ _id: courseId, isPublished: true, deletedAt: null }).lean();
  if (!course) return null;
  let cached = course.roadmap?.stages || [];
  if (!cached.length || course.roadmap?.sourceFingerprint !== fingerprintModules(course.modules || [])) {
    const stored = await regenerateCourseJourney(courseId);
    cached = stored?.stages || [];
  }
  const stages = buildJourneyStages(course.modules || [], cached);
  const lessonDurationById = Object.fromEntries((course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => [String(lesson._id || lesson.id), lessonSeconds(lesson)])));
  const rawHours = stages.reduce((sum, stage) => sum + stage.hours, 0);
  const courseDurationSeconds = parseDurationSeconds(course.duration);
  const estimatedHours = rawHours > 0 ? rawHours : courseDurationSeconds / 3600;
  const totalHours = Math.round(estimatedHours * 100) / 100;
  if (rawHours <= 0 && totalHours > 0 && stages.length) stages.forEach((stage) => { stage.hours = Math.round(totalHours / stages.length * 100) / 100; });
  let progress = null;
  if (userId) {
    const enrollment = await Enrollment.findOne({ user: userId, course: courseId, status: { $in: ["active", "completed"] }, revokedBy: null }).lean();
    if (enrollment) {
      const savedProgress = await Progress.findOne({ user: userId, course: courseId }).lean();
      const completedIds = (savedProgress?.completedLessons || []).map((entry) => String(entry.lessonId));
      const calculated = calculateJourneyProgress(stages, completedIds, lessonDurationById);
      const user = await import("../models/User.js").then(({ User }) => User.findById(userId).select("learningPaceHoursPerDay").lean());
      progress = {
        ...calculated,
        lastActivityAt: savedProgress?.lastAccessedAt || savedProgress?.updatedAt || null,
        paceHoursPerDay: Number(user?.learningPaceHoursPerDay || 1)
      };
    }
  }
  return { courseId: String(course._id), title: course.title, theme: course.roadmap?.theme || "trail", totalHours, stages, progress };
}
