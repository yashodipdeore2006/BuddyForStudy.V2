import { Course } from "../models/Course.js";
import { CourseCurationCache } from "../models/CourseCurationCache.js";
import { youtubeRequest } from "./youtubeGateway.js";

const STALE_MS = 25 * 24 * 60 * 60 * 1000;
const videoIdOf = (video) => String(video?.videoId || "").trim();
const isVideoObject = (value) => value && typeof value === "object" && (value.videoId || value.playlistId) && (Object.hasOwn(value, "title") || Object.hasOwn(value, "durationSeconds") || Object.hasOwn(value, "channelTitle"));
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
function chooseReplacement(video, apiItem, now) {
  if (isUsable(apiItem)) {
    return {
      ...video,
      videoId: apiItem.id,
      title: String(apiItem.snippet?.title || video.title || ""),
      channelTitle: String(apiItem.snippet?.channelTitle || video.channelTitle || ""),
      thumbnail: String(apiItem.snippet?.thumbnails?.high?.url || apiItem.snippet?.thumbnails?.medium?.url || apiItem.snippet?.thumbnails?.default?.url || video.thumbnail || ""),
      fetchedAt: now,
      state: "ready"
    };
  }
  const replacement = (video.alternatives || []).find((item) => item.videoId && item.videoId !== video.videoId && item.state !== "unavailable");
  if (replacement) return { ...replacement, alternatives: (video.alternatives || []).filter((item) => item.videoId !== replacement.videoId).slice(0, 2), fetchedAt: now, reason: "Swapped after the selected YouTube video became unavailable", state: "ready" };
  return { ...video, fetchedAt: now, state: "unavailable", alternatives: [] };
}
function transformTree(value, byId, now) {
  if (Array.isArray(value)) return value.map((item) => transformTree(item, byId, now));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const plain = typeof value.toObject === "function" ? value.toObject() : value;
  if (isVideoObject(plain) && videoIdOf(plain) && byId.has(videoIdOf(plain))) {
    const result = chooseReplacement(plain, byId.get(videoIdOf(plain)), now);
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
      { "modules.lessons.project.videos.fetchedAt": { $lt: staleBefore } },
      { "generation.snapshot": { $exists: true, $ne: null } }
    ]
  });
  const cacheEntries = await cacheModel.find({ kind: "node" });
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
    const stripTransientState = (value) => {
      if (Array.isArray(value)) return value.map(stripTransientState);
      if (!value || typeof value !== "object" || value instanceof Date) return value;
      const output = {};
      for (const [key, child] of Object.entries(value)) if (key !== "state") output[key] = stripTransientState(child);
      return output;
    };
    course.modules = stripStatistics(stripTransientState(course.modules));
    if (course.generation?.snapshot) course.generation.snapshot = stripStatistics(stripTransientState(transformTree(course.generation.snapshot, byId, now)));
    const after = JSON.stringify({ modules: course.modules, snapshot: course.generation?.snapshot });
    if (before !== after) {
      await course.save();
      updatedCourses += 1;
    }
  }

  let updatedCacheEntries = 0;
  for (const entry of cacheEntries) {
    const payload = stripStatistics(transformTree(entry.payload || {}, byId, now));
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
