import { Course } from "../models/Course.js";
import { CourseCurationCache } from "../models/CourseCurationCache.js";
import { youtubeRequest } from "./youtubeGateway.js";

const STALE_MS = 25 * 24 * 60 * 60 * 1000;
const videoIdOf = (video) => String(video?.videoId || "").trim();
const isVideoObject = (value) => value && typeof value === "object" && Boolean(value.videoId || value.playlistId);
const isUsable = (item) => Boolean(item && item.status?.privacyStatus === "public" && item.status?.embeddable !== false);

function stripStatistics(value) {
  if (Array.isArray(value)) return value.map(stripStatistics);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(viewCount|views|likeCount|likes|subscriberCount|subscribers|commentCount|statistics)$/i.test(key)) continue;
    output[key] = stripStatistics(child);
  }
  return output;
}
function parseDurationSeconds(value) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}
function chooseReplacement(video, apiItem, now, byId = new Map()) {
  if (isUsable(apiItem)) {
    const alternatives = (video.alternatives || []).map((item) => {
      const id = videoIdOf(item);
      if (!id || !byId.has(id)) return item;
      const alternativeItem = byId.get(id);
      if (!isUsable(alternativeItem)) return null;
      return chooseReplacement({ ...item, alternatives: [] }, alternativeItem, now, new Map());
    }).filter(Boolean).slice(0, 2);
    return {
      ...video,
      alternatives,
      videoId: apiItem.id,
      title: String(apiItem.snippet?.title || video.title || ""),
      channelTitle: String(apiItem.snippet?.channelTitle || video.channelTitle || ""),
      thumbnail: String(apiItem.snippet?.thumbnails?.high?.url || apiItem.snippet?.thumbnails?.medium?.url || apiItem.snippet?.thumbnails?.default?.url || video.thumbnail || ""),
      durationSeconds: parseDurationSeconds(apiItem.contentDetails?.duration) || Number(video.durationSeconds) || 0,
      publishedAt: apiItem.snippet?.publishedAt || video.publishedAt || null,
      fetchedAt: now,
      state: "ready"
    };
  }
  const replacement = (video.alternatives || []).find((item) => item.videoId && item.videoId !== video.videoId && item.state !== "unavailable");
  if (replacement) {
    const remainingAlternatives = (video.alternatives || []).filter((item) => item.videoId !== replacement.videoId).slice(0, 2);
    const replacementId = String(replacement.videoId);
    const refreshed = byId.has(replacementId)
      ? chooseReplacement({ ...replacement, alternatives: remainingAlternatives }, byId.get(replacementId), now, byId)
      : { ...replacement, alternatives: remainingAlternatives, fetchedAt: replacement.fetchedAt || now, state: "ready" };
    return { ...refreshed, reason: "Swapped after the selected YouTube video became unavailable", state: refreshed.state || "ready" };
  }
  return { ...video, fetchedAt: now, state: "unavailable", alternatives: [] };
}
function transformTree(value, byId, now) {
  if (Array.isArray(value)) return value.map((item) => transformTree(item, byId, now));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const plain = typeof value.toObject === "function" ? value.toObject() : value;
  if (isVideoObject(plain) && videoIdOf(plain) && byId.has(videoIdOf(plain))) {
    const result = chooseReplacement(plain, byId.get(videoIdOf(plain)), now, byId);
    return stripStatistics(result);
  }
  const output = {};
  for (const [key, child] of Object.entries(plain)) output[key] = transformTree(child, byId, now);
  return output;
}
function collectStaleVideoIds(value, staleBefore, ids) {
  if (Array.isArray(value)) { for (const item of value) collectStaleVideoIds(item, staleBefore, ids); return; }
  if (!value || typeof value !== "object" || value instanceof Date) return;
  const plain = typeof value.toObject === "function" ? value.toObject() : value;
  if (isVideoObject(plain) && videoIdOf(plain) && (!plain.fetchedAt || new Date(plain.fetchedAt) < staleBefore)) ids.add(videoIdOf(plain));
  for (const child of Object.values(plain)) collectStaleVideoIds(child, staleBefore, ids);
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
      { "modules.lessons.tutorial.videos.fetchedAt": { $exists: false } },
      { "modules.lessons.project.videos.fetchedAt": { $lt: staleBefore } },
      { "modules.lessons.project.videos.fetchedAt": { $exists: false } },
      { "generation.snapshot": { $exists: true, $ne: null } }
    ]
  });
  const cacheEntries = await cacheModel.find({
    kind: "node",
    $or: [
      { "payload.best.fetchedAt": { $lt: staleBefore } },
      { "payload.best.fetchedAt": { $exists: false } },
      { "payload.alternatives": { $elemMatch: { fetchedAt: { $lt: staleBefore } } } },
      { "payload.alternatives": { $elemMatch: { fetchedAt: { $exists: false } } } }
    ]
  });
  const ids = new Set();
  for (const course of courses) {
    collectStaleVideoIds(course.modules || [], staleBefore, ids);
    collectStaleVideoIds(course.generation?.snapshot, staleBefore, ids);
  }
  for (const entry of cacheEntries) collectStaleVideoIds(entry.payload, staleBefore, ids);

  const byId = new Map();
  const videoIds = [...ids];
  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);
    const response = await request("videos", { part: "snippet,contentDetails,status", id: batch.join(",") });
    const returned = new Map((response?.items || []).map((item) => [String(item.id), item]));
    for (const id of batch) byId.set(id, returned.get(id) || null);
  }

  let updatedCourses = 0;
  for (const course of courses) {
    const before = JSON.stringify({
      modules: typeof course.modules?.toObject === "function" ? course.modules.toObject() : course.modules,
      snapshot: course.generation?.snapshot
    });
    course.modules = transformTree(course.modules || [], byId, now);
    for (const module of course.modules || []) for (const lesson of module.lessons || []) {
      if (lesson.tutorial?.videos?.some((video) => video.state === "unavailable")) lesson.tutorial.resourceStatus = "unavailable";
      if (lesson.project?.videos?.some((video) => video.state === "unavailable")) lesson.project.resourceStatus = "unavailable";
    }
    course.modules = stripStatistics(course.modules);
    if (course.generation?.snapshot) course.generation.snapshot = stripStatistics(transformTree(course.generation.snapshot, byId, now));
    const after = JSON.stringify({ modules: course.modules, snapshot: course.generation?.snapshot });
    if (before !== after) {
      await course.save();
      updatedCourses += 1;
    }
  }

  let updatedCacheEntries = 0;
  for (const entry of cacheEntries) {
    const original = JSON.stringify(entry.payload || {});
    const payload = stripStatistics(transformTree(entry.payload || {}, byId, now));
    if (JSON.stringify(payload) === original) continue;
    await cacheModel.updateOne({ _id: entry._id }, { $set: { payload } });
    updatedCacheEntries += 1;
  }
  return {
    scannedCourses: courses.length,
    updatedCourses,
    scannedNodeCacheEntries: cacheEntries.length,
    updatedCacheEntries,
    videosChecked: videoIds.length,
    batches: Math.ceil(videoIds.length / 50)
  };
}

export const __youtubeComplianceTestUtils = { chooseReplacement, collectStaleVideoIds, transformTree };
