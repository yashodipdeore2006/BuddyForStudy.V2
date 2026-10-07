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
  const text=`${video.title} ${video.description} ${(video.tags||[]).join(" ")}`.toLowerCase();
  const topics=[...new Set(requiredTopics||[])];
  if(!topics.length) return 50;
  const matched=topics.filter((topic)=>tokenize(topic).some((word)=>text.includes(word))).length;
  return Math.round((matched/topics.length)*100);
}
function relevanceScore(video,query) {
  const text=`${video.title} ${video.description} ${(video.tags||[]).join(" ")}`.toLowerCase();
  const terms=[...new Set(tokenize(query))];
  if(!terms.length) return 50;
  return Math.round((terms.filter((term)=>text.includes(term)).length/terms.length)*100);
}
function durationScore(seconds,expected={min:30,max:180}) {
  const minutes=seconds/60;
  if(!minutes)return 0;
  if(minutes>=expected.min&&minutes<=expected.max)return 100;
  if(minutes<expected.min)return clamp(100-((expected.min-minutes)/Math.max(expected.min,1))*100);
  return clamp(100-((minutes-expected.max)/Math.max(expected.max,1))*60);
}
function recencyScore(publishedAt){const ageDays=Math.max(0,(Date.now()-new Date(publishedAt||Date.now()).getTime())/86400000);return clamp(100-(ageDays/3650)*100);}
function logMetric(value){return Math.log10(Math.max(1,Number(value||0))+1);}
function normalizedMetric(values,value){const max=Math.max(...values,1);return clamp((value/max)*100);}

function scoreCandidate(video,lesson,pool) {
  const coverage=coverageScore(video,lesson.tutorial?.requiredTopics);
  const relevance=relevanceScore(video,lesson.tutorial?.searchQuery||lesson.title);
  const duration=durationScore(video.durationSeconds,lesson.tutorial?.durationMinutes);
  const views=normalizedMetric(pool.map((v)=>logMetric(v.viewCount)),logMetric(video.viewCount));
  const likes=normalizedMetric(pool.map((v)=>logMetric(v.likeCount)),logMetric(video.likeCount));
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
  const response=await fetch(url);
  const data=await response.json();
  if(!response.ok){const reason=data?.error?.errors?.[0]?.reason||data?.error?.message||"unknown error";throw new Error(`YouTube ${endpoint} failed: ${reason}`);}
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
  if(missing.length){
    const data=await youtubeRequest("videos",{part:"snippet,contentDetails,statistics,status",id:missing.slice(0,50).join(",")});
    for(const item of data?.items||[])VIDEO_CACHE.set(item.id,item);
  }
  return videoIds.map((id)=>VIDEO_CACHE.get(id)).filter(Boolean);
}
async function getChannelDetails(channelIds){
  const missing=channelIds.filter((id)=>!CHANNEL_CACHE.has(id));
  if(missing.length){
    const data=await youtubeRequest("channels",{part:"statistics",id:missing.slice(0,50).join(",")});
    for(const item of data?.items||[])CHANNEL_CACHE.set(item.id,item);
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
    const candidates=[...new Set(items.map((item)=>item.id?.videoId).filter(Boolean))]
      .map((id)=>toCandidate(byId.get(id),channelMap.get(byId.get(id)?.snippet?.channelId)))
      .filter((video)=>video&&!video.isShort&&video.embeddable);
    const ranked=candidates.map((video)=>({...video,...scoreCandidate(video,lesson,candidates)})).sort((a,b)=>b.score-a.score).slice(0,3);
    lesson.tutorial.videos=ranked;
    lesson.tutorial.resources=ranked.map((video)=>video.url);
    lesson.tutorial.resourceStatus=ranked.length?"ready":"unavailable";
    lesson.tutorial.selection=ranked[0]?{
      algorithm:"metadata-v1",
      weights:{relevance:.30,coverage:.30,duration:.10,views:.08,likeRatio:.08,subscribers:.05,recency:.05,embeddable:.04}
    }:null;
    delete lesson.tutorial.searchQuery;
    allSources.push(...ranked);
    console.log("YouTube resources ranked",{lesson:lesson.title,candidates:candidates.length,selected:ranked.length,topScore:ranked[0]?.score||0,topVideo:ranked[0]?.title||null});
  }
  return allSources;
}
