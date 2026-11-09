import { Course } from "../models/Course.js";
import { cacheDelete } from "../config/cache.js";
import { curateForNode } from "./nodeCuration.service.js";

function hasPlayableVideo(lesson) {
  return (lesson?.tutorial?.videos || []).some((video) =>
    String(video?.videoId || "").trim()
  );
}

export function findLessonsMissingVideoResources(course, lessonId = null) {
  const missing = [];
  for (const module of course?.modules || []) {
    for (const lesson of module.lessons || []) {
      if (lesson.type !== "tutorial" || hasPlayableVideo(lesson)) continue;
      if (lessonId && String(lesson._id || lesson.id) !== String(lessonId)) continue;
      missing.push({ module, lesson });
    }
  }
  return missing;
}

function resourceProfile(course) {
  const snapshot = course?.generation?.snapshot || {};
  const intent = snapshot.intentProfile || snapshot.intent || {};
  const preferences = intent.preferences || {};
  const languages = String(preferences.resourceLanguages || snapshot.resourceLanguages || "").split(",").map((value) => value.trim()).filter(Boolean);
  return {
    topic: String(course?.generation?.query || snapshot.canonicalTopic || course?.title || "Learning"),
    level: ["Beginner", "Intermediate", "Advanced"].includes(course?.level) ? course.level : "Beginner",
    language: String(snapshot.resourceLanguage || intent.language || languages[0] || "en")
  };
}

export async function recoverMissingTutorialResources(course, {
  lessonId = null,
  curate = curateForNode,
  invalidateCache = cacheDelete
} = {}) {
  if (!course) throw new Error("Course is required for resource recovery");
  const missing = findLessonsMissingVideoResources(course, lessonId);
  const summary = { examined: missing.length, recovered: 0, unavailable: 0, quotaLimited: false, recoveredLessonIds: [], remainingLessonIds: [] };
  if (!missing.length) return summary;

  const profile = resourceProfile(course);
  let changed = false;
  for (const { lesson } of missing) {
    lesson.tutorial = lesson.tutorial || { content: "", resources: [], videos: [] };
    const skill = {
      id: lesson.canonicalSkillId || String(lesson._id || lesson.id || lesson.title),
      canonicalSkillId: lesson.canonicalSkillId || undefined,
      name: String(lesson.title || lesson.description || profile.topic).trim(),
      searchQueries: []
    };
    let result;
    try {
      result = await curate({
        skill,
        profile,
        durationPolicy: { minMinutes: 5, targetMinutes: 30, maxMinutes: 180 },
        cacheScope: "course-resource-recovery"
      });
    } catch (error) {
      summary.unavailable += 1;
      summary.remainingLessonIds.push(String(lesson._id || lesson.id));
      if (error?.name === "QuotaBudgetError" || error?.code === "YOUTUBE_QUOTA_EXHAUSTED") {
        summary.quotaLimited = true;
        break;
      }
      continue;
    }

    const best = result?.best;
    if (!best || !String(best.videoId || "").trim()) {
      summary.unavailable += 1;
      summary.remainingLessonIds.push(String(lesson._id || lesson.id));
      if (result?.meta?.state === "quota_limited" || result?.meta?.quotaState === "exhausted") {
        summary.quotaLimited = true;
        break;
      }
      continue;
    }

    const alternatives = (result.alternatives || []).slice(0, 3).map((item) => ({
      videoId: String(item.videoId || ""),
      playlistId: String(item.playlistId || ""),
      title: String(item.title || ""),
      channelTitle: String(item.channelTitle || ""),
      durationSeconds: Math.max(0, Number(item.durationSeconds) || 0),
      thumbnail: String(item.thumbnail || ""),
      defaultAudioLanguage: String(item.defaultAudioLanguage || ""),
      fetchedAt: item.fetchedAt || new Date(),
      reason: String(item.reason || "Alternative resource")
    }));
    const video = {
      ...best,
      state: result?.meta?.lowConfidence ? "low_confidence" : "ready",
      alternatives
    };
    lesson.tutorial.videos = [video];
    const videoUrl = String(best.url || (best.videoId ? "https://www.youtube.com/watch?v=" + best.videoId : "")).trim();
    if (videoUrl && !(lesson.tutorial.resources || []).includes(videoUrl)) {
      lesson.tutorial.resources = [...(lesson.tutorial.resources || []), videoUrl];
    }
    lesson.buildState = result?.meta?.lowConfidence ? "low_confidence" : "ready";
    summary.recovered += 1;
    summary.recoveredLessonIds.push(String(lesson._id || lesson.id));
    changed = true;
  }

  const recoveredIds = new Set(summary.recoveredLessonIds);
  summary.remainingLessonIds = missing
    .map(({ lesson }) => String(lesson._id || lesson.id))
    .filter((id) => !recoveredIds.has(id));
  summary.unavailable = summary.remainingLessonIds.length;

  if (changed) {
    course.markModified?.("modules");
    course.$locals = course.$locals || {};
    course.$locals.revisionContext = {
      source: "system",
      summary: "Learning resource recovery",
      reason: "Automatically recovered missing tutorial resources"
    };
    await course.save();
    await invalidateCache("course:" + course._id);
  }
  return summary;
}

export async function recoverCourseMissingResources(courseId, options = {}) {
  const course = await Course.findById(courseId);
  if (!course || course.deletedAt) return null;
  const summary = await recoverMissingTutorialResources(course, options);
  return { summary, course };
}
