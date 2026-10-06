import OpenAI from "openai";
import { env } from "../config/env.js";

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

async function searchYouTube(query, maxResults = 8) {
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

export async function generateCoursePlan({ topic, level = "Beginner", goals = [] }) {
  if (!client) {
    const error = new Error("AI provider is not configured");
    error.status = 503;
    throw error;
  }

  const videos = await searchYouTube(topic, 10);

  const prompt = `
Create a production-ready learning course for BuddyForStudy.

Topic: ${topic}
Level: ${level}
Learning goals: ${goals.join(", ") || "Build practical skills"}

Use the supplied YouTube candidates only as supporting resources. Do not invent video URLs.

Return ONLY valid JSON matching:
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
      "order": 1,
      "lessons": [
        {
          "title": "string",
          "description": "string",
          "type": "tutorial|project",
          "order": 1,
          "tutorial": { "content": "string", "resources": ["string"] },
          "project": {
            "description": "string",
            "objectives": ["string"],
            "requirements": ["string"],
            "instructions": "string",
            "expectedOutcome": "string",
            "resources": ["string"],
            "submissionRequirements": ["string"]
          }
        }
      ]
    }
  ]
}

Every course should progress from fundamentals to practical application. Include project lessons where appropriate.

YouTube candidates:
${JSON.stringify(videos)}
`;

  const response = await client.responses.create({
    model: env.openaiModel,
    input: [{ role: "user", content: prompt }]
  });

  const text = response.output_text?.trim();
  if (!text) throw new Error("AI provider returned an empty response");

  let course;
  try {
    course = JSON.parse(text);
  } catch {
    const error = new Error("AI provider returned invalid course JSON");
    error.status = 502;
    throw error;
  }

  return { course, sources: videos };
}
