import { env } from "../config/env.js";
import { safeTelemetryError } from "../utils/safeTelemetryError.js";
import { youtubeRequest } from "./youtubeGateway.js";
import { QuotaBudgetError } from "./quota.service.js";
import { curateForNode } from "./nodeCuration.service.js";
import { normalizeMultiVideoLessons } from "./course.service.js";
import { extractCurationChapters } from "./courseCurationDecisionEngine.service.js";

const SEARCH_CACHE = new Map();
const VIDEO_CACHE = new Map();
const CHANNEL_CACHE = new Map();
let selectorTestAdapters = null;
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const VIDEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CHANNEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getExpiringCache(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}
function setExpiringCache(map, key, value, ttlMs) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function parseIsoDuration(value) {
  const match = String(value || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}
function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,value));}
function tokenize(value){return String(value||"").toLowerCase().replace(/[^a-z0-9+#.]+/g," ").split(/\s+/).filter((x)=>x.length>2);}

function coverageScore(video, requiredTopics) {
  const title = String(video.title || "").toLowerCase();
  const description = String(video.description || "").toLowerCase();
  const tags = (video.tags || []).join(" ").toLowerCase();
  const topics = [...new Set(requiredTopics || [])];
  if (!topics.length) return 50;

  const matched = topics.filter((topic) => {
    const normalizedTopic = String(topic || "").toLowerCase().trim();
    if (!normalizedTopic) return false;
    if (title.includes(normalizedTopic) || tags.includes(normalizedTopic)) return true;

    const words = tokenize(normalizedTopic);
    if (!words.length) return false;

    const descriptionMatches = words.filter((word) => description.includes(word)).length;
    return descriptionMatches === words.length;
  }).length;

  return Math.round((matched / topics.length) * 100);
}
function relevanceScore(video,query) {
  const text=`${video.title} ${video.description} ${(video.tags||[]).join(" ")}`.toLowerCase();
  const terms=[...new Set(tokenize(query))];
  if(!terms.length) return 50;
  return Math.round((terms.filter((term)=>text.includes(term)).length/terms.length)*100);
}
function durationScore(seconds, expected = {}) {
  const minutes = seconds / 60;
  const min = Number(expected.minDurationMinutes ?? expected.min ?? 30);
  const target = Number(expected.targetDurationMinutes ?? expected.target ?? min);
  const max = Number(expected.maxDurationMinutes ?? expected.max ?? Math.max(target, min));
  if (!minutes || minutes < min || minutes > max) return 0;
  if (minutes === target) return 100;
  const distance = Math.abs(minutes - target);
  const range = Math.max(target - min, max - target, 1);
  return clamp(100 - (distance / range) * 50);
}
function recencyScore(publishedAt){const ageDays=Math.max(0,(Date.now()-new Date(publishedAt||Date.now()).getTime())/86400000);return clamp(100-(ageDays/3650)*100);}
function logMetric(value){return Math.log10(Math.max(1,Number(value||0))+1);}
function normalizedMetric(values,value){const max=Math.max(...values,1);return clamp((value/max)*100);}

function scoreCandidate(video,lesson,pool) {
  const coverage=coverageScore(video,lesson.tutorial?.requiredTopics);
  const relevance=relevanceScore(video,lesson.tutorial?.searchQuery||lesson.title);
  const duration=durationScore(video.durationSeconds, lesson.tutorial?.searchPolicy || lesson.tutorial?.durationMinutes);
  const views=normalizedMetric(pool.map((v)=>logMetric(v.viewCount)),logMetric(video.viewCount));
  const subscribers=normalizedMetric(pool.map((v)=>logMetric(v.subscriberCount)),logMetric(video.subscriberCount));
  const recency=recencyScore(video.publishedAt);
  const ratio=video.viewCount>0?clamp((video.likeCount/video.viewCount)*10000):0;
  const ratioPool=pool.map((v)=>v.viewCount>0?clamp((v.likeCount/v.viewCount)*10000):0);
  const likeRatio=normalizedMetric(ratioPool,ratio);
  const score=relevance*.30+coverage*.30+duration*.10+views*.08+likeRatio*.08+subscribers*.05+recency*.05+(video.isShort?0:100)*.04;
  return {score:Number(score.toFixed(2)),relevance:Math.round(relevance),coverage:Math.round(coverage),duration:Math.round(duration),views:Math.round(views),likeRatio:Math.round(likeRatio),subscribers:Math.round(subscribers),recency:Math.round(recency)};
}

const YOUTUBE_LOCALES_BY_LANGUAGE = {
  en: { relevanceLanguage: "en", regionCode: "IN" },
  hi: { relevanceLanguage: "hi", regionCode: "IN" },
  es: { relevanceLanguage: "es", regionCode: "ES" },
  fr: { relevanceLanguage: "fr", regionCode: "FR" },
  de: { relevanceLanguage: "de", regionCode: "DE" },
  pt: { relevanceLanguage: "pt", regionCode: "BR" },
  ja: { relevanceLanguage: "ja", regionCode: "JP" },
  ko: { relevanceLanguage: "ko", regionCode: "KR" },
  ar: { relevanceLanguage: "ar", regionCode: "SA" },
  bn: { relevanceLanguage: "bn", regionCode: "IN" },
  mr: { relevanceLanguage: "mr", regionCode: "IN" },
  ta: { relevanceLanguage: "ta", regionCode: "IN" },
  te: { relevanceLanguage: "te", regionCode: "IN" },
  gu: { relevanceLanguage: "gu", regionCode: "IN" },
  kn: { relevanceLanguage: "kn", regionCode: "IN" },
  ml: { relevanceLanguage: "ml", regionCode: "IN" },
  pa: { relevanceLanguage: "pa", regionCode: "IN" },
  ur: { relevanceLanguage: "ur", regionCode: "IN" },
  or: { relevanceLanguage: "or", regionCode: "IN" }
};

const LANGUAGE_ALIASES = Object.freeze({
  english: "en", hindi: "hi", marathi: "mr", bengali: "bn", tamil: "ta",
  telugu: "te", gujarati: "gu", kannada: "kn", malayalam: "ml",
  punjabi: "pa", urdu: "ur", odia: "or", oriya: "or",
  spanish: "es", french: "fr", german: "de", portuguese: "pt",
  japanese: "ja", korean: "ko", arabic: "ar"
});

export function normalizeYouTubeLanguage(language = "en") {
  const raw = String(language || "en").trim().toLowerCase().replace(/_/g, "-");
  const primary = raw.split("-")[0];
  return LANGUAGE_ALIASES[raw] || LANGUAGE_ALIASES[primary] || primary || "en";
}

export function normalizePreferredResourceLanguages(languages, fallback = "en") {
  const source = Array.isArray(languages) && languages.length ? languages : [fallback];
  const normalized = [...new Set(source.map((language) => normalizeYouTubeLanguage(language)).filter(Boolean))].slice(0, 4);
  return normalized.length ? normalized : [normalizeYouTubeLanguage(fallback) || "en"];
}

export function getYouTubeSearchOptions(language = "en", languageExplicit = false) {
  const code = normalizeYouTubeLanguage(language);
  if (!languageExplicit) return { ...YOUTUBE_LOCALES_BY_LANGUAGE.en };
  return { ...(YOUTUBE_LOCALES_BY_LANGUAGE[code] || { relevanceLanguage: code, regionCode: "IN" }) };
}

function candidateLanguageMatches(video, expectedLanguage = "en") {
  const expected = normalizeYouTubeLanguage(expectedLanguage);
  const rawActual = String(video?.defaultAudioLanguage || "").trim().toLowerCase();
  const actual = rawActual ? normalizeYouTubeLanguage(rawActual) : "";
  // Search relevance and title/description language are not proof of spoken audio.
  // Explicit language preferences require YouTube's actual defaultAudioLanguage tag.
  if (!actual || actual === "und" || actual === "unknown") return false;
  return actual === expected;
}

async function searchVideos(query,maxResults=10,searchOptions={}){
  const key=String(maxResults)+":"+query.trim().toLowerCase()+":"+String(searchOptions.relevanceLanguage||"en")+":"+String(searchOptions.regionCode||"IN");
  const cached=getExpiringCache(SEARCH_CACHE,key);
  if(cached)return cached;
  const promise=youtubeRequest("search",{part:"snippet",type:env.ytCombinedSearch ? "video,playlist" : "video",videoEmbeddable:"true",videoSyndicated:"true",relevanceLanguage:searchOptions.relevanceLanguage||"en",regionCode:searchOptions.regionCode||"IN",safeSearch:"moderate",order:"relevance",q:query,maxResults:Math.min(maxResults,50)})
    .then((data) => env.ytCombinedSearch ? { ...data, items: (data?.items || []).filter((item) => item.id?.videoId) } : data)
    .catch((error)=>{SEARCH_CACHE.delete(key);if(error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") return null;throw error;});
  setExpiringCache(SEARCH_CACHE,key,promise,SEARCH_CACHE_TTL_MS);
  return promise;
}
async function getVideoDetails(videoIds){
  const uniqueIds=[...new Set(videoIds)];
  const missing=uniqueIds.filter((id)=>!getExpiringCache(VIDEO_CACHE,id));
  for(let index=0;index<missing.length;index+=50){
    const batch=missing.slice(index,index+50);
    if(!batch.length) continue;
    let data;
    try { data=await youtubeRequest("videos",{part:"snippet,contentDetails,statistics,status",id:batch.join(",")}); }
    catch (error) { if (error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") return []; throw error; }
    for(const item of data?.items||[]) setExpiringCache(VIDEO_CACHE,item.id,item,VIDEO_CACHE_TTL_MS);
  }
  return uniqueIds.map((id)=>getExpiringCache(VIDEO_CACHE,id)).filter(Boolean);
}
async function getChannelDetails(channelIds){
  const uniqueIds=[...new Set(channelIds)];
  const missing=uniqueIds.filter((id)=>!getExpiringCache(CHANNEL_CACHE,id));
  for(let index=0;index<missing.length;index+=50){
    const batch=missing.slice(index,index+50);
    if(!batch.length) continue;
    let data;
    try { data=await youtubeRequest("channels",{part:"snippet,statistics,contentDetails",id:batch.join(",")}); }
    catch (error) { if (error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") return []; throw error; }
    for(const item of data?.items||[]) setExpiringCache(CHANNEL_CACHE,item.id,item,CHANNEL_CACHE_TTL_MS);
  }
  return uniqueIds.map((id)=>getExpiringCache(CHANNEL_CACHE,id)).filter(Boolean);
}
function detectVideoStructure(description = "") {
  const text = String(description || "");
  const chapters = [...text.matchAll(/(?:^|\s)(?:[0-5]?\d:)?[0-5]?\d:[0-5]\d\s+[^\n]{2,}/gm)];
  const hasChapterLabel = /\b(chapters?|timestamps?|timeline)\b/i.test(text);
  const hasSyllabus = /\b(what do you learn|what you(?:'|’)ll learn|course content|curriculum|syllabus|topics covered|learning objectives|course outline)\b/i.test(text);
  const handsOnCues = /\b(project|hands[- ]on|practice|dataset|exercise|lab|build|demo|workshop|assignment|case study|capstone)\b/i.test(text);
  const resourceLinks = /https?:\/\//i.test(text) && /\b(github|dataset|download|repository|notebook|source code|resources)\b/i.test(text);
  return {
    chapterCount: Math.max(chapters.length, hasChapterLabel ? 1 : 0),
    hasChapters: chapters.length >= 3 || hasChapterLabel,
    hasSyllabus,
    hasHandsOn: handsOnCues,
    hasResourceLinks: resourceLinks
  };
}

function isPublicEmbeddableCandidate(video) {
  return Boolean(
    video &&
    /^[A-Za-z0-9_-]{6,64}$/.test(String(video.videoId || "")) &&
    video.privacyStatus === "public" &&
    video.embeddable === true
  );
}
export const __youtubeSelectorTestUtils = { isPublicEmbeddableCandidate, candidateLanguageMatches, normalizeYouTubeLanguage, normalizePreferredResourceLanguages };

function toCandidate(video,channel){
  if(!video)return null;
  const durationSeconds=parseIsoDuration(video.contentDetails?.duration);
  const title=video.snippet?.title||"";
  const description=video.snippet?.description||"";
  const structure=detectVideoStructure(description);
  return {
    videoId:video.id,title,description,tags:video.snippet?.tags||[],channelId:video.snippet?.channelId||"",
    channelTitle:video.snippet?.channelTitle||"",publishedAt:video.snippet?.publishedAt||null,
    defaultAudioLanguage:video.snippet?.defaultAudioLanguage||"",
    durationSeconds,duration:video.contentDetails?.duration||"",
    viewCount:Number(video.statistics?.viewCount||0),likeCount:Number(video.statistics?.likeCount||0),
    commentCount:Number(video.statistics?.commentCount||0),
    subscriberCount:Number(channel?.statistics?.subscriberCount||0),
    embeddable:video.status?.embeddable===true,
    privacyStatus:video.status?.privacyStatus||"unknown",
    regionRestriction:video.contentDetails?.regionRestriction||{},
    url: `https://www.youtube.com/watch?v=${video.id}`, embedUrl: `https://www.youtube.com/embed/${video.id}`,
    thumbnail:video.snippet?.thumbnails?.high?.url||video.snippet?.thumbnails?.medium?.url||video.snippet?.thumbnails?.default?.url||"",
    isShort:durationSeconds<=180 && /(?:#shorts?\b|\byoutube shorts?\b|\bshort-form video\b)/i.test(title + " " + description),
    ...structure
  };
}

export async function getYouTubeVideoResource(videoId) {
  const id = String(videoId || "").trim();
  if (!id) throw new Error("YouTube videoId is required");

  let data;
  try { data = await youtubeRequest("videos", { part: "snippet,contentDetails,statistics,status", id }); }
  catch (error) { if (error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") { console.warn("YouTube resource lookup degraded by quota guard", { quotaState: error.state }); return null; } throw error; }
  const video = data?.items?.[0];
  if (!video) {
    const error = new Error("YouTube video not found");
    error.status = 404;
    throw error;
  }
  if (video.status?.privacyStatus !== "public" || video.status?.embeddable !== true) return null;

  const channelIds = video.snippet?.channelId ? [video.snippet.channelId] : [];
  const channels = await getChannelDetails(channelIds);
  const channel = channels[0];
  return toCandidate(video, channel);
}

export function __setYouTubeSelectorAdaptersForTests(adapters = null) { selectorTestAdapters = adapters; }

export async function searchBestYouTubeCourse({ skill, searchQueries, searchPolicy, language = searchPolicy?.preferredLanguage || "en", maxResultsPerQuery = 20 }) {
  if (!env.youtubeApiKey) return null;

  const queries = (searchQueries || []).slice(0, 3);
  const boundedMaxResults = Math.max(5, Math.min(50, Number(maxResultsPerQuery) || 20));
  const items = [];
  for (const query of queries) {
    try {
      const data = await (selectorTestAdapters?.searchVideos || searchVideos)(query, boundedMaxResults, getYouTubeSearchOptions(language, true));
      items.push(...(data?.items || []));
    } catch (error) {
      console.error("YouTube course search failed", safeTelemetryError(error));
    }
  }

  const uniqueIds = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))];
  const videoDetails = await (selectorTestAdapters?.getVideoDetails || getVideoDetails)(uniqueIds);
  const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = await (selectorTestAdapters?.getChannelDetails || getChannelDetails)(channelIds);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const byId = new Map(videoDetails.map((video) => [video.id, video]));

  const minDuration = Number(searchPolicy?.minDurationMinutes || 0);
  const maxDuration = Number(searchPolicy?.maxDurationMinutes || Number.MAX_SAFE_INTEGER);

  const candidates = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))]
    .map((id) => toCandidate(byId.get(id), channelMap.get(byId.get(id)?.snippet?.channelId)))
    .filter((video) =>
      isPublicEmbeddableCandidate(video) &&
      (!searchPolicy?.excludeShorts || !video.isShort) &&
      video.durationSeconds >= minDuration * 60 &&
      video.durationSeconds <= maxDuration * 60 &&
      candidateLanguageMatches(video, language)
    );

  if (!candidates.length) return null;

  const lesson = {
    title: skill,
    tutorial: {
      searchQuery: queries[0] || skill,
      requiredTopics: searchPolicy?.requiredTopics || [skill],
      searchPolicy
    }
  };

  const ranked = candidates
    .map((video) => ({ ...video, ...scoreCandidate(video, lesson, candidates) }))
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0];
  return {
    ...selected,
    selection: {
      algorithm: "normal-search-course-v1",
      skill,
      searchQueries: queries,
      durationPolicy: searchPolicy
    }
  };
}

/**
 * Broad, quota-bounded candidate collection for the normal-search curation engine.
 * Callers cache by normalized topic and intent before invoking fan-out again.
 */
async function searchRecentCreatorUploads(channelIds, knownVideoIds, maxUploadsPerChannel = 10) {
  const channels = await getChannelDetails(channelIds);
  const uploadsLists = channels
    .map((channel) => ({
      channelId: channel.id,
      uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads
    }))
    .filter((channel) => channel.uploadsPlaylistId);
  if (!uploadsLists.length) return [];

  const pages = await Promise.all(uploadsLists.map(async (channel) => {
    try {
      const page = await youtubeRequest("playlistItems", {
        part: "snippet,contentDetails,status",
        playlistId: channel.uploadsPlaylistId,
        maxResults: Math.max(1, Math.min(15, Number(maxUploadsPerChannel) || 10))
      });
      return (page?.items || [])
        .filter((item) => item.status?.privacyStatus !== "private")
        .map((item) => item.contentDetails?.videoId)
        .filter(Boolean);
    } catch (error) {
      console.warn("YouTube creator upload expansion failed", safeTelemetryError(error));
      return [];
    }
  }));
  const known = new Set(knownVideoIds);
  const newIds = [...new Set(pages.flat())].filter((id) => !known.has(id));
  if (!newIds.length) return [];

  const videos = await getVideoDetails(newIds);
  const expandedChannelIds = [...new Set(videos.map((video) => video.snippet?.channelId).filter(Boolean))];
  const expandedChannels = await getChannelDetails(expandedChannelIds);
  const expandedChannelMap = new Map(expandedChannels.map((channel) => [channel.id, channel]));
  return videos
    .map((video) => ({
      ...toCandidate(video, expandedChannelMap.get(video.snippet?.channelId)),
      matchedSearchQueries: ["creator-upload-expansion"],
      searchMatchCount: 0,
      expandedFromChannel: true
    }))
    .filter((candidate) => candidate && candidate.privacyStatus === "public" && candidate.embeddable);
}

export async function searchYouTubeCurationCandidates(searchQueries, maxResultsPerQuery = 30, searchOptions = {}) {
  if (!env.youtubeApiKey) return [];
  const queries = [...new Set((searchQueries || []).map((query) => String(query || "").trim()).filter(Boolean))].slice(0, 8);
  if (!queries.length) return [];
  const boundedResults = Math.max(5, Math.min(50, Number(maxResultsPerQuery) || 30));
  const batches = await Promise.all(queries.map(async (query) => {
    try {
      const data = await searchVideos(query, boundedResults, searchOptions);
      return { query, items: data?.items || [] };
    } catch (error) {
      console.error("YouTube curation candidate search failed", safeTelemetryError(error));
      return { query, items: [] };
    }
  }));

  const matchesById = new Map();
  for (const batch of batches) {
    for (const item of batch.items) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      if (!matchesById.has(videoId)) matchesById.set(videoId, { queries: [], searchItems: [] });
      const match = matchesById.get(videoId);
      if (!match.queries.includes(batch.query)) match.queries.push(batch.query);
      match.searchItems.push(item);
    }
  }

  const videoIds = [...matchesById.keys()];
  if (!videoIds.length) return [];
  const videoDetails = await getVideoDetails(videoIds);
  const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = await getChannelDetails(channelIds);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const detailMap = new Map(videoDetails.map((video) => [video.id, video]));

  const directCandidates = videoIds.map((videoId) => {
    const video = detailMap.get(videoId);
    if (!video) return null;
    return {
      ...toCandidate(video, channelMap.get(video.snippet?.channelId)),
      matchedSearchQueries: matchesById.get(videoId).queries,
      searchMatchCount: matchesById.get(videoId).queries.length
    };
  }).filter(Boolean);

  // Expand a small number of relevant creators through their uploads playlists.
  // These playlistItems/videos calls are substantially cheaper than search.list calls.
  const expansionChannelIds = [];
  for (const videoId of videoIds.slice(0, 80)) {
    const channelId = detailMap.get(videoId)?.snippet?.channelId;
    if (channelId && !expansionChannelIds.includes(channelId)) expansionChannelIds.push(channelId);
    if (expansionChannelIds.length >= 6) break;
  }
  const expandedCandidates = await searchRecentCreatorUploads(expansionChannelIds, videoIds, 10);
  return [...directCandidates, ...expandedCandidates];
}

export async function searchYouTubeCourseRecommendations(query, maxResults = 3) {
  if (!env.youtubeApiKey) return [];

  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return [];

  const searchQuery = normalizedQuery + " complete course tutorial";
  const requestedResults = Math.max(1, Math.min(Number(maxResults) || 30, 50));
  const data = await searchVideos(searchQuery, requestedResults);
  const items = data?.items || [];

  const uniqueIds = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))];
  const videoDetails = await getVideoDetails(uniqueIds);
  const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = await getChannelDetails(channelIds);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const byId = new Map(videoDetails.map((video) => [video.id, video]));

  const searchPolicy = {
    // Normal search is discovery, not a strict long-form course builder.
    minDurationMinutes: 1,
    targetDurationMinutes: 60,
    maxDurationMinutes: 1440,
    excludeShorts: true,
    requireEmbeddable: true,
    preferProjectBased: false,
    preferredLanguage: normalizeYouTubeLanguage("en"),
    requiredTopics: [normalizedQuery]
  };

  const candidates = uniqueIds
    .map((id) => toCandidate(byId.get(id), channelMap.get(byId.get(id)?.snippet?.channelId)))
    .filter((video) =>
      isPublicEmbeddableCandidate(video) &&
      !video.isShort &&
      video.durationSeconds >= searchPolicy.minDurationMinutes * 60 &&
      video.durationSeconds <= searchPolicy.maxDurationMinutes * 60
    );

  const lesson = {
    title: normalizedQuery,
    tutorial: {
      searchQuery,
      requiredTopics: searchPolicy.requiredTopics,
      searchPolicy
    }
  };

  return candidates
    .map((video) => ({
      ...video,
      ...scoreCandidate(video, lesson, candidates),
      selection: {
        algorithm: "youtube-fallback-course-v1",
        query: normalizedQuery,
        searchQuery,
        durationPolicy: searchPolicy
      }
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(maxResults) || 30, 50)));
}
async function attachProjectYouTubeVideos(project, languages = ["en"]) {
  const queries = (project.videoSearchQueries || []).filter(Boolean).slice(0, 2);
  if (!queries.length || !env.youtubeApiKey) return [];

  const preferredLanguages = normalizePreferredResourceLanguages(languages);
  const policy = {
    minDurationMinutes: 60,
    targetDurationMinutes: 360,
    maxDurationMinutes: 1500,
    excludeShorts: true,
    requireEmbeddable: true,
    preferProjectBased: true
  };
  const lesson = {
    title: project.title || "Project Tutorial",
    tutorial: {
      searchQuery: queries[0],
      requiredTopics: project.features?.length
        ? project.features.slice(0, 8)
        : [project.title || "full stack project"],
      searchPolicy: policy
    }
  };

  for (const language of preferredLanguages) {
    const items = [];
    for (const query of queries) {
      try {
        const data = await searchVideos(query, 12, getYouTubeSearchOptions(language, true));
        items.push(...(data?.items || []));
      } catch (error) {
        console.error("YouTube project tutorial search failed", {
          language,
          ...safeTelemetryError(error)
        });
      }
    }

    const uniqueIds = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))];
    if (!uniqueIds.length) continue;

    const videoDetails = await getVideoDetails(uniqueIds);
    const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
    const channels = await getChannelDetails(channelIds);
    const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
    const byId = new Map(videoDetails.map((video) => [video.id, video]));

    const candidates = uniqueIds
      .map((id) => toCandidate(byId.get(id), channelMap.get(byId.get(id)?.snippet?.channelId)))
      .filter((video) =>
        video &&
        isPublicEmbeddableCandidate(video) &&
        !video.isShort &&
        video.durationSeconds >= policy.minDurationMinutes * 60 &&
        video.durationSeconds <= policy.maxDurationMinutes * 60 &&
        candidateLanguageMatches(video, language)
      );

    if (candidates.length) {
      return candidates
        .map((video) => ({
          ...video,
          ...scoreCandidate(video, lesson, candidates),
          resourceLanguage: language
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 1);
    }
  }

  return [];
}

export async function attachYouTubeResources(course, options = {}) {
  if (!env.youtubeApiKey) {
    console.warn("YouTube resources disabled: YOUTUBE_API_KEY is missing");
    return [];
  }
  const allSources = [];
  const groups = [];
  const projectRequests = [];
  for (const module of course.modules || []) {
    for (const lesson of module.lessons || []) {
      if (lesson.type === "tutorial") {
        // Curate each planned lesson independently. One search result must never
        // stand in for an entire skill/module while sibling lessons remain empty.
        const baseSkillId = String(module.skillIds?.[0] || module.canonicalSkillId || module.title || lesson.skillId || lesson.title);
        const lessonIdentity = String(lesson._id || lesson.id || lesson.title || groups.length);
        const skillId = (baseSkillId + ":" + lessonIdentity).slice(0, 160);
        const topics = [...new Set((lesson.tutorial?.requiredTopics || [lesson.title, module.title]).map((item) => String(item || "").trim()).filter(Boolean))];
        const queries = [...new Set([
          lesson.tutorial?.searchQuery,
          ...(lesson.tutorial?.searchQueries || []),
          (options.topic || course.title || module.title) + " " + lesson.title + " tutorial"
        ].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 3);
        const contextualQuery = [options.topic || course.title, options.resourceSearchContext, lesson.title, "tutorial"]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join(" ");
        if (contextualQuery) queries.push(contextualQuery);
        groups.push({
          skill: { id: skillId, canonicalSkillId: skillId, name: String(lesson.title || module.title), topics, searchQueries: [...new Set([contextualQuery, ...queries])].slice(0, 3) },
          module,
          lessons: [lesson]
        });
      } else if (lesson.type === "project" && lesson.project?.videoSearchQueries?.length) {
        projectRequests.push({ lesson });
      }
    }
  }

  const useSharedEngine = options.useCurationEngineForAi ?? env.useCurationEngineForAi;
  const preferredLanguages = normalizePreferredResourceLanguages(options.languages, options.language || "en");
  let cursor = 0;
  const selectedGroups = new Array(groups.length);
  async function worker() {
    while (cursor < groups.length) {
      const index = cursor++;
      const group = groups[index];
      if (useSharedEngine) {
        let lowConfidenceFallback = null;
        for (const language of preferredLanguages) {
          try {
            const lesson = group.lessons[0];
            const targetMinutes = Number(lesson.tutorial?.durationMinutes?.targetMinutes || lesson.tutorial?.searchPolicy?.targetDurationMinutes || 60);
            const minMinutes = Number(lesson.tutorial?.durationMinutes?.minMinutes || lesson.tutorial?.searchPolicy?.minDurationMinutes || 30);
            const maxMinutes = Number(lesson.tutorial?.durationMinutes?.maxMinutes || lesson.tutorial?.searchPolicy?.maxDurationMinutes || 180);
            const result = await curateForNode({
              skill: group.skill,
              profile: {
                topic: options.topic || course.title || "",
                level: options.level || course.level || "Beginner",
                language
              },
              durationPolicy: { minMinutes, targetMinutes, maxMinutes },
              cacheScope: `${options.resourceCacheScope || ""}:language:${language}`
            });
            if (result.best && !result.meta?.lowConfidence) {
              selectedGroups[index] = { group, result, selected: result.best, alternatives: result.alternatives || [], engine: "shared", language };
              break;
            }
            if (result.best && !lowConfidenceFallback) {
              lowConfidenceFallback = { group, result, selected: result.best, alternatives: result.alternatives || [], engine: "shared", language };
            }
            console.info("AI node curation language fallback", {
              skillId: group.skill.canonicalSkillId,
              language,
              state: result.meta?.state || "empty",
              cacheHit: result.meta?.cacheHit || false,
              searchCalls: result.meta?.searchCalls || 0,
              quotaUnits: result.meta?.quotaUnits || 0
            });
          } catch (error) {
            console.warn("AI node curation failed for selected resource language", {
              language,
              ...safeTelemetryError(error)
            });
          }
        }
        if (selectedGroups[index]) continue;
        if (lowConfidenceFallback) {
          selectedGroups[index] = lowConfidenceFallback;
          continue;
        }
        // Build with AI must not downgrade to a permissive legacy selector.
        // No suitable language-matched verified resource is safer than an unverified video.
        selectedGroups[index] = { group, selected: null, alternatives: [], engine: "shared", language: null };
        continue;
      }

      for (const language of preferredLanguages) {
        const legacy = await searchBestYouTubeCourse({
          skill: group.skill.name,
          searchQueries: group.skill.searchQueries.length ? group.skill.searchQueries : [group.skill.name + " complete course tutorial"],
          searchPolicy: {
            minDurationMinutes: Number(group.lessons[0].tutorial?.searchPolicy?.minDurationMinutes || 30),
            maxDurationMinutes: Number(group.lessons[0].tutorial?.searchPolicy?.maxDurationMinutes || 180),
            requireEmbeddable: true,
            excludeShorts: true,
            requiredTopics: group.skill.topics,
            preferredLanguage: language
          },
          language
        }).catch((error) => {
          console.warn("Legacy AI node selector failed for selected resource language", {
            language,
            ...safeTelemetryError(error)
          });
          return null;
        });
        if (legacy) {
          selectedGroups[index] = {
            group,
            selected: {
              ...legacy,
              videoId: legacy.videoId,
              title: legacy.title,
              channelTitle: legacy.channelTitle,
              durationSeconds: legacy.durationSeconds,
              thumbnail: legacy.thumbnail,
              url: legacy.url,
              fetchedAt: new Date(),
              reason: "Legacy searchBestYouTubeCourse fallback"
            },
            alternatives: [],
            engine: "legacy",
            language
          };
          break;
        }
      }
      if (!selectedGroups[index]) selectedGroups[index] = { group, selected: null, alternatives: [], engine: "legacy", language: null };
    }
  }
  await Promise.all(Array.from({ length: Math.min(env.nodeConcurrency, Math.max(1, groups.length)) }, () => worker()));

  for (const entry of selectedGroups.filter(Boolean)) {
    const { group, selected, alternatives, engine } = entry;
    if (!selected) {
      for (const lesson of group.lessons) {
        lesson.tutorial.videos = [];
        lesson.tutorial.resources = [];
        lesson.tutorial.resourceStatus = "queued";
      }
      continue;
    }
    const sourceVideo = {
      videoId: selected.videoId || "",
      playlistId: selected.playlistId || "",
      title: selected.title || "",
      channelTitle: selected.channelTitle || "",
      durationSeconds: Number(selected.durationSeconds || 0),
      thumbnail: selected.thumbnail || "",
      chapters: selected.chapters || [],
      fetchedAt: selected.fetchedAt || new Date(),
      reason: selected.reason || (engine === "shared" ? "Shared course curation engine" : "Legacy selector fallback"),
      resourceLanguage: entry.language || options.language || "en",
      description: selected.description || "",
      defaultAudioLanguage: selected.defaultAudioLanguage || "",
      url: selected.url || "",
      alternatives: alternatives.slice(0, 2).map((item) => ({
        videoId: item.videoId || "", playlistId: item.playlistId || "", title: item.title || "",
        channelTitle: item.channelTitle || "", durationSeconds: Number(item.durationSeconds || 0),
        thumbnail: item.thumbnail || "", fetchedAt: item.fetchedAt || new Date(),
        reason: item.reason || "Alternative selected by curation engine"
      }))
    };
    allSources.push(sourceVideo);

    const chapters = Array.isArray(sourceVideo.chapters) && sourceVideo.chapters.length >= 2 ? sourceVideo.chapters : extractCurationChapters(selected.description || "");
    if (sourceVideo.playlistId || (Array.isArray(selected.items) && selected.items.length > 1)) {
      const items = (selected.items || []).map((item) => ({
        videoId: item.videoId || item.id || "",
        playlistId: selected.playlistId || "",
        title: item.title || "",
        channelTitle: item.channelTitle || selected.channelTitle || "",
        durationSeconds: Number(item.durationSeconds || 0),
        thumbnail: item.thumbnail || selected.thumbnail || "",
        defaultAudioLanguage: item.defaultAudioLanguage || "",
        chapters: extractCurationChapters(item.description || ""),
        fetchedAt: new Date(),
        reason: "Ordered item from selected learning path",
        url: item.url || ""
      })).filter((item) => item.videoId || item.playlistId);
      if (!items.length) items.push(sourceVideo);
      group.lessons.forEach((lesson, index) => {
        const start = Math.floor(index * items.length / group.lessons.length);
        const end = Math.floor((index + 1) * items.length / group.lessons.length);
        const assigned = items.slice(start, Math.max(start + 1, end));
        lesson.tutorial.videos = assigned.map((picked) => ({ ...picked, alternatives: sourceVideo.alternatives }));
        lesson.tutorial.resources = assigned.map((picked) => picked.url).filter(Boolean);
        lesson.tutorial.resourceStatus = assigned.length ? "ready" : "unavailable";
        lesson.tutorial.selection = assigned[0] ? { algorithm: "shared-node-curation", selectedVideoId: assigned[0].videoId, selectedVideoTitle: assigned[0].title, resourceLanguage: entry.language || options.language || "en", cacheHit: Boolean(entry.result?.meta?.cacheHit) } : null;
      });
    } else if (chapters.length >= 2) {
      const totalSeconds = Math.max(1, sourceVideo.durationSeconds);
      const lessonTokens = (lesson) => new Set(String([lesson.title, lesson.description, ...(lesson.tutorial?.requiredTopics || [])].join(" ")).toLowerCase().match(/[a-z0-9+#.]+/g) || []);
      const chapterTokens = (chapter) => new Set(String(chapter.title || "").toLowerCase().match(/[a-z0-9+#.]+/g) || []);
      const overlaps = (a, b) => { let count = 0; for (const token of a) if (b.has(token)) count += 1; return count; };
      group.lessons.forEach((lesson, index) => {
        const lessonWordSet = lessonTokens(lesson);
        let bestChapter = chapters.map((chapter) => ({ chapter, overlap: overlaps(lessonWordSet, chapterTokens(chapter)) })).sort((a, b) => b.overlap - a.overlap)[0];
        const chapter = bestChapter?.overlap > 0 ? bestChapter.chapter : chapters[Math.min(chapters.length - 1, Math.floor(index * chapters.length / group.lessons.length))];
        const startSeconds = Math.max(0, Number(chapter.timestampSeconds || 0));
        const later = chapters.find((item) => Number(item.timestampSeconds || 0) > startSeconds);
        const endSeconds = later ? Number(later.timestampSeconds) : totalSeconds;
        const video = { ...sourceVideo, chapters, startSeconds, endSeconds, url: sourceVideo.url ? sourceVideo.url + (sourceVideo.url.includes("?") ? "&" : "?") + "t=" + startSeconds + "s" : "" };
        lesson.tutorial.videos = [video];
        lesson.tutorial.resources = video.url ? [video.url] : [];
        lesson.tutorial.resourceStatus = "ready";
        lesson.tutorial.selection = { algorithm: "shared-node-chapters", selectedVideoId: video.videoId, selectedVideoTitle: video.title, resourceLanguage: entry.language || options.language || "en", startSeconds, endSeconds };
      });
    } else {
      // Conservative single-video/no-chapters policy: attach to the first lesson only;
      // do not imply that the same unsegmented video covers every other lesson.
      group.lessons.forEach((lesson, index) => {
        lesson.tutorial.videos = index === 0 ? [sourceVideo] : [];
        lesson.tutorial.resources = index === 0 && sourceVideo.url ? [sourceVideo.url] : [];
        lesson.tutorial.resourceStatus = index === 0 ? "ready" : "unavailable";
        lesson.tutorial.selection = index === 0 ? { algorithm: "shared-node-single-video", selectedVideoId: sourceVideo.videoId, selectedVideoTitle: sourceVideo.title, resourceLanguage: entry.language || options.language || "en" } : null;
      });
    }
  }

  // The legacy path for project lessons is intentionally unchanged.
  for (const { lesson } of projectRequests) {
    try {
      const ranked = await attachProjectYouTubeVideos({ ...lesson.project, title: lesson.title }, preferredLanguages);
      lesson.project.videos = ranked;
      lesson.project.resources = ranked.map((video) => video.url);
      if (ranked.length) allSources.push(...ranked);
    } catch (error) {
      console.error("YouTube project resource attachment failed", safeTelemetryError(error));
      lesson.project.videos = [];
    }
  }

  if (typeof normalizeMultiVideoLessons === "function") normalizeMultiVideoLessons(course);
  return allSources;
}
