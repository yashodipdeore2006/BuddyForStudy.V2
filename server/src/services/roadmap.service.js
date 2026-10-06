import { LearningRoadmap } from "../models/LearningRoadmap.js";

function flattenLessons(course) {
  let order = 0;
  return (course.modules || []).flatMap((module) =>
    (module.lessons || []).map((lesson) => ({
      lessonId: String(lesson.id || lesson._id || `module-${module.order || "x"}-lesson-${lesson.order || (++order)}`),
      title: lesson.title,
      type: lesson.type,
      moduleTitle: module.title,
      order: ++order
    }))
  );
}

function decorate(roadmap) {
  const data = roadmap.toObject ? roadmap.toObject() : roadmap;
  const total = data.lessons?.length || 0;
  const completed = data.completedLessonIds?.length || 0;
  return { ...data, progress: { completedCount: completed, totalLessons: total, percentage: total ? Math.round((completed / total) * 100) : 0 } };
}

export async function saveRoadmap(userId, input) {
  const roadmap = await LearningRoadmap.create({
    user: userId, query: input.query, canonicalTopic: input.canonicalTopic,
    intent: input.intent, careerOutcome: input.careerOutcome,
    level: input.course.level || input.level || "Beginner",
    course: input.course, skillGraph: input.skillGraph || [],
    lessons: flattenLessons(input.course)
  });
  return decorate(roadmap);
}

export async function listRoadmaps(userId) {
  const roadmaps = await LearningRoadmap.find({ user: userId }).sort({ updatedAt: -1 }).lean();
  return roadmaps.map(decorate);
}

export async function getRoadmap(userId, roadmapId) {
  const roadmap = await LearningRoadmap.findOne({ _id: roadmapId, user: userId });
  if (!roadmap) { const error = new Error("Learning roadmap not found"); error.status = 404; throw error; }
  roadmap.lastAccessedAt = new Date();
  await roadmap.save();
  return decorate(roadmap);
}

export async function completeLesson(userId, roadmapId, lessonId) {
  const roadmap = await LearningRoadmap.findOne({ _id: roadmapId, user: userId });
  if (!roadmap) { const error = new Error("Learning roadmap not found"); error.status = 404; throw error; }
  if (!roadmap.lessons.some((lesson) => lesson.lessonId === lessonId)) {
    const error = new Error("Roadmap lesson not found"); error.status = 404; throw error;
  }
  if (!roadmap.completedLessonIds.includes(lessonId)) roadmap.completedLessonIds.push(lessonId);
  roadmap.lastLessonId = lessonId;
  roadmap.lastAccessedAt = new Date();
  if (roadmap.completedLessonIds.length >= roadmap.lessons.length && roadmap.lessons.length) {
    roadmap.status = "completed";
    roadmap.completedAt ||= new Date();
  }
  await roadmap.save();
  return decorate(roadmap);
}