import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { env } from "../config/env.js";

const geminiClient = env.geminiApiKey
  ? new GoogleGenAI({ apiKey: env.geminiApiKey })
  : null;

const openaiClient = (env.openrouterApiKey || env.openaiApiKey)
  ? new OpenAI({
      apiKey: env.openrouterApiKey || env.openaiApiKey,
      ...(env.openrouterApiKey ? { baseURL: env.openrouterBaseUrl } : {})
    })
  : null;

async function searchYouTube(query, maxResults = 8) {
  if (!env.youtubeApiKey) {
    console.warn("YouTube resources disabled: YOUTUBE_API_KEY is missing");
    return [];
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("videoSyndicated", "true");
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("regionCode", "IN");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("order", "relevance");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(maxResults, 10)));
  url.searchParams.set("key", env.youtubeApiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || "unknown error";
    throw new Error(`YouTube search failed: ${reason}`);
  }

  return (data.items || [])
    .filter((item) => item.id?.videoId && item.snippet?.title)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description || "",
      channelTitle: item.snippet.channelTitle || "",
      publishedAt: item.snippet.publishedAt || null,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ""
    }));
}

function parseJson(raw) {
  let normalized = String(raw || "").trim();

  normalized = normalized
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();

  try {
    return JSON.parse(normalized);
  } catch {
    const firstObject = normalized.indexOf("{");
    const lastObject = normalized.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      try {
        return JSON.parse(normalized.slice(firstObject, lastObject + 1));
      } catch {
        // Fall through to the consistent provider error below.
      }
    }

    const error = new Error("AI provider returned invalid JSON");
    error.status = 502;
    throw error;
  }
}

async function generateWithGemini(prompt) {
  if (!geminiClient) {
    const error = new Error("Gemini AI provider is not configured");
    error.status = 503;
    throw error;
  }

  const response = await geminiClient.models.generateContent({
    model: env.geminiModel,
    contents: prompt,
    config: {
      systemInstruction:
        "You are a structured-output engine. Return only valid JSON. Do not use Markdown fences, commentary, or explanations outside the JSON object.",
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingLevel: "low"
      },
      maxOutputTokens: 20000
    }
  });

  const content = response.text;

  if (!content) {
    throw new Error("Gemini AI provider returned an empty response");
  }

  return parseJson(content);
}

async function generateWithOpenRouter(prompt) {
  if (!openaiClient) {
    const error = new Error("OpenRouter/OpenAI AI provider is not configured");
    error.status = 503;
    throw error;
  }

  const request = {
    model: env.openrouterApiKey ? env.openrouterModel : env.openaiModel,
    messages: [
      {
        role: "system",
        content: "You are a structured-output engine. Return only valid JSON. Do not use Markdown fences, commentary, or explanations outside the JSON object."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    max_completion_tokens: 16000,
    reasoning: { effort: "low" },
    response_format: { type: "json_object" },
    ...(env.openrouterApiKey ? { provider: { require_parameters: true } } : {})
  };

  const response = await openaiClient.chat.completions.create(request);
  const choice = response.choices?.[0];
  const content = choice?.message?.content;

  if (!content) {
    console.error("AI fallback provider returned no text content", {
      model: request.model,
      finishReason: choice?.finish_reason || null,
      usage: response.usage || null,
      hasReasoning: Boolean(choice?.message?.reasoning),
      responseId: response.id || null
    });

    const error = new Error(
      choice?.finish_reason === "length"
        ? "AI fallback provider reached its completion limit before returning JSON"
        : "AI fallback provider returned an empty response"
    );
    error.status = 502;
    throw error;
  }

  return parseJson(content);
}

async function generateStructuredJson(prompt) {
  if (!geminiClient && !openaiClient) {
    const error = new Error("AI provider is not configured");
    error.status = 503;
    throw error;
  }

  if (geminiClient) {
    try {
      return await generateWithGemini(prompt);
    } catch (error) {
      console.error("Gemini AI request failed; trying fallback provider", {
        model: env.geminiModel,
        message: error.message
      });
    }
  }

  if (openaiClient) {
    try {
      return await generateWithOpenRouter(prompt);
    } catch (error) {
      const providerError = new Error(
        env.openrouterApiKey
          ? `OpenRouter AI request failed: ${error.message}`
          : error.message
      );
      providerError.status = error.status || 502;
      throw providerError;
    }
  }

  const error = new Error("All configured AI providers failed");
  error.status = 502;
  throw error;
}

function normalizeRoadmap(course) {
  const modules = Array.isArray(course.modules) ? course.modules : [];
  return {
    ...course,
    modules: modules
      .map((module, index) => ({
        ...module,
        order: index + 1,
        lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
          ...lesson,
          id: String(lesson.id || lesson._id || `module-${index + 1}-lesson-${lessonIndex + 1}`),
          order: lessonIndex + 1
        }))
      }))
      .filter((module) => module.title && module.lessons.length)
  };
}

async function understandTopic({ topic, level, goals }) {
  const prompt = `You are BuddyForStudy's learning-path intelligence engine.

User query: "${topic}"
Learner level: ${level}
Goals: ${goals.join(", ") || "Become job-ready with practical projects"}

Convert the query into a structured skill graph. Do NOT generate videos yet.

For a technology stack, identify:
- the actual technologies/skills
- prerequisite relationships
- sensible learning stages
- practical project checkpoints
- final capstone requirements

Example only: MERN normally implies HTML/CSS fundamentals, JavaScript, React, Node.js, Express.js and MongoDB. Do not blindly copy this for other stacks.

Return ONLY JSON:
{
  "intent": "string",
  "canonicalTopic": "string",
  "careerOutcome": "string",
  "skills": [
    {
      "id": "stable-kebab-id",
      "name": "string",
      "category": "foundation|language|frontend|backend|database|devops|tooling|other",
      "importance": "core|supporting",
      "prerequisites": ["skill-id"],
      "practiceProject": "string"
    }
  ]
}`;
  return generateStructuredJson(prompt);
}

async function buildCurriculum({ understanding, level, goals }) {
  const prompt = `You are BuddyForStudy's curriculum architect.

Build a complete learning curriculum from this skill graph:
${JSON.stringify(understanding)}

Learner level: ${level}
Goals: ${goals.join(", ") || "Become job-ready with practical projects"}

Rules:
1. Respect prerequisite order. A skill cannot be taught before its prerequisites.
2. Group closely related skills into coherent stages.
3. Use a project checkpoint after a meaningful group of skills, not mechanically after every lesson.
4. A project may use ONLY skills already introduced.
5. End with an integrated capstone using the core stack.
6. Every tutorial must have a precise searchable topic.
7. Include learning outcomes and estimated duration.
8. Do not invent unrelated technologies.
9. Add a short 3-5 question quiz to each module. Questions must test concepts actually taught in that module. Use exactly four options and zero-based answer indexes.
10. Return ONLY valid JSON.

Return:
{
  "title": "string",
  "description": "string",
  "category": "string",
  "level": "Beginner|Intermediate|Advanced",
  "duration": "string",
  "learningOutcomes": ["string"],
  "modules": [
    {
      "title": "string",
      "description": "string",
      "skillIds": ["skill-id"],
      "quiz": {
        "title": "Module quiz",
        "questions": [
          {
            "question": "string",
            "options": ["string", "string", "string", "string"],
            "answer": 0,
            "explanation": "string"
          }
        ]
      },
      "lessons": [
        {
          "title": "string",
          "description": "string",
          "type": "tutorial",
          "tutorial": {
            "content": "string",
            "searchQuery": "specific YouTube search query"
          }
        },
        {
          "title": "string",
          "description": "string",
          "type": "project",
          "project": {
            "description": "string",
            "objectives": ["string"],
            "requirements": ["string"],
            "instructions": "string",
            "expectedOutcome": "string",
            "submissionRequirements": ["string"]
          }
        }
      ]
    }
  ]
}`;
  return generateStructuredJson(prompt);
}

function scoreVideo(video, lesson) {
  const text = `${video.title} ${video.description} ${video.channelTitle}`.toLowerCase();
  const terms = String(lesson.title).toLowerCase().split(/[^a-z0-9+#.]+/).filter((x) => x.length > 2);
  const queryTerms = String(lesson.tutorial?.searchQuery || "").toLowerCase().split(/[^a-z0-9+#.]+/).filter((x) => x.length > 2);
  const exact = terms.filter((term) => text.includes(term)).length;
  const queryMatch = queryTerms.filter((term) => text.includes(term)).length;
  const educational = /(tutorial|course|learn|beginner|explained|full course|project)/i.test(text) ? 2 : 0;
  const penalty = /(shorts|#shorts)/i.test(text) ? 5 : 0;
  return exact * 3 + queryMatch + educational - penalty;
}

function isUsableVideo(video, lesson) {
  if (!video?.videoId || !video?.url || !video.title) return false;
  const text = `${video.title} ${video.description}`.toLowerCase();
  if (/(#shorts|\bshorts\b)/i.test(text)) return false;
  return scoreVideo(video, lesson) > 0;
}

function uniqueVideos(videos) {
  const seen = new Set();
  return videos.filter((video) => {
    const key = video.videoId || video.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function attachResources(course) {
  const allSources = [];
  const searchCache = new Map();

  const searchWithCache = async (query) => {
    const normalizedQuery = String(query).trim().toLowerCase();
    if (!normalizedQuery) return [];
    if (!searchCache.has(normalizedQuery)) {
      searchCache.set(normalizedQuery, searchYouTube(query, 8));
    }
    return searchCache.get(normalizedQuery);
  };

  for (const module of course.modules || []) {
    for (const lesson of module.lessons || []) {
      if (lesson.type !== "tutorial") continue;

      const primaryQuery =
        lesson.tutorial?.searchQuery ||
        `${course.title} ${lesson.title} tutorial`;

      const fallbackQuery = `${lesson.title} tutorial programming`;

      let videos = [];
      try {
        videos = await searchWithCache(primaryQuery);

        if (!videos.length && fallbackQuery.toLowerCase() !== primaryQuery.toLowerCase()) {
          videos = await searchWithCache(fallbackQuery);
        }
      } catch (error) {
        console.error("YouTube resource search failed", {
          lesson: lesson.title,
          query: primaryQuery,
          message: error.message
        });
      }

      const ranked = uniqueVideos(videos)
        .filter((video) => isUsableVideo(video, lesson))
        .map((video) => ({ ...video, relevanceScore: scoreVideo(video, lesson) }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 3);

      lesson.tutorial ||= {};
      lesson.tutorial.resources = ranked.map((video) => video.url);
      lesson.tutorial.videos = ranked;
      lesson.tutorial.resourceStatus = ranked.length ? "ready" : "unavailable";
      delete lesson.tutorial.searchQuery;

      console.log("YouTube resources attached", {
        lesson: lesson.title,
        videos: ranked.length
      });

      allSources.push(...ranked);
    }
  }

  return allSources;
}

export async function generateCoursePlan({ topic, level = "Beginner", goals = [] }) {
  if (!geminiClient && !openaiClient) {
    const error = new Error("AI provider is not configured");
    error.status = 503;
    throw error;
  }
  const understanding = await understandTopic({ topic, level, goals });
  const course = normalizeRoadmap(await buildCurriculum({ understanding, level, goals }));
  const sources = await attachResources(course);
  return {
    query: topic,
    intent: understanding.intent,
    canonicalTopic: understanding.canonicalTopic,
    careerOutcome: understanding.careerOutcome,
    skillGraph: understanding.skills,
    course,
    sources
  };
}
