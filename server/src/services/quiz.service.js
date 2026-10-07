import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

const geminiClient = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

function parseJson(raw) {
  const normalized = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(normalized); } catch {
    const first = normalized.indexOf("{");
    const last = normalized.lastIndexOf("}");
    if (first !== -1 && last > first) return JSON.parse(normalized.slice(first, last + 1));
    const error = new Error("Gemini quiz provider returned invalid JSON");
    error.status = 502;
    throw error;
  }
}

function validateQuiz(value) {
  if (!value || !Array.isArray(value.questions) || value.questions.length < 3 || value.questions.length > 5) {
    throw Object.assign(new Error("Gemini returned an invalid quiz"), { status: 502 });
  }
  const questions = value.questions.map((question, index) => {
    if (!question?.question || !Array.isArray(question.options) || question.options.length !== 4) {
      throw Object.assign(new Error("Gemini returned an invalid quiz question at index " + index), { status: 502 });
    }
    const answer = Number(question.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
      throw Object.assign(new Error("Gemini returned an invalid answer index at question " + (index + 1)), { status: 502 });
    }
    return { question: String(question.question), options: question.options.map((option) => String(option)), answer, explanation: String(question.explanation || "") };
  });
  return { title: String(value.title || "Module Quiz"), questions };
}

export async function generateModuleQuiz({ module, courseTitle, level = "Beginner" }) {
  if (!geminiClient) {
    const error = new Error("Gemini quiz provider is not configured");
    error.status = 503;
    throw error;
  }

  const lessons = (module.lessons || []).map((lesson) => ({
    title: lesson.title,
    type: lesson.type,
    description: lesson.description,
    topics: lesson.tutorial?.requiredTopics || [],
    project: lesson.project?.objectives || []
  }));

  const prompt = [
    "You are BuddyForStudy quiz generator.",
    "",
    "Course: " + courseTitle,
    "Module: " + module.title,
    "Learner level: " + level,
    "",
    "Create 5 multiple-choice questions using ONLY the learning material below.",
    "Do not test topics that are not present in the module.",
    "Questions should test understanding, not trivia.",
    "Each question must have exactly four plausible options and exactly one correct answer.",
    "The answer field must be the zero-based option index.",
    "Return ONLY valid JSON.",
    "",
    "Learning material:",
    JSON.stringify(lessons)
  ].join("\n");

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await geminiClient.models.generateContent({
        model: env.geminiModel,
        contents: prompt,
        config: {
          systemInstruction: "Return only valid JSON. No Markdown fences or commentary.",
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "MINIMAL" },
          maxOutputTokens: 5000
        }
      });
      return validateQuiz(parseJson(response.text));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  throw lastError;
}