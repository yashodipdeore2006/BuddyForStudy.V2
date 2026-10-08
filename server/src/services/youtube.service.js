import { env } from "../config/env.js";

const SEARCH_CACHE = new Map();
const VIDEO_CACHE = new Map();
const CHANNEL_CACHE = new Map();

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
  const key=query.trim().toLowerCase();
  if(SEARCH_CACHE.has(key))return SEARCH_CACHE.get(key);
  const promise=youtubeRequest("search",{part:"snippet",type:"video",videoEmbeddable:"true",videoSyndicated:"true",relevanceLanguage:"en",regionCode:"IN",safeSearch:"moderate",order:"relevance",q:query,maxResults:Math.min(maxResults,50)});
  SEARCH_CACHE.set(key,promise);
  return promise;
}
async function getVideoDetails(videoIds){
  const missing=videoIds.filter((id)=>!VIDEO_CACHE.has(id));
  for(let index=0;index<missing.length;index+=50){
    const batch=missing.slice(index,index+50);
    if(!batch.length) continue;
    const data=await youtubeRequest("videos",{part:"snippet,contentDetails,statistics,status",id:batch.join(",")});
    for(const item of data?.items||[]) VIDEO_CACHE.set(item.id,item);
  }
  return videoIds.map((id)=>VIDEO_CACHE.get(id)).filter(Boolean);
}
async function getChannelDetails(channelIds){
  const missing=channelIds.filter((id)=>!CHANNEL_CACHE.has(id));
  for(let index=0;index<missing.length;index+=50){
    const batch=missing.slice(index,index+50);
    if(!batch.length) continue;
    const data=await youtubeRequest("channels",{part:"statistics",id:batch.join(",")});
    for(const item of data?.items||[]) CHANNEL_CACHE.set(item.id,item);
  }
  return channelIds.map((id)=>CHANNEL_CACHE.get(id)).filter(Boolean);
}
function toCandidate(video,channel){
  if(!video)return null;
  const durationSeconds=parseIsoDuration(video.contentDetails?.duration);
  const title=video.snippet?.title||"";
  const description=video.snippet?.description||"";
  return {
    videoId:video.id,title,description,tags:video.snippet?.tags||[],channelId:video.snippet?.channelId||"",
    channelTitle:video.snippet?.channelTitle||"",publishedAt:video.snippet?.publishedAt||null,
    durationSeconds,duration:video.contentDetails?.duration||"",
    viewCount:Number(video.statistics?.viewCount||0),likeCount:Number(video.statistics?.likeCount||0),
    subscriberCount:Number(channel?.statistics?.subscriberCount||0),
    embeddable:video.status?.embeddable!==false,
    url:`https://www.youtube.com/watch?v=${video.id}`,embedUrl:`https://www.youtube.com/embed/${video.id}`,
    thumbnail:video.snippet?.thumbnails?.high?.url||video.snippet?.thumbnails?.medium?.url||video.snippet?.thumbnails?.default?.url||"",
    isShort:/(^|[\s#])shorts?([\s#]|$)/i.test(title)||durationSeconds<=60
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

export async function searchBestYouTubeCourse({ skill, searchQueries, searchPolicy }) {
  if (!env.youtubeApiKey) return null;

  const queries = (searchQueries || []).slice(0, 3);
  const items = [];
  for (const query of queries) {
    try {
      const data = await searchVideos(query, 20);
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

export async function searchYouTubeCourseRecommendations(query, maxResults = 3) {
  if (!env.youtubeApiKey) return [];

  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return [];

  const searchQuery = normalizedQuery + " complete course tutorial";
  const data = await searchVideos(searchQuery, 20);
  const items = data?.items || [];

  const uniqueIds = [...new Set(items.map((item) => item.id?.videoId).filter(Boolean))];
  const videoDetails = await getVideoDetails(uniqueIds);
  const channelIds = [...new Set(videoDetails.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = await getChannelDetails(channelIds);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const byId = new Map(videoDetails.map((video) => [video.id, video]));

  const searchPolicy = {
    minDurationMinutes: 45,
    targetDurationMinutes: 360,
    maxDurationMinutes: 1440,
    excludeShorts: true,
    requireEmbeddable: true,
    preferProjectBased: true,
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
    .slice(0, Math.max(1, Math.min(Number(maxResults) || 3, 5)));
}
export async function attachYouTubeResources(course){
  if(!env.youtubeApiKey){console.warn("YouTube resources disabled: YOUTUBE_API_KEY is missing");return [];}
  const lessonRequests=[];
  for(const module of course.modules||[]) for(const lesson of module.lessons||[]) if(lesson.type==="tutorial"){
    lessonRequests.push({lesson,queries:(lesson.tutorial?.searchQueries||[lesson.tutorial?.searchQuery||`${course.title} ${lesson.title} tutorial`]).slice(0,2)});
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
    const candidates=[...new Set(items.map((item)=>item.id?.videoId).filter(Boolean))]
      .map((id)=>toCandidate(byId.get(id),channelMap.get(byId.get(id)?.snippet?.channelId)))
      .filter((video)=>video
        && (!policy.excludeShorts || !video.isShort)
        && (!policy.requireEmbeddable || video.embeddable)
        && video.durationSeconds >= minDuration * 60
        && video.durationSeconds <= maxDuration * 60
      );
    const ranked=candidates.map((video)=>({...video,...scoreCandidate(video,lesson,candidates)})).sort((a,b)=>b.score-a.score).slice(0,3);
    lesson.tutorial.videos=ranked;
    lesson.tutorial.resources=ranked.map((video)=>video.url);
    lesson.tutorial.resourceStatus=ranked.length?"ready":"unavailable";
    lesson.tutorial.selection=ranked[0]?{
      algorithm:"metadata-v2-hard-duration",
      weights:{relevance:.30,coverage:.30,duration:.10,views:.08,likeRatio:.08,subscribers:.05,recency:.05,embeddable:.04},
      durationPolicy: lesson.tutorial?.searchPolicy || null
    }:null;
    delete lesson.tutorial.searchQuery;
    allSources.push(...ranked);
    console.log("YouTube resources ranked",{lesson:lesson.title,candidates:candidates.length,selected:ranked.length,topScore:ranked[0]?.score||0,topVideo:ranked[0]?.title||null});
  }
  return allSources;
}
