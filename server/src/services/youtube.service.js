import { env } from "../config/env.js";

const SEARCH_CACHE = new Map();
const VIDEO_CACHE = new Map();
const CHANNEL_CACHE = new Map();
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

async function youtubeRequest(endpoint,params){
  if(!env.youtubeApiKey){console.warn("YouTube resources disabled: YOUTUBE_API_KEY is missing");return null;}
  const url=new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({...params,key:env.youtubeApiKey}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const response=await fetch(url,{headers:{"x-goog-api-key":env.youtubeApiKey}});
  const data=await response.json();
  if(!response.ok){
    const reason=data?.error?.errors?.[0]?.reason||data?.error?.status||data?.error?.message||"unknown error";
    const error=new Error(`YouTube ${endpoint} failed: ${reason}`);
    error.status=response.status===403?503:response.status;
    error.code=reason;
    throw error;
  }
  return data;
}

async function searchVideos(query,maxResults=10){
  const key=String(maxResults)+":"+query.trim().toLowerCase();
  const cached=getExpiringCache(SEARCH_CACHE,key);
  if(cached)return cached;
  const promise=youtubeRequest("search",{part:"snippet",type:"video",videoEmbeddable:"true",videoSyndicated:"true",relevanceLanguage:"en",regionCode:"IN",safeSearch:"moderate",order:"relevance",q:query,maxResults:Math.min(maxResults,50)})
    .catch((error)=>{SEARCH_CACHE.delete(key);throw error;});
  setExpiringCache(SEARCH_CACHE,key,promise,SEARCH_CACHE_TTL_MS);
  return promise;
}
async function getVideoDetails(videoIds){
  const uniqueIds=[...new Set(videoIds)];
  const missing=uniqueIds.filter((id)=>!getExpiringCache(VIDEO_CACHE,id));
  for(let index=0;index<missing.length;index+=50){
    const batch=missing.slice(index,index+50);
    if(!batch.length) continue;
    const data=await youtubeRequest("videos",{part:"snippet,contentDetails,statistics,status",id:batch.join(",")});
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
    const data=await youtubeRequest("channels",{part:"statistics",id:batch.join(",")});
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

function toCandidate(video,channel){
  if(!video)return null;
  const durationSeconds=parseIsoDuration(video.contentDetails?.duration);
  const title=video.snippet?.title||"";
  const description=video.snippet?.description||"";
  const structure=detectVideoStructure(description);
  return {
    videoId:video.id,title,description,tags:video.snippet?.tags||[],channelId:video.snippet?.channelId||"",
    channelTitle:video.snippet?.channelTitle||"",publishedAt:video.snippet?.publishedAt||null,
    defaultAudioLanguage:video.snippet?.defaultAudioLanguage||video.snippet?.defaultLanguage||"",
    durationSeconds,duration:video.contentDetails?.duration||"",
    viewCount:Number(video.statistics?.viewCount||0),likeCount:Number(video.statistics?.likeCount||0),
    commentCount:Number(video.statistics?.commentCount||0),
    subscriberCount:Number(channel?.statistics?.subscriberCount||0),
    embeddable:video.status?.embeddable!==false,
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

  const data = await youtubeRequest("videos", {
    part: "snippet,contentDetails,statistics,status",
    id
  });
  const video = data?.items?.[0];
  if (!video) {
    const error = new Error("YouTube video not found");
    error.status = 404;
    throw error;
  }

  const channelIds = video.snippet?.channelId ? [video.snippet.channelId] : [];
  const channels = await getChannelDetails(channelIds);
  const channel = channels[0];
  return toCandidate(video, channel);
}

export async function searchBestYouTubeCourse({ skill, searchQueries, searchPolicy, maxResultsPerQuery = 20 }) {
  if (!env.youtubeApiKey) return null;

  const queries = (searchQueries || []).slice(0, 3);
  const boundedMaxResults = Math.max(5, Math.min(50, Number(maxResultsPerQuery) || 20));
  const items = [];
  for (const query of queries) {
    try {
      const data = await searchVideos(query, boundedMaxResults);
      items.push(...(data?.items || []));
    } catch (error) {
      console.error("YouTube course search failed", { skill, query, message: error.message });
    }
  }

  const uniqueIds = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))];
  const videoDetails = await getVideoDetails(uniqueIds);
  const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = await getChannelDetails(channelIds);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const byId = new Map(videoDetails.map((video) => [video.id, video]));

  const minDuration = Number(searchPolicy?.minDurationMinutes || 0);
  const maxDuration = Number(searchPolicy?.maxDurationMinutes || Number.MAX_SAFE_INTEGER);

  const candidates = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))]
    .map((id) => toCandidate(byId.get(id), channelMap.get(byId.get(id)?.snippet?.channelId)))
    .filter((video) =>
      video &&
      (!searchPolicy?.excludeShorts || !video.isShort) &&
      (!searchPolicy?.requireEmbeddable || video.embeddable) &&
      video.durationSeconds >= minDuration * 60 &&
      video.durationSeconds <= maxDuration * 60
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
export async function searchYouTubeCurationCandidates(searchQueries, maxResultsPerQuery = 30) {
  if (!env.youtubeApiKey) return [];
  const queries = [...new Set((searchQueries || []).map((query) => String(query || "").trim()).filter(Boolean))].slice(0, 8);
  if (!queries.length) return [];
  const boundedResults = Math.max(5, Math.min(50, Number(maxResultsPerQuery) || 30));
  const batches = await Promise.all(queries.map(async (query) => {
    try {
      const data = await searchVideos(query, boundedResults);
      return { query, items: data?.items || [] };
    } catch (error) {
      console.error("YouTube curation candidate search failed", { query, message: error?.message || error });
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

  return videoIds.map((videoId) => {
    const video = detailMap.get(videoId);
    if (!video) return null;
    return {
      ...toCandidate(video, channelMap.get(video.snippet?.channelId)),
      matchedSearchQueries: matchesById.get(videoId).queries,
      searchMatchCount: matchesById.get(videoId).queries.length
    };
  }).filter(Boolean);
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
    preferredLanguage: "en",
    requiredTopics: [normalizedQuery]
  };

  const candidates = uniqueIds
    .map((id) => toCandidate(byId.get(id), channelMap.get(byId.get(id)?.snippet?.channelId)))
    .filter((video) =>
      video &&
      !video.isShort &&
      video.embeddable &&
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
async function attachProjectYouTubeVideos(project) {
  const queries = (project.videoSearchQueries || []).filter(Boolean).slice(0, 2);
  if (!queries.length || !env.youtubeApiKey) return [];

  const items = [];
  for (const query of queries) {
    try {
      const data = await searchVideos(query, 12);
      items.push(...(data?.items || []));
    } catch (error) {
      console.error("YouTube project tutorial search failed", {
        project: project.title || project.description,
        query,
        message: error.message
      });
    }
  }

  const uniqueIds = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const videoDetails = await getVideoDetails(uniqueIds);
  const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = await getChannelDetails(channelIds);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const byId = new Map(videoDetails.map((video) => [video.id, video]));

  const policy = {
    minDurationMinutes: 60,
    targetDurationMinutes: 360,
    maxDurationMinutes: 1500,
    excludeShorts: true,
    requireEmbeddable: true,
    preferProjectBased: true,
    preferredLanguage: "en"
  };

  const candidates = uniqueIds
    .map((id) => toCandidate(byId.get(id), channelMap.get(byId.get(id)?.snippet?.channelId)))
    .filter((video) =>
      video &&
      video.embeddable &&
      !video.isShort &&
      video.durationSeconds >= policy.minDurationMinutes * 60 &&
      video.durationSeconds <= policy.maxDurationMinutes * 60
    );

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

  return candidates
    .map((video) => ({ ...video, ...scoreCandidate(video, lesson, candidates) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 1);
}

export async function attachYouTubeResources(course){
  if(!env.youtubeApiKey){console.warn("YouTube resources disabled: YOUTUBE_API_KEY is missing");return [];}
  const lessonRequests=[];
  const projectRequests=[];
  for(const module of course.modules||[]) {
    for(const lesson of module.lessons||[]) {
      if(lesson.type==="tutorial"){
        lessonRequests.push({
          lesson,
          queries:(lesson.tutorial?.searchQueries||[lesson.tutorial?.searchQuery||course.title+" "+lesson.title+" tutorial"]).slice(0,2)
        });
      } else if(lesson.type==="project" && lesson.project?.videoSearchQueries?.length) {
        projectRequests.push({lesson});
      }
    }
  }

  const queryResults=await Promise.all(lessonRequests.map(async({lesson,queries})=>{
    const items=[];
    for(const query of queries){try{const data=await searchVideos(query,10);items.push(...(data?.items||[]));}catch(error){console.error("YouTube search failed",{lesson:lesson.title,query,message:error.message});}}
    return {lesson,items};
  }));

  const uniqueIds=[...new Set(queryResults.flatMap(({items})=>items.map((item)=>item.id?.videoId).filter(Boolean)))];
  const videoDetails=await getVideoDetails(uniqueIds);
  const channelIds=[...new Set(videoDetails.map((video)=>video.snippet?.channelId).filter(Boolean))];
  const channels=await getChannelDetails(channelIds);
  const channelMap=new Map(channels.map((channel)=>[channel.id,channel]));
  const byId=new Map(videoDetails.map((video)=>[video.id,video]));
  const allSources=[];

  for(const {lesson,items} of queryResults){
    const policy = lesson.tutorial?.searchPolicy || {};
    const minDuration = Number(policy.minDurationMinutes || 0);
    const maxDuration = Number(policy.maxDurationMinutes || Number.MAX_SAFE_INTEGER);
    const allCandidates=[...new Set(items.map((item)=>item.id?.videoId).filter(Boolean))]
      .map((id)=>toCandidate(byId.get(id),channelMap.get(byId.get(id)?.snippet?.channelId)))
      .filter((video)=>video
        && (!policy.excludeShorts || !video.isShort)
        && (!policy.requireEmbeddable || video.embeddable)
      );
    const durationMatched=allCandidates.filter((video)=>
      video.durationSeconds >= minDuration * 60
      && video.durationSeconds <= maxDuration * 60
    );

    // Prefer duration-matched videos, but use relevant eligible videos as a fallback
    // instead of leaving an entire tutorial lesson without a resource.
    const candidates=durationMatched.length ? durationMatched : allCandidates;
    const ranked=candidates.map((video)=>({...video,...scoreCandidate(video,lesson,candidates)})).sort((a,b)=>b.score-a.score).slice(0,3);
    lesson.tutorial.videos=ranked;
    lesson.tutorial.resources=ranked.map((video)=>video.url);
    lesson.tutorial.resourceStatus=ranked.length?(durationMatched.length?"ready":"fallback-duration"):"unavailable";
    lesson.tutorial.selection=ranked[0]?{
      algorithm:"metadata-v2-hard-duration",
      weights:{relevance:.30,coverage:.30,duration:.10,views:.08,likeRatio:.08,subscribers:.05,recency:.05,embeddable:.04},
      durationPolicy: lesson.tutorial?.searchPolicy || null
    }:null;
    delete lesson.tutorial.searchQuery;
    allSources.push(...ranked);
    console.log("YouTube resources ranked",{lesson:lesson.title,candidates:candidates.length,durationMatched:durationMatched.length,selected:ranked.length,resourceStatus:lesson.tutorial.resourceStatus,topScore:ranked[0]?.score||0,topVideo:ranked[0]?.title||null});
  }
  for (const { lesson } of projectRequests) {
    try {
      const ranked = await attachProjectYouTubeVideos({
        ...lesson.project,
        title: lesson.title
      });
      lesson.project.videos = ranked;
      lesson.project.resources = ranked.map((video) => video.url);
      if (ranked.length) allSources.push(...ranked);
      console.log("Project tutorial resources ranked", {
        lesson: lesson.title,
        selected: ranked.length,
        topVideo: ranked[0]?.title || null
      });
    } catch (error) {
      console.error("YouTube project resource attachment failed", {
        project: lesson.title,
        message: error instanceof Error ? error.message : String(error)
      });
      lesson.project.videos = [];
    }
  }

  return allSources;
}
