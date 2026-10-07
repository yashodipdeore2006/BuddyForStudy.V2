import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { searchBestYouTubeCourse } from "./youtube.service.js";

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

function normalizePolicy(policy) {
  const min = Math.max(30, Math.min(2400, Number(policy?.minDurationMinutes) || 180));
  const target = Math.max(min, Math.min(3000, Number(policy?.targetDurationMinutes) || min));
  const max = Math.max(target, Math.min(3600, Number(policy?.maxDurationMinutes) || target));
  return {
    ...policy,
    minDurationMinutes: min,
    targetDurationMinutes: target,
    maxDurationMinutes: max,
    excludeShorts: policy?.excludeShorts !== false,
    requireEmbeddable: policy?.requireEmbeddable !== false,
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

export async function searchCourseBySkills(query) {
  const normalized = query.trim().toLowerCase();
  const key = `course-search:${normalized}`;
  if (playlistCache.has(key)) return playlistCache.get(key);

  const spec = await generateSearchSpecification(query);
  const modules = [];

  for (let index = 0; index < spec.skills.length; index += 1) {
    const skill = spec.skills[index];
    const policy = normalizePolicy(skill.searchPolicy);
    const selected = await searchBestYouTubeCourse({
      skill: skill.name,
      searchQueries: skill.searchQueries,
      searchPolicy: {
        ...policy,
        requiredTopics: skill.requiredTopics
      }
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

  const result = {
    query,
    title: spec.title || `${query} Learning Course`,
    modules,
    moduleCount: modules.length,
    foundModules: modules.filter((module) => module.course).length
  };

  playlistCache.set(key, result);
  return result;
}

export async function createCourseFromSearch(query) {
  const { title, modules } = await searchCourseBySkills(query);
  const { Course } = await import("../models/Course.js");

  const category = "AI Course Search";
  const existing = await Course.findOne({ title, category, isPublished: true });
  if (existing) return existing;

  const availableModules = modules.filter((module) => module.course);
  const totalSeconds = availableModules.reduce(
    (sum, module) => sum + Number(module.course?.durationSeconds || 0),
    0
  );
  const duration = totalSeconds >= 3600
    ? `${Math.floor(totalSeconds / 3600)}h ${String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0")}m`
    : `${Math.floor(totalSeconds / 60)}m`;

  return Course.create({
    title,
    slug: `${title}-${query}`,
    description: `An AI-assembled ${query} learning course with independently selected, duration-matched YouTube lessons ordered by prerequisite.`,
    category,
    level: "Beginner",
    duration: duration || "Self-paced",
    thumbnail: availableModules[0]?.course?.thumbnail || "",
    learningOutcomes: availableModules.map((module) => `Learn ${module.skill}`),
    modules: modules.map((module) => ({
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
          resources: [],
          videos: [{
            videoId: module.course.videoId,
            title: module.course.title,
            description: module.course.description || "",
            channelTitle: module.course.channelTitle || "",
            url: module.course.url,
            thumbnail: module.course.thumbnail || ""
          }]
        }
      }] : []
    })),
    isPublished: true,
    pricing: { mode: "free", price: 0, currency: "INR" },
    enrollmentEnabled: true,
    certificateEnabled: true
  });
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
  if (!ids.length) return [];

  const details = await youtubeRequest("playlists", {
    part: "snippet,contentDetails,status",
    id: ids.join(",")
  });

  const results = (details.items || [])
    .filter((playlist) => playlist.status?.privacyStatus !== "private")
    .map((playlist) => ({
      playlistId: playlist.id,
      title: playlist.snippet?.title || "Untitled course",
      description: playlist.snippet?.description || "",
      channelTitle: playlist.snippet?.channelTitle || "",
      channelId: playlist.snippet?.channelId || "",
      publishedAt: playlist.snippet?.publishedAt || null,
      itemCount: Number(playlist.contentDetails?.itemCount || 0),
      thumbnail: playlist.snippet?.thumbnails?.high?.url || playlist.snippet?.thumbnails?.medium?.url || playlist.snippet?.thumbnails?.default?.url || "",
      url: `https://www.youtube.com/playlist?list=${playlist.id}`
    }))
    .filter((playlist) => playlist.itemCount > 0);

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
