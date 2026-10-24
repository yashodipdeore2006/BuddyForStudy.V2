import { Course } from "../models/Course.js";
import { CourseCurationCache } from "../models/CourseCurationCache.js";
import { youtubeRequest } from "./youtubeGateway.js";

const STALE_DAYS = 25;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function videoIdOf(video) { return String(video?.videoId || "").trim(); }
function isUsable(item) { return Boolean(item && item.status?.privacyStatus === "public" && item.status?.embeddable !== false); }
function cleanVideo(video, apiItem, now) {
  return {
    ...video,
    videoId: apiItem.id,
    title: String(apiItem.snippet?.title || video.title || ""),
    channelTitle: String(apiItem.snippet?.channelTitle || video.channelTitle || ""),
    durationSeconds: Number(video.durationSeconds) || 0,
    thumbnail: String(apiItem.snippet?.thumbnails?.high?.url || apiItem.snippet?.thumbnails?.medium?.url || apiItem.snippet?.thumbnails?.default?.url || video.thumbnail || ""),
    fetchedAt: now
  };
}
function removeStatistics(value) {
  if (Array.isArray(value)) return value.map(removeStatistics);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(viewCount|views|likeCount|likes|subscriberCount|subscribers|commentCount|statistics)$/i.test(key)) continue;
    result[key] = removeStatistics(child);
  }
  return result;
}
function replaceOrUnavailable(video, apiItem, now) {
  if (isUsable(apiItem)) return { ...cleanVideo(video, apiItem, now), alternatives: (video.alternatives || []).map((item) => ({ ...item, fetchedAt: item.fetchedAt || now })) , state: "ready" };
  const alternative = (video.alternatives || []).find((item) => item.videoId && item.videoId !== video.videoId);
  if (alternative) return { ...alternative, alternatives: (video.alternatives || []).filter((item) => item.videoId !== alternative.videoId).slice(0, 2), fetchedAt: now, reason: "Swapped after original video became unavailable", state: "ready" };
  return { ...video, fetchedAt: now, state: "unavailable", alternatives: [] };
}
function updateCollection(collection, byId, now) {
  let changed = false;
  const updated = (collection || []).map((video) => {
    const id = videoIdOf(video);
    if (!id) return { ...video, fetchedAt: video.fetchedAt || now };
    const item = byId.get(id);
    if (!item) return video;
    changed = true;
    return replaceOrUnavailable(video, item, now);
  });
  return { updated: updated.map((video) => { const { state, ...persistable } = video; return persistable; }), changed };
}

export async function refreshStaleVideos({
  courseModel = Course,
  cacheModel = CourseCurationCache,
  request = youtubeRequest,
  now = new Date(),
  staleBefore = new Date(now.getTime() - STALE_MS)
} = {}) {
  const courses = await courseModel.find({
    $or: [
      { "modules.lessons.tutorial.videos.fetchedAt": { $lt: staleBefore } },
      { "modules.lessons.project.videos.fetchedAt": { $lt: staleBefore } },
      { "generation.snapshot.modules.course.fetchedAt": { $lt: staleBefore } }
    ]
  });
  const cacheEntries = await cacheModel.find({ kind: "node", "payload.best.fetchedAt": { $lt: staleBefore } });
  const allVideoIds = new Set();
  for (const course of courses) {
    for (const module of course.modules || []) for (const lesson of module.lessons || []) {
      for (const video of [...(lesson.tutorial?.videos || []), ...(lesson.project?.videos || [])]) if (videoIdOf(video)) allVideoIds.add(videoIdOf(video));
    }
  }
  for (const entry of cacheEntries) {
    for (const video of [entry.payload?.best, ...(entry.payload?.alternatives || [])]) if (videoIdOf(video)) allVideoIds.add(videoIdOf(video));
  }
  const byId = new Map();
  const ids = [...allVideoIds];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const data = await request("videos", { part: "snippet,contentDetails,status", id: batch.join(",") });
    for (const item of data?.items || []) byId.set(String(item.id), item);
  }
  let updatedCourses = 0;
  for (const course of courses) {
    let changed = false;
    for (const module of course.modules || []) for (const lesson of module.lessons || []) {
      if (lesson.tutorial?.videos?.length) {
        const result = updateCollection(lesson.tutorial.videos, byId, now);
        lesson.tutorial.videos = result.updated;
        changed ||= result.changed;
        if (result.updated.some((video) => !byId.has(videoIdOf(video)) && videoIdOf(video))) continue;
        if (result.updated.some((video) => video.state === "unavailable")) lesson.tutorial.resourceStatus = "unavailable";
      }
      if (lesson.project?.videos?.length) {
        const result = updateCollection(lesson.project.videos, byId, now);
        lesson.project.videos = result.updated;
        changed ||= result.changed;
      }
    }
    if (changed) {
      if (course.generation?.snapshot) course.generation.snapshot = removeStatistics(course.generation.snapshot);
      await course.save();
      updatedCourses += 1;
    }
  }
  let updatedCacheEntries = 0;
  for (const entry of cacheEntries) {
    const payload = entry.payload || {};
    const updateResource = (video) => {
      const item = byId.get(videoIdOf(video));
      return item ? replaceOrUnavailable(video, item, now) : video;
    };
    const best = payload.best ? updateResource(payload.best) : null;
    const alternatives = (payload.alternatives || []).map(updateResource);
    await cacheModel.updateOne({ _id: entry._id }, { $set: { payload: removeStatistics({ ...payload, best, alternatives }) } });
    updatedCacheEntries += 1;
  }
  return { scannedCourses: courses.length, updatedCourses, scannedNodeCacheEntries: cacheEntries.length, updatedCacheEntries, videosChecked: ids.length, batches: Math.ceil(ids.length / 50) };
}
