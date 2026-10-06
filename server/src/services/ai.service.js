import OpenAI from "openai";
import { env } from "../config/env.js";

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

async function searchYouTube(query, maxResults = 5) {
  if (!env.youtubeApiKey) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", env.youtubeApiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error("YouTube search failed");
  const data = await response.json();
  return (data.items || []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || ""
  }));
}

function normalizeRoadmap(course) {
  const modules = Array.isArray(course.modules) ? course.modules : [];
  return modules
    .map((module, index) => ({
      ...module,
      order: index + 1,
      lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
        ...lesson,
        order: lessonIndex + 1
      }))
    }))
    .filter((module) => module.title && module.lessons.length);
}

async function buildRoadmap({ topic, level, goals }) {
  const prompt = `
You are BuddyForStudy's curriculum architect.

The user searched for: "${topic}"
Level: ${level}
Goals: ${goals.join(", ") || "Become job-ready with practical projects"}

First understand the user's intent. If the topic is a technology stack, decompose it into its real prerequisite technologies and teach them in dependency order.

For example, for "MERN Stack", the roadmap should normally cover:
HTML → CSS → project → JavaScript → project → React → project → Node.js → Express.js → MongoDB → full-stack project.
Do not blindly copy this example if the user's requested stack is different. Infer the correct technologies and dependencies.

Rules:
1. Start with prerequisites before framework-specific technologies.
2. Put a practical project after major learning stages.
3. Projects must use only technologies already taught.
4. Finish with an integrated capstone project using the complete requested stack.
5. Do not put multiple unrelated technologies into one vague module.
6. Include enough lessons to genuinely teach each technology.
7. Every tutorial lesson needs a specific searchable topic.
8. Every project lesson needs a concrete project brief.
9. Return ONLY valid JSON.

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
      "title": "HTML Fundamentals",
      "description": "string",
      "lessons": [
        {
          "title": "specific lesson",
          "description": "string",
          "type": "tutorial",
          "tutorial": { "content": "string", "searchQuery": "specific YouTube search query" }
        },
        {
          "title": "HTML Project",
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
}
`;

  const response = await client.responses.create({
    model: env.openaiModel,
    input: [{ role: "user", content: prompt }]
  });

  const raw = response.output_text?.trim();
  if (!raw) throw new Error("AI provider returned an empty roadmap");

  const normalized = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(normalized);
  } catch {
    const error = new Error("AI provider returned invalid roadmap JSON");
    error.status = 502;
    throw error;
  }
}

async function attachResources(course) {
  const allSources = [];
  for (const module of course.modules || []) {
    for (const lesson of module.lessons || []) {
      if (lesson.type !== "tutorial") continue;
      const query = lesson.tutorial?.searchQuery || `${course.title} ${lesson.title} tutorial`;
      const videos = await searchYouTube(query, 3);
      lesson.tutorial ||= {};
      lesson.tutorial.resources = videos.map((video) => video.url);
      lesson.tutorial.videos = videos;
      delete lesson.tutorial.searchQuery;
      allSources.push(...videos);
    }
  }
  return allSources;
}

export async function generateCoursePlan({ topic, level = "Beginner", goals = [] }) {
  if (!client) {
    const error = new Error("AI provider is not configured");
    error.status = 503;
    throw error;
  }

  const course = await buildRoadmap({ topic, level, goals });
  course.modules = normalizeRoadmap(course);
  const sources = await attachResources(course);

  return { course, sources };
}
