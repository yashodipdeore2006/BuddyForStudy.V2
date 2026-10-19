import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { getYouTubeVideoResource, searchBestYouTubeCourse } from "./youtube.service.js";
import { Course } from "../models/Course.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { buildTopicKeys, findRecentGeneratedCourse } from "./generatedCourseCache.service.js";

const cache = new Map();
const aiClient = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

const searchSpecSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    title: { type: "string" },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          searchQueries: { type: "array", items: { type: "string" } },
          requiredTopics: { type: "array", items: { type: "string" } },
          searchPolicy: {
            type: "object",
            properties: {
              minDurationMinutes: { type: "integer" },
              targetDurationMinutes: { type: "integer" },
              maxDurationMinutes: { type: "integer" },
              excludeShorts: { type: "boolean" },
              requireEmbeddable: { type: "boolean" },
              preferProjectBased: { type: "boolean" },
              preferredLanguage: { type: "string" }
            },
            required: [
              "minDurationMinutes",
              "targetDurationMinutes",
              "maxDurationMinutes",
              "excludeShorts",
              "requireEmbeddable",
              "preferProjectBased",
              "preferredLanguage"
            ]
          }
        },
        required: ["name", "searchQueries", "requiredTopics", "searchPolicy"]
      }
    }
  },
  required: ["topic", "title", "skills"]
};

function formatCourseDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

async function getDiscoveryAdminConfig() {
  const keys = [
    "discovery_max_skills_per_course", "discovery_search_results_per_query",
    "discovery_min_duration_minutes", "discovery_max_duration_minutes",
    "discovery_exclude_shorts", "discovery_require_embeddable",
  ];
  const saved = await PlatformSetting.find({ key: { $in: keys } }).lean();
  return Object.fromEntries(saved.map((setting) => [setting.key, setting.value]));
}

function normalizePolicy(policy, config = {}) {
  const globalMin = Math.max(0, Math.min(1200, Number(config.discovery_min_duration_minutes ?? 30)));
  const globalMax = Math.max(30, Math.min(6000, Number(config.discovery_max_duration_minutes ?? 3600)));
  const requestedMin = Math.min(2400, Number(policy?.minDurationMinutes) || 180);
  const min = Math.min(globalMax, Math.max(globalMin, requestedMin));
  const max = Math.max(min, Math.min(globalMax, Number(policy?.maxDurationMinutes) || globalMax));
  const target = Math.max(min, Math.min(max, Number(policy?.targetDurationMinutes) || min));
  return {
    ...policy,
    minDurationMinutes: min,
    targetDurationMinutes: target,
    maxDurationMinutes: max,
    excludeShorts: config.discovery_exclude_shorts === false ? false : policy?.excludeShorts !== false,
    requireEmbeddable: config.discovery_require_embeddable === false ? false : policy?.requireEmbeddable !== false,
    preferProjectBased: policy?.preferProjectBased !== false,
    preferredLanguage: policy?.preferredLanguage || "en"
  };
}

async function generateSearchSpecification(topic) {
  if (!aiClient) {
    const error = new Error("AI search is not configured. Add GEMINI_API_KEY.");
    error.status = 503;
    throw error;
  }

  const response = await aiClient.models.generateContent({
    model: env.geminiModel,
    contents: [
      "You are BuddyForStudy's learning-resource search planner.",
      "The user is performing NORMAL COURSE SEARCH, not asking for a personalized roadmap.",
      "Break the requested technology/career into the essential ordered skills needed to learn it.",
      "For every skill, create independent YouTube search queries and a course-duration range.",
      "The duration range must be specific to the skill. Do not use one generic duration for all skills.",
      "Example principle: JavaScript may reasonably need 10-20 hours for a complete course, while React may need 7+ hours. Decide realistic values for the actual topic.",
      "The search engine will enforce the duration range against the video's actual YouTube duration.",
      "Do not return video URLs. Do not choose a channel. Do not choose a video.",
      "Return skills in learning order.",
      "For a MERN Stack search, the expected progression normally includes HTML, CSS, JavaScript, React, Node.js, Express.js, and MongoDB.",
      `User search: ${topic}`
    ].join("\n"),
    config: {
      responseMimeType: "application/json",
      responseSchema: searchSpecSchema,
      thinkingConfig: { thinkingLevel: "LOW" },
      maxOutputTokens: 8000
    }
  });

  const result = JSON.parse(response.text);
  if (!result?.skills?.length) {
    const error = new Error("AI search planner returned no skills");
    error.status = 502;
    throw error;
  }
  return result;
}

function generatedSlug(title, mode) {
  const base = String(title || "course").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${base}-${mode}-${randomUUID().slice(0, 8)}`;
}

async function createPrivateCourseForUser(baseCourse, userId, sourceMeta = {}) {
  if (!userId) return baseCourse;
  const baseId = String(baseCourse?._id || "");
  const existing = await Course.findOne({
    visibility: "private",
    createdForUser: userId,
    "generation.snapshot.baseCourseId": baseId,
    deletedAt: null
  }).lean();
  if (existing) return existing;

  const source = baseCourse?.toObject ? baseCourse.toObject() : { ...(baseCourse || {}) };
  const { _id, __v, createdAt, updatedAt, ...copy } = source;
  const priorSnapshot = source.generation?.snapshot;
  const snapshot = priorSnapshot && typeof priorSnapshot === "object" && !Array.isArray(priorSnapshot)
    ? priorSnapshot
    : { sourceSnapshot: priorSnapshot ?? null };
  copy.slug = generatedSlug(source.title, "learner-" + String(userId).slice(-8));
  copy.isPublished = false;
  copy.status = "draft";
  copy.deletedAt = null;
  copy.visibility = "private";
  copy.createdForUser = userId;
  copy.aiReviewStatus = "pending";
  copy.aiReviewedBy = null;
  copy.aiReviewedAt = null;
  copy.aiReviewNote = "";
  copy.generation = {
    ...(source.generation || {}),
    mode: "ai",
    sourceCourse: source._id || null,
    sourceResourceType: null,
    sourceResourceId: "",
    snapshot: { ...snapshot, baseCourseId: baseId, privateForUser: String(userId), ...sourceMeta }
  };
  return Course.create(copy);
}

function courseToSearchSnapshot(course, fallbackQuery = "") {
  const snapshot = course?.generation?.snapshot;
  if (snapshot?.modules?.length) return snapshot;

  return {
    query: course?.generation?.query || fallbackQuery,
    title: course?.title || fallbackQuery,
    modules: (course?.modules || []).map((module, index) => {
      const lesson = (module.lessons || []).find((item) => item.type === "tutorial");
      const video = lesson?.tutorial?.videos?.[0] || null;
      return {
        order: module.order || index + 1,
        title: module.title,
        skill: module.title,
        searchSpecification: {
          searchQueries: [],
          requiredTopics: [module.title],
          duration: { minMinutes: 0, targetMinutes: 0, maxMinutes: 0 }
        },
        course: video ? {
          videoId: video.videoId,
          title: video.title,
          description: video.description || "",
          channelTitle: video.channelTitle || "",
          publishedAt: video.publishedAt || null,
          durationSeconds: 0,
          duration: "",
          url: video.url || "",
          embedUrl: video.url ? video.url.replace("watch?v=", "embed/") : "",
          thumbnail: video.thumbnail || "",
          score: 0,
          selection: null
        } : null
      };
    }),
    moduleCount: (course?.modules || []).length,
    foundModules: (course?.modules || []).filter((module) =>
      (module.lessons || []).some((lesson) => lesson.type === "tutorial" && lesson.tutorial?.videos?.length)
    ).length
  };
}

function stripAiOnlyLessons(course) {
  return (course.modules || []).map((module) => ({
    title: module.title,
    description: module.description || "",
    order: module.order,
    lessons: (module.lessons || [])
      .filter((lesson) => lesson.type === "tutorial")
      .map((lesson, index) => ({
        title: lesson.title,
        description: lesson.description || "",
        type: "tutorial",
        order: lesson.order || index + 1,
        tutorial: {
          content: lesson.tutorial?.content || "",
          resources: lesson.tutorial?.resources || [],
          videos: lesson.tutorial?.videos || []
        }
      }))
  }));
}

async function createNormalCourseFromSearch(query, result) {
  const availableModules = result.modules.filter((module) => module.course);
  const totalSeconds = availableModules.reduce(
    (sum, module) => sum + Number(module.course?.durationSeconds || 0),
    0
  );
  const duration = totalSeconds >= 3600
    ? `${Math.floor(totalSeconds / 3600)}h ${String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0")}m`
    : `${Math.floor(totalSeconds / 60)}m`;

  return Course.create({
    title: result.title,
    slug: generatedSlug(result.title, "normal"),
    description: `An AI-assembled ${query} learning course with independently selected, duration-matched YouTube lessons ordered by prerequisite.`,
    category: "AI Course Search",
    level: "Beginner",
    duration: duration || "Self-paced",
    thumbnail: availableModules[0]?.course?.thumbnail || "",
    learningOutcomes: availableModules.map((module) => `Learn ${module.skill}`),
    modules: result.modules.map((module) => ({
      title: module.title,
      description: `Learn ${module.skill} using the selected course video for this module.`,
      order: module.order,
      lessons: module.course ? [{
        title: module.course.title,
        description: module.course.description || `Selected YouTube course for ${module.skill}.`,
        type: "tutorial",
        order: 1,
        tutorial: {
          content: module.course.description || "",
          resources: [module.course.url].filter(Boolean),
          videos: [{
            videoId: module.course.videoId,
            title: module.course.title,
            description: module.course.description || "",
            channelTitle: module.course.channelTitle || "",
            publishedAt: module.course.publishedAt || null,
            url: module.course.url,
            thumbnail: module.course.thumbnail || ""
          }]
        }
      }] : []
    })),
    generation: {
      mode: "normal",
      query,
      topicKeys: buildTopicKeys(query, result.topic, result.title),
      snapshot: result
    },
    isPublished: true,
    pricing: { mode: "free", price: 0, currency: "INR" },
    enrollmentEnabled: true,
    certificateEnabled: true
  });
}

async function createNormalCourseFromAi(aiCourse, query) {
  const snapshot = aiCourse.generation?.snapshot?.normalSearchSnapshot;
  if (!snapshot) return null;

  const source = aiCourse.toObject ? aiCourse.toObject() : aiCourse;
  return Course.create({
    title: source.title,
    slug: generatedSlug(source.title, "normal"),
    description: `An AI-assembled ${query} learning course with the core tutorial path from an existing AI-generated course.`,
    category: "AI Course Search",
    level: source.level,
    duration: source.duration || "Self-paced",
    thumbnail: source.thumbnail || "",
    learningOutcomes: source.learningOutcomes || [],
    modules: stripAiOnlyLessons(source),
    generation: {
      mode: "normal",
      query,
      topicKeys: buildTopicKeys(query, ...(source.generation?.topicKeys || [])),
      sourceCourse: source._id,
      snapshot
    },
    isPublished: true,
    pricing: source.pricing || { mode: "free", price: 0, currency: "INR" },
    enrollmentEnabled: source.enrollmentEnabled !== false,
    certificateEnabled: source.certificateEnabled !== false
  });
}

async function searchCourseBySkillsFresh(query) {
  const adminConfig = await getDiscoveryAdminConfig();
  const spec = await generateSearchSpecification(query);
  const maxSkills = Math.max(1, Math.min(30, Number(adminConfig.discovery_max_skills_per_course) || 12));
  const selectedSkills = spec.skills.slice(0, maxSkills);
  const modules = [];

  for (let index = 0; index < selectedSkills.length; index += 1) {
    const skill = selectedSkills[index];
    const policy = normalizePolicy(skill.searchPolicy, adminConfig);
    const selected = await searchBestYouTubeCourse({
      skill: skill.name,
      searchQueries: skill.searchQueries,
      searchPolicy: {
        ...policy,
        requiredTopics: skill.requiredTopics
      },
      maxResultsPerQuery: Math.max(5, Math.min(50, Number(adminConfig.discovery_search_results_per_query) || 20))
    });

    modules.push({
      order: index + 1,
      title: skill.name,
      skill: skill.name,
      searchSpecification: {
        searchQueries: skill.searchQueries,
        requiredTopics: skill.requiredTopics,
        duration: {
          minMinutes: policy.minDurationMinutes,
          targetMinutes: policy.targetDurationMinutes,
          maxMinutes: policy.maxDurationMinutes
        }
      },
      course: selected
        ? {
            videoId: selected.videoId,
            title: selected.title,
            description: selected.description,
            channelTitle: selected.channelTitle,
            durationSeconds: selected.durationSeconds,
            duration: formatCourseDuration(selected.durationSeconds),
            url: selected.url,
            embedUrl: selected.embedUrl,
            thumbnail: selected.thumbnail,
            score: selected.score,
            selection: selected.selection
          }
        : null
    });
  }

  return {
    title: spec.title || `${query} Learning Course`,
    topic: spec.topic || query,
    modules
  };
}

export async function getOrCreateNormalCourse(query) {
  const normalized = query.trim();
  const topicKeys = buildTopicKeys(normalized);

  const existingNormal = await findRecentGeneratedCourse({ mode: "normal", topicKeys });
  if (existingNormal) {
    return { course: existingNormal, result: courseToSearchSnapshot(existingNormal, normalized), cached: true };
  }

  const existingAi = await findRecentGeneratedCourse({ mode: "ai", topicKeys });
  if (existingAi) {
    const derived = await createNormalCourseFromAi(existingAi, normalized);
    if (derived) {
      return { course: derived, result: courseToSearchSnapshot(derived, normalized), cached: true, derivedFromAi: true };
    }
  }

  const fresh = await searchCourseBySkillsFresh(normalized);
  const result = {
    query: normalized,
    topic: fresh.topic,
    title: fresh.title,
    modules: fresh.modules,
    moduleCount: fresh.modules.length,
    foundModules: fresh.modules.filter((module) => module.course).length
  };
  const course = await createNormalCourseFromSearch(normalized, result);
  return { course, result, cached: false };
}

export async function getOrCreateYouTubeResourceCourse({
  query,
  resourceType,
  resourceId
}) {
  const type = resourceType === "playlist" ? "playlist" : "video";
  const id = String(resourceId || "").trim();
  if (!id) {
    const error = new Error("YouTube resourceId is required");
    error.status = 400;
    throw error;
  }

  const existing = await Course.findOne({
    "generation.mode": "discovery",
    "generation.sourceResourceType": type,
    "generation.sourceResourceId": id,
    isPublished: true
  }).lean();

  if (existing) return existing;

  let title = query || "YouTube Course";
  let description = "";
  let thumbnail = "";
  let channelTitle = "";
  let lessons = [];
  let durationSeconds = 0;

  if (type === "playlist") {
    const playlist = await getPlaylistCourse(id);
    title = playlist.title || title;
    description = playlist.description || `A BuddyForStudy course built from the YouTube playlist “${title}”.`;
    thumbnail = playlist.thumbnail || "";
    channelTitle = playlist.channelTitle || "";
    lessons = (playlist.lessons || []).map((lesson, index) => ({
      title: lesson.title || `Lesson ${index + 1}`,
      description: lesson.description || "",
      type: "tutorial",
      order: index + 1,
      tutorial: {
        content: lesson.description || "",
        resources: lesson.url ? [lesson.url] : [],
        videos: [{
          videoId: lesson.videoId,
          title: lesson.title || `Lesson ${index + 1}`,
          description: lesson.description || "",
          channelTitle: lesson.channelTitle || channelTitle,
          publishedAt: lesson.publishedAt || null,
          url: lesson.url || "",
          thumbnail: lesson.thumbnail || ""
        }]
      }
    }));
    durationSeconds = (playlist.lessons || []).reduce(
      (sum, lesson) => sum + Number(lesson.durationSeconds || 0),
      0
    );
  } else {
    const video = await getYouTubeVideoResource(id);
    if (!video.embeddable) {
      const error = new Error("This YouTube video cannot be played inside BuddyForStudy");
      error.status = 409;
      throw error;
    }

    title = video.title || title;
    description = video.description || `A BuddyForStudy course built from the YouTube learning video “${title}”.`;
    thumbnail = video.thumbnail || "";
    channelTitle = video.channelTitle || "";
    durationSeconds = Number(video.durationSeconds || 0);
    lessons = [{
      title: video.title || title,
      description: video.description || "",
      type: "tutorial",
      order: 1,
      tutorial: {
        content: video.description || "",
        resources: video.url ? [video.url] : [],
        videos: [{
          videoId: video.videoId,
          title: video.title || title,
          description: video.description || "",
          channelTitle,
          publishedAt: video.publishedAt || null,
          url: video.url || "",
          thumbnail
        }]
      }
    }];
  }

  if (!lessons.length) {
    const error = new Error("This YouTube resource has no playable lessons");
    error.status = 409;
    throw error;
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const duration = durationSeconds
    ? hours
      ? `${hours}h ${minutes ? ` ${minutes}m` : ""}`
      : `${minutes}m`
    : "Self-paced";

  const payload = {
    title,
    slug: generatedSlug(title, "discovery"),
    description,
    category: "YouTube Discovery",
    level: "Beginner",
    duration,
    thumbnail,
    learningOutcomes: [`Learn ${query || title}`],
    modules: [{
      title,
      description: description || `Learn ${query || title} through the selected YouTube resource.`,
      order: 1,
      lessons
    }],
    isPublished: true,
    pricing: { mode: "free", price: 0, currency: "INR" },
    enrollmentEnabled: true,
    certificateEnabled: false,
    featured: false,
    generation: {
      mode: "discovery",
      query: String(query || title),
      topicKeys: buildTopicKeys(query || title, title, channelTitle),
      sourceResourceType: type,
      sourceResourceId: id,
      snapshot: {
        source: "youtube",
        resourceType: type,
        resourceId: id,
        channelTitle
      }
    }
  };

  try {
    return await Course.create(payload);
  } catch (error) {
    if (error?.code === 11000) {
      const retry = await Course.findOne({
        "generation.mode": "discovery",
        "generation.sourceResourceType": type,
        "generation.sourceResourceId": id,
        isPublished: true
      }).lean();
      if (retry) return retry;
    }
    throw error;
  }
}

export async function searchCourseBySkills(query) {
  return (await getOrCreateNormalCourse(query)).result;
}

export async function createCourseFromSearch(query) {
  return (await getOrCreateNormalCourse(query)).course;
}

// Legacy playlist discovery remains available for direct playlist browsing.
const playlistCache = new Map();

async function youtubeRequest(endpoint, params) {
  if (!env.youtubeApiKey) {
    const error = new Error("YOUTUBE_API_KEY is missing");
    error.status = 503;
    throw error;
  }
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key: env.youtubeApiKey }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: {
      "x-goog-api-key": env.youtubeApiKey
    }
  });
  const data = await response.json();
  if (!response.ok) {
    const reason =
      data?.error?.errors?.[0]?.reason ||
      data?.error?.status ||
      data?.error?.message ||
      "unknown error";
    const error = new Error(`YouTube ${endpoint} failed: ${reason}`);
    error.status = response.status === 403 ? 503 : response.status;
    error.code = reason;
    throw error;
  }
  return data;
}

function parseDuration(value) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

export async function searchStructuredPlaylists(query, maxResults = 12) {
  const key = `search:${query.trim().toLowerCase()}`;
  if (playlistCache.has(key)) return playlistCache.get(key);

  const data = await youtubeRequest("search", {
    part: "snippet",
    type: "playlist",
    order: "relevance",
    q: query,
    maxResults: Math.min(maxResults, 25),
    relevanceLanguage: "en",
    regionCode: "IN",
    safeSearch: "moderate"
  });

  const ids = (data.items || []).map((item) => item.id?.playlistId).filter(Boolean);
  if (!ids.length) {
    playlistCache.set(key, []);
    return [];
  }

  const details = await youtubeRequest("playlists", {
    part: "snippet,contentDetails,status",
    id: ids.join(",")
  });

  const queryTerms = [...new Set(
    String(query || "")
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 1)
  )];

  const rawResults = (details.items || [])
    .filter((playlist) =>
      playlist.status?.privacyStatus !== "private" &&
      Number(playlist.contentDetails?.itemCount || 0) > 0
    )
    .map((playlist) => ({
      playlistId: playlist.id,
      title: playlist.snippet?.title || "Untitled course",
      description: playlist.snippet?.description || "",
      channelTitle: playlist.snippet?.channelTitle || "",
      channelId: playlist.snippet?.channelId || "",
      publishedAt: playlist.snippet?.publishedAt || null,
      itemCount: Number(playlist.contentDetails?.itemCount || 0),
      thumbnail:
        playlist.snippet?.thumbnails?.high?.url ||
        playlist.snippet?.thumbnails?.medium?.url ||
        playlist.snippet?.thumbnails?.default?.url ||
        "",
      url: `https://www.youtube.com/playlist?list=${playlist.id}`
    }));

  const maxItems = Math.max(...rawResults.map((playlist) => playlist.itemCount), 1);

  const results = rawResults
    .map((playlist) => {
      const searchable = `${playlist.title} ${playlist.description} ${playlist.channelTitle}`.toLowerCase();
      const matchedTerms = queryTerms.filter((term) => searchable.includes(term)).length;
      const relevance = queryTerms.length ? (matchedTerms / queryTerms.length) * 100 : 50;
      const depth = Math.min(
        100,
        (Math.log10(playlist.itemCount + 1) / Math.log10(maxItems + 1)) * 100
      );
      const ageDays = Math.max(
        0,
        (Date.now() - new Date(playlist.publishedAt || Date.now()).getTime()) / 86400000
      );
      const recency = Math.max(0, 100 - (ageDays / 3650) * 100);
      const score = Number(
        (relevance * 0.60 + depth * 0.25 + recency * 0.15).toFixed(2)
      );

      return {
        ...playlist,
        score,
        ranking: {
          algorithm: "youtube-playlist-fallback-v1",
          relevance: Math.round(relevance),
          contentDepth: Math.round(depth),
          recency: Math.round(recency)
        }
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(maxResults, 6));

  playlistCache.set(key, results);
  return results;
}
export async function getPlaylistCourse(playlistId) {
  const key = `playlist:${playlistId}`;
  if (playlistCache.has(key)) return playlistCache.get(key);

  const playlistData = await youtubeRequest("playlists", {
    part: "snippet,contentDetails,status",
    id: playlistId
  });
  const playlist = playlistData.items?.[0];
  if (!playlist) {
    const error = new Error("YouTube playlist not found");
    error.status = 404;
    throw error;
  }

  const items = [];
  let pageToken = "";
  do {
    const params = {
      part: "snippet,contentDetails,status",
      playlistId,
      maxResults: 50
    };
    if (pageToken) params.pageToken = pageToken;
    const page = await youtubeRequest("playlistItems", params);
    items.push(...(page.items || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken && items.length < 100);

  const videoIds = items
    .filter((item) => item.status?.privacyStatus !== "private")
    .map((item) => item.contentDetails?.videoId)
    .filter(Boolean);

  const videos = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    if (!chunk.length) continue;
    const data = await youtubeRequest("videos", {
      part: "snippet,contentDetails,status",
      id: chunk.join(",")
    });
    videos.push(...(data.items || []));
  }

  const videoMap = new Map(videos.map((video) => [video.id, video]));
  const lessons = items
    .map((item, index) => {
      const videoId = item.contentDetails?.videoId;
      const video = videoMap.get(videoId);
      if (!video || video.status?.embeddable === false) return null;
      const seconds = parseDuration(video.contentDetails?.duration);
      return {
        id: video.id,
        order: index + 1,
        title: video.snippet?.title || item.snippet?.title || `Lesson ${index + 1}`,
        description: video.snippet?.description || "",
        videoId: video.id,
        channelTitle: video.snippet?.channelTitle || playlist.snippet?.channelTitle || "",
        thumbnail: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || "",
        publishedAt: video.snippet?.publishedAt || null,
        durationSeconds: seconds,
        duration: formatDuration(seconds),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        embedUrl: `https://www.youtube.com/embed/${video.id}`
      };
    })
    .filter(Boolean);

  const result = {
    playlistId,
    title: playlist.snippet?.title || "YouTube Course",
    description: playlist.snippet?.description || "",
    channelTitle: playlist.snippet?.channelTitle || "",
    channelId: playlist.snippet?.channelId || "",
    thumbnail: playlist.snippet?.thumbnails?.high?.url || playlist.snippet?.thumbnails?.medium?.url || playlist.snippet?.thumbnails?.default?.url || "",
    itemCount: lessons.length,
    lessons
  };

  playlistCache.set(key, result);
  return result;
}
