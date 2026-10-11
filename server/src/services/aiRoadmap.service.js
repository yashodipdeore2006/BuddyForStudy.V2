import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { generateCoursePlan as generateKnowledgeBaseCoursePlan } from "./roadmapGenerator.service.js";
import { attachYouTubeResources } from "./youtube.service.js";
import { Course } from "../models/Course.js";
import { buildTopicKeys, findRecentGeneratedCourse } from "./generatedCourseCache.service.js";
import { randomUUID } from "node:crypto";

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
          courseDuration: {
            type: "object",
            properties: {
              minMinutes: { type: "integer" },
              targetMinutes: { type: "integer" },
              maxMinutes: { type: "integer" }
            },
            required: ["minMinutes", "targetMinutes", "maxMinutes"]
          },
          practiceProject: { type: "string" },
          durationMinutes: { type: "integer" }
        },
        required: ["id", "name", "category", "importance", "prerequisites", "topics", "searchQueries", "courseDuration", "practiceProject"]
      }
    }
  },
  required: ["canonicalTopic", "title", "description", "careerOutcome", "category", "learningOutcomes", "skills"]
};

function normalizeId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function normalizeCourseDuration(value) {
  const minMinutes = Math.max(30, Math.min(2400, Number(value?.minMinutes) || 180));
  const targetMinutes = Math.max(minMinutes, Math.min(3000, Number(value?.targetMinutes) || minMinutes));
  const maxMinutes = Math.max(targetMinutes, Math.min(3600, Number(value?.maxMinutes) || targetMinutes));
  return { minMinutes, targetMinutes, maxMinutes };
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
    courseDuration: normalizeCourseDuration(skill.courseDuration),
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
          durationMinutes: skill.courseDuration,
          searchPolicy: {
            contentType: "complete-course",
            minDurationMinutes: skill.courseDuration.minMinutes,
            targetDurationMinutes: skill.courseDuration.targetMinutes,
            maxDurationMinutes: skill.courseDuration.maxMinutes,
            excludeShorts: true,
            requireEmbeddable: true,
            preferProjectBased: true,
            preferredLanguage: "en"
          }
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

  const totalMinutes = activeSkills.reduce((sum, skill) => sum + skill.courseDuration.targetMinutes, 0);
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
    "Preserve the user's requested topic precisely. Do not silently replace Data Analytics with Data Science, or substitute a neighboring discipline just because the topics overlap.",
    "Use the requested topic to determine the curriculum title, canonicalTopic, category, skills, and learning outcomes. Only broaden the topic when the user explicitly asks for a broad career path.",
    "If the request is a course-search phrase such as 'data analytics full course', interpret 'full course' as a completeness preference, not as a different subject.",
    "Infer the important skills even when the topic is broad or uncommon.",
    "Use concise skill IDs in lowercase kebab-case.",
    "Every prerequisite must refer to another skill id or exact skill name in the same skills list.",
    "Do not add a prerequisite that is not needed.",
    "Include practical projects after major skill stages.",
    "Create 5-12 skills for broad technologies/careers and 3-8 for focused topics.",
    "Create useful YouTube search queries for each skill; do not invent video URLs.",
    "For EVERY skill, decide a realistic complete-course duration range based on the depth required to become competent in that skill.",
    "Return minMinutes, targetMinutes, and maxMinutes for each skill.",
    "Do not use one generic duration for every skill. A deeper technology such as JavaScript may require a much longer course than a smaller focused skill.",
    "The duration range is a SEARCH CONSTRAINT for YouTube resources, not the learner's total study duration.",
    "The selected course should normally be at least minMinutes and should not exceed maxMinutes unless no acceptable candidate exists.",
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

function generatedAiSlug(title) {
  const base = String(title || "ai-course").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${base}-ai-${randomUUID().slice(0, 8)}`;
}

function buildNormalSearchSnapshot(course, query) {
  const modules = (course.modules || []).map((module, index) => {
    const lesson = (module.lessons || []).find((item) => item.type === "tutorial");
    const policy = lesson?.tutorial?.searchPolicy || {};
    const selected = lesson?.tutorial?.videos?.[0] || null;
    return {
      order: module.order || index + 1,
      title: module.title,
      skill: module.skillIds?.[0] || module.title,
      searchSpecification: {
        searchQueries: lesson?.tutorial?.searchQueries || [],
        requiredTopics: lesson?.tutorial?.requiredTopics || [module.title],
        duration: {
          minMinutes: Number(policy.minDurationMinutes || 0),
          targetMinutes: Number(policy.targetDurationMinutes || 0),
          maxMinutes: Number(policy.maxDurationMinutes || 0)
        }
      },
      course: selected ? {
        videoId: selected.videoId,
        title: selected.title,
        description: selected.description || "",
        channelTitle: selected.channelTitle || "",
        publishedAt: selected.publishedAt || null,
        durationSeconds: Number(selected.durationSeconds || 0),
        duration: selected.duration || "",
        url: selected.url || "",
        embedUrl: selected.embedUrl || "",
        thumbnail: selected.thumbnail || "",
        score: Number(selected.score || 0),
        selection: selected.selection || null
      } : null
    };
  });

  return {
    query,
    title: course.title,
    modules,
    moduleCount: modules.length,
    foundModules: modules.filter((module) => module.course).length
  };
}

function toPublicCourse(course) {
  const data = course?.toObject ? course.toObject() : course;
  if (!data) return null;
  const { generation, ...publicCourse } = data;
  return publicCourse;
}

function cachedRoadmapFromCourse(course, input) {
  const snapshot = course?.generation?.snapshot || {};
  return {
    query: course.generation?.query || input.topic,
    intent: snapshot.intent || "ai_personalized_path",
    canonicalTopic: snapshot.canonicalTopic || input.topic,
    careerOutcome: snapshot.careerOutcome || "",
    skillGraph: snapshot.skillGraph || [],
    course: toPublicCourse(course),
    sources: snapshot.sources || [],
    personalization: snapshot.personalization || {},
    cached: true
  };
}

export async function generateAIRoadmap(input) {
  const topicKeys = buildTopicKeys(input.topic);
  const existing = await findRecentGeneratedCourse({ mode: "ai", topicKeys, exactQuery: input.topic });
  if (existing) return cachedRoadmapFromCourse(existing, input);

  try {
    const ai = await generateWithGemini(input);
    const built = buildCourse(ai, input);
    const sources = await attachYouTubeResources(built.course);
    const normalSearchSnapshot = buildNormalSearchSnapshot(built.course, input.topic);

    const course = await Course.create({
      ...built.course,
      slug: generatedAiSlug(built.course.title),
      generation: {
        mode: "ai",
        query: input.topic,
        topicKeys: buildTopicKeys(input.topic, ai.canonicalTopic, ai.title, ai.category),
        snapshot: {
          intent: "ai_personalized_path",
          canonicalTopic: ai.canonicalTopic,
          careerOutcome: ai.careerOutcome,
          skillGraph: built.skillGraph,
          personalization: built.personalization,
          sources,
          normalSearchSnapshot
        }
      },
      isPublished: true,
      pricing: { mode: "free", price: 0, currency: "INR" },
      enrollmentEnabled: true,
      certificateEnabled: true
    });

    return {
      query: input.topic,
      intent: "ai_personalized_path",
      canonicalTopic: ai.canonicalTopic,
      careerOutcome: ai.careerOutcome,
      skillGraph: built.skillGraph,
      course: toPublicCourse(course),
      sources,
      personalization: built.personalization,
      cached: false
    };
  } catch (error) {
    if (error?.status === 429 || /quota|resource_exhausted|rate limit/i.test(String(error?.message || ""))) throw error;
    const fallback = await generateKnowledgeBaseCoursePlan({ topic: input.topic, level: input.level });
    const fallbackPersonalization = {
      goals: input.goals || [],
      studyTimeMinutesPerDay: input.studyTimeMinutesPerDay || 60,
      knownSkills: input.knownSkills || [],
      skippedSkills: [],
      rationale: ["AI generation was unavailable, so BuddyForStudy used its validated prerequisite knowledge base."]
    };
    const fallbackCourse = await Course.create({
      ...fallback.course,
      slug: generatedAiSlug(fallback.course.title),
      generation: {
        mode: "ai",
        query: input.topic,
        topicKeys: buildTopicKeys(input.topic, fallback.canonicalTopic, fallback.course.title),
        snapshot: {
          intent: "ai_personalized_path_fallback",
          canonicalTopic: fallback.canonicalTopic,
          careerOutcome: fallback.careerOutcome,
          skillGraph: fallback.skillGraph || [],
          personalization: fallbackPersonalization,
          sources: fallback.sources || [],
          normalSearchSnapshot: buildNormalSearchSnapshot(fallback.course, input.topic)
        }
      },
      isPublished: true,
      pricing: { mode: "free", price: 0, currency: "INR" },
      enrollmentEnabled: true,
      certificateEnabled: true
    });

    return {
      ...fallback,
      course: toPublicCourse(fallbackCourse),
      intent: "ai_personalized_path_fallback",
      personalization: fallbackPersonalization,
      cached: false
    };
  }
}
