import { env } from "../config/env.js";

const cache = new Map();

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
  if (cache.has(key)) return cache.get(key);

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

  cache.set(key, results);
  return results;
}

export async function getPlaylistCourse(playlistId) {
  const key = `playlist:${playlistId}`;
  if (cache.has(key)) return cache.get(key);

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

  cache.set(key, result);
  return result;
}
