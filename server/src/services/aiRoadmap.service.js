import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { generateCoursePlan as generateKnowledgeBaseCoursePlan } from "./roadmapGenerator.service.js";
import { attachYouTubeResources } from "./youtube.service.js";

const client = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

const roadmapSchema = {
  type: "object",
  properties: {
    canonicalTopic: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    careerOutcome: { type: "string" },
    category: { type: "string" },
    learningOutcomes: { type: "array", items: { type: "string" } },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          importance: { type: "string" },
          prerequisites: { type: "array", items: { type: "string" } },
          topics: { type: "array", items: { type: "string" } },
          searchQueries: { type: "array", items: { type: "string" } },
          practiceProject: { type: "string" },
          durationMinutes: { type: "integer" }
        },
        required: ["id", "name", "category", "importance", "prerequisites", "topics", "searchQueries", "practiceProject", "durationMinutes"]
      }
    }
  },
  required: ["canonicalTopic", "title", "description", "careerOutcome", "category", "learningOutcomes", "skills"]
};

function normalizeId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function topoSort(skills) {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const state = new Map();
  const result = [];

  function visit(skill) {
    const current = state.get(skill.id);
    if (current === "done") return;
    if (current === "visiting") return;
    state.set(skill.id, "visiting");
    for (const prerequisite of skill.prerequisites || []) {
      const normalized = normalizeId(prerequisite);
      const dependency = byId.get(normalized) || [...byId.values()].find((item) => item.name.toLowerCase() === String(prerequisite).toLowerCase());
      if (dependency) visit(dependency);
    }
    state.set(skill.id, "done");
    result.push(skill);
  }

  skills.forEach(visit);
  return result;
}

function buildCourse(ai, { level, studyTimeMinutesPerDay, goals, knownSkills }) {
  const orderedSkills = topoSort(ai.skills.map((skill) => ({
    ...skill,
    id: normalizeId(skill.id || skill.name),
    prerequisites: (skill.prerequisites || []).map(normalizeId),
    durationMinutes: Math.max(30, Math.min(2400, Number(skill.durationMinutes) || 120)),
    topics: skill.topics?.slice(0, 12) || [],
    searchQueries: (skill.searchQueries?.length ? skill.searchQueries : [`${skill.name} complete course tutorial`]).slice(0, 2)
  })));

  const known = new Set((knownSkills || []).map((item) => String(item).trim().toLowerCase()));
  const skippedSkills = [];
  const activeSkills = orderedSkills.filter((skill) => {
    if (known.has(skill.id) || known.has(skill.name.toLowerCase())) {
      skippedSkills.push(skill.name);
      return false;
    }
    return true;
  });

  const modules = activeSkills.map((skill, index) => ({
    title: skill.name,
    description: `AI-selected ${skill.name} stage for a ${level} learner, ordered after its prerequisites.`,
    skillIds: [skill.id],
    order: index + 1,
    quiz: null,
    lessons: [
      {
        id: `${skill.id}-tutorial`,
        title: `Learn ${skill.name}`,
        description: `Master ${skill.topics.slice(0, 5).join(", ")}.`,
        type: "tutorial",
        tutorial: {
          content: `Core topics: ${skill.topics.join(", ")}.`,
          searchQuery: skill.searchQueries[0],
          searchQueries: skill.searchQueries,
          requiredTopics: skill.topics,
          durationMinutes: { min: Math.round(skill.durationMinutes * 0.5), max: skill.durationMinutes }
        }
      },
      {
        id: `${skill.id}-project`,
        title: skill.practiceProject,
        description: "Apply this stage before moving to the next prerequisite-dependent skill.",
        type: "project",
        project: {
          description: skill.practiceProject,
          objectives: skill.topics.slice(0, 5).map((topic) => `Use ${topic}`),
          requirements: skill.topics.slice(0, 5),
          instructions: `Build the project using the skills introduced up to ${skill.name}. Test the main flows and document the result.`,
          expectedOutcome: `A working project demonstrating practical ${skill.name} skills.`,
          submissionRequirements: ["Source code repository", "README with setup instructions", "Short project demonstration"]
        }
      }
    ]
  }));

  const totalMinutes = activeSkills.reduce((sum, skill) => sum + skill.durationMinutes, 0);
  const days = Math.max(1, Math.ceil(totalMinutes / Math.max(30, studyTimeMinutesPerDay || 60)));

  return {
    course: {
      title: ai.title,
      description: ai.description,
      category: ai.category,
      level,
      duration: `${days} study days at ${studyTimeMinutesPerDay || 60} min/day`,
      learningOutcomes: ai.learningOutcomes,
      modules
    },
    skillGraph: activeSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      importance: skill.importance,
      prerequisites: skill.prerequisites,
      practiceProject: skill.practiceProject
    })),
    personalization: {
      goals,
      studyTimeMinutesPerDay: studyTimeMinutesPerDay || 60,
      knownSkills: knownSkills || [],
      skippedSkills,
      rationale: [
        `Ordered skills by prerequisites for a ${level} learner.`,
        goals.length ? `Prioritized the roadmap around: ${goals.join(", ")}.` : "Used a balanced learning progression.",
        `Estimated the plan around ${studyTimeMinutesPerDay || 60} minutes per day.`
      ]
    }
  };
}

async function generateWithGemini({ topic, level, goals, studyTimeMinutesPerDay, knownSkills }) {
  if (!client) {
    const error = new Error("Gemini AI is not configured. Add GEMINI_API_KEY to build a personalized roadmap.");
    error.status = 503;
    throw error;
  }

  const prompt = [
    "You are BuddyForStudy's curriculum architect.",
    "Create a realistic prerequisite-ordered learning curriculum for the learner.",
    "This is NOT a search result. Design a learning path from first principles to the stated outcome.",
    "Infer the important skills even when the topic is broad or uncommon.",
    "Use concise skill IDs in lowercase kebab-case.",
    "Every prerequisite must refer to another skill id or exact skill name in the same skills list.",
    "Do not add a prerequisite that is not needed.",
    "Include practical projects after major skill stages.",
    "Create 5-12 skills for broad technologies/careers and 3-8 for focused topics.",
    "Create useful YouTube search queries for each skill; do not invent video URLs.",
    "",
    `Topic: ${topic}`,
    `Learner level: ${level}`,
    `Goals: ${JSON.stringify(goals)}`,
    `Study time per day: ${studyTimeMinutesPerDay || 60} minutes`,
    `Already known skills: ${JSON.stringify(knownSkills || [])}`
  ].join("\n");

  const response = await client.models.generateContent({
    model: env.geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: roadmapSchema,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
      maxOutputTokens: 12000
    }
  });

  let value;
  try {
    value = JSON.parse(response.text);
  } catch {
    const error = new Error("AI roadmap provider returned invalid structured data");
    error.status = 502;
    throw error;
  }

  if (!value?.skills?.length) {
    const error = new Error("AI roadmap provider returned no learning skills");
    error.status = 502;
    throw error;
  }
  return value;
}

export async function generateAIRoadmap(input) {
  try {
    const ai = await generateWithGemini(input);
    const built = buildCourse(ai, input);
    const sources = await attachYouTubeResources(built.course);
    return {
      query: input.topic,
      intent: "ai_personalized_path",
      canonicalTopic: ai.canonicalTopic,
      careerOutcome: ai.careerOutcome,
      skillGraph: built.skillGraph,
      course: built.course,
      sources,
      personalization: built.personalization
    };
  } catch (error) {
    if (error?.status === 429 || /quota|resource_exhausted|rate limit/i.test(String(error?.message || ""))) throw error;
    const fallback = await generateKnowledgeBaseCoursePlan({ topic: input.topic, level: input.level });
    return {
      ...fallback,
      intent: "ai_personalized_path_fallback",
      personalization: {
        goals: input.goals || [],
        studyTimeMinutesPerDay: input.studyTimeMinutesPerDay || 60,
        knownSkills: input.knownSkills || [],
        skippedSkills: [],
        rationale: ["AI generation was unavailable, so BuddyForStudy used its validated prerequisite knowledge base."]
      }
    };
  }
}
