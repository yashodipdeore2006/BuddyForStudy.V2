import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { generateCoursePlan as generateKnowledgeBaseCoursePlan } from "./roadmapGenerator.service.js";
import { attachYouTubeResources } from "./youtube.service.js";
import { Course } from "../models/Course.js";
import { buildTopicKeys, findRecentGeneratedCourse } from "./generatedCourseCache.service.js";
import { randomUUID } from "node:crypto";
import { normalizeMultiVideoLessons } from "./course.service.js";

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
          projectPlacement: { type: "string", enum: ["none", "skill", "milestone"] },
          quizPolicy: {
            type: "object",
            properties: {
              lessonQuestionCount: { type: "integer", minimum: 3, maximum: 10 },
              moduleQuestionCount: { type: "integer", minimum: 0, maximum: 15 },
              passingScore: { type: "integer", minimum: 50, maximum: 90 }
            },
            required: ["lessonQuestionCount", "moduleQuestionCount", "passingScore"]
          },
          durationMinutes: { type: "integer" }
        },
        required: ["id", "name", "category", "importance", "prerequisites", "topics", "searchQueries", "courseDuration", "practiceProject", "projectPlacement", "quizPolicy"]
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

function normalizeQuizPolicy(value, topicCount = 1) {
  const defaultLesson = topicCount >= 8 ? 7 : topicCount >= 5 ? 5 : 3;
  const lessonQuestionCount = Math.max(
    3,
    Math.min(10, Number(value?.lessonQuestionCount) || defaultLesson)
  );
  const moduleRaw =
    value?.moduleQuestionCount === undefined
      ? (topicCount >= 5 ? 8 : 5)
      : Number(value.moduleQuestionCount);
  const moduleQuestionCount = Math.max(0, Math.min(15, Number.isFinite(moduleRaw) ? moduleRaw : 5));
  const passingScore = Math.max(
    50,
    Math.min(90, Number(value?.passingScore) || 70)
  );
  return { lessonQuestionCount, moduleQuestionCount, passingScore };
}

function splitTopics(topics, maxItems = 5) {
  const clean = [...new Set((topics || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!clean.length) return [["Core concepts"]];
  const chunks = [];
  for (let index = 0; index < clean.length; index += maxItems) {
    chunks.push(clean.slice(index, index + maxItems));
  }
  return chunks;
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
    searchQueries: (skill.searchQueries?.length
      ? skill.searchQueries
      : [`${skill.name} complete course tutorial`]).slice(0, 2),
    projectPlacement: skill.projectPlacement || "skill",
    quizPolicy: normalizeQuizPolicy(skill.quizPolicy, skill.topics?.length || 1)
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

  const modules = [];
  let globalOrder = 1;

  for (let skillIndex = 0; skillIndex < activeSkills.length; skillIndex += 1) {
    const skill = activeSkills[skillIndex];
    const topicChunks = splitTopics(skill.topics, skill.topics.length > 8 ? 4 : 5);
    const moduleLessons = [];
    let lessonOrder = 1;

    topicChunks.forEach((topicChunk, chunkIndex) => {
      const query = `${skill.name}: ${topicChunk.join(", ")} complete tutorial`;

      moduleLessons.push({
        id: `${skill.id}-tutorial-${chunkIndex + 1}`,
        title: topicChunks.length > 1
          ? `${skill.name} — Part ${chunkIndex + 1}: ${topicChunk.slice(0, 2).join(" & ")}`
          : `Learn ${skill.name}`,
        description: `Cover ${topicChunk.join(", ")} in a prerequisite-aware ${level} lesson.`,
        type: "tutorial",
        order: lessonOrder++,
        tutorial: {
          content: `Core topics: ${topicChunk.join(", ")}.`,
          searchQuery: query,
          searchQueries: [query, ...skill.searchQueries.filter((item) => item !== query)].slice(0, 2),
          requiredTopics: topicChunk,
          durationMinutes: {
            minMinutes: Math.max(30, Math.round(skill.courseDuration.minMinutes / topicChunks.length)),
            targetMinutes: Math.max(45, Math.round(skill.courseDuration.targetMinutes / topicChunks.length)),
            maxMinutes: Math.max(
              60,
              Math.round(skill.courseDuration.maxMinutes / topicChunks.length)
            )
          },
          searchPolicy: {
            contentType: "complete-course",
            minDurationMinutes: Math.max(30, Math.round(skill.courseDuration.minMinutes / topicChunks.length)),
            targetDurationMinutes: Math.max(45, Math.round(skill.courseDuration.targetMinutes / topicChunks.length)),
            maxDurationMinutes: Math.max(60, Math.round(skill.courseDuration.maxMinutes / topicChunks.length)),
            excludeShorts: true,
            requireEmbeddable: true,
            preferProjectBased: true,
            preferredLanguage: "en"
          }
        }
      });

      moduleLessons.push({
        id: `${skill.id}-quiz-${chunkIndex + 1}`,
        title: topicChunks.length > 1
          ? `${skill.name} — Part ${chunkIndex + 1} Quiz`
          : `${skill.name} Lesson Quiz`,
        description: `Check your understanding of ${topicChunk.join(", ")} before continuing.`,
        type: "quiz",
        order: lessonOrder++,
        quiz: {
          scope: "lesson",
          questionCount: skill.quizPolicy.lessonQuestionCount,
          passingScore: skill.quizPolicy.passingScore,
          focusTopics: topicChunk,
          instructions: "Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."
        }
      });
    });

    const shouldAddProject =
      skill.projectPlacement === "skill" ||
      (skill.projectPlacement === "milestone" && (skillIndex + 1) % 2 === 0);

    if (shouldAddProject && skill.practiceProject) {
      moduleLessons.push({
        id: `${skill.id}-project`,
        title: skill.practiceProject,
        description: "Apply the skills from this stage before moving deeper into the stack.",
        type: "project",
        order: lessonOrder++,
        project: {
          description: skill.practiceProject,
          objectives: skill.topics.slice(0, 6).map((topic) => `Use ${topic}`),
          requirements: skill.topics.slice(0, 6),
          instructions: `Build the project using the skills introduced in ${skill.name}. Test the main flows, explain your decisions, and document the result.`,
          expectedOutcome: `A working project demonstrating practical ${skill.name} skills.`,
          submissionRequirements: ["Source code repository", "README with setup instructions", "Short project demonstration"]
        }
      });
    }

    if (skill.quizPolicy.moduleQuestionCount > 0) {
      moduleLessons.push({
        id: `${skill.id}-module-quiz`,
        title: `${skill.name} Module Assessment`,
        description: `A module-level assessment covering the key topics from ${skill.name}.`,
        type: "quiz",
        order: lessonOrder++,
        quiz: {
          scope: "module",
          questionCount: skill.quizPolicy.moduleQuestionCount,
          passingScore: skill.quizPolicy.passingScore,
          focusTopics: skill.topics,
          instructions: "Use the assessment to validate the whole module before moving to the next technology."
        }
      });
    }

    modules.push({
      title: skill.name,
      description: `AI-selected ${skill.name} stage for a ${level} learner, ordered after its prerequisites.`,
      skillIds: [skill.id],
      order: globalOrder++,
      lessons: moduleLessons
    });
  }

  const totalMinutes = activeSkills.reduce(
    (sum, skill) => sum + skill.courseDuration.targetMinutes,
    0
  );
  const days = Math.max(
    1,
    Math.ceil(totalMinutes / Math.max(30, studyTimeMinutesPerDay || 60))
  );

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
      practiceProject: skill.practiceProject,
      projectPlacement: skill.projectPlacement,
      quizPolicy: skill.quizPolicy
    })),
    personalization: {
      goals,
      studyTimeMinutesPerDay: studyTimeMinutesPerDay || 60,
      knownSkills: knownSkills || [],
      skippedSkills,
      rationale: [
        `Ordered technologies by prerequisites for a ${level} learner.`,
        `Created lesson quizzes from each lesson's topic depth and module assessments for broader technology coverage.`,
        goals.length ? `Prioritized the roadmap around: ${goals.join(", ")}.` : "Used a balanced learning progression.",
        `Estimated the plan around ${studyTimeMinutesPerDay || 60} minutes per day.`
      ]
    }
  };
}

const quizResponseSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          topic: { type: "string" },
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" }
              },
              required: ["id", "text"]
            },
            minItems: 4,
            maxItems: 4
          },
          correctOptionId: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["id", "topic", "question", "options", "correctOptionId", "explanation"]
      }
    }
  },
  required: ["questions"]
};


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
    "Create 5-12 technologies/stages for broad stacks/careers and 3-8 for focused topics.",
    "Treat the topic as a complete stack/career when appropriate: identify the major technologies, modules, prerequisites, and project milestones needed to finish the stack.",
    "For every technology/stage, decide whether a practical project should follow it: use projectPlacement=skill for a meaningful project, milestone for a larger project after two stages, or none when a project would add little value.",
    "For EVERY skill, decide a realistic complete-course duration range based on the depth required to become competent in that skill.",
    "Return minMinutes, targetMinutes, and maxMinutes for each skill.",
    "Do not use one generic duration for every skill. A deeper technology such as JavaScript may require a much longer course than a smaller focused skill.",
    "For EVERY skill, decide quiz density with quizPolicy: lessonQuestionCount (3-10) based on topic count and lesson depth, moduleQuestionCount (0-15) based on overall module breadth, and passingScore (50-90).",
    "Lesson quizzes should validate the immediate topic after the lesson. Module assessments should cover the combined technology/module topics.",
    "The duration and topic count should drive quiz counts; do not use the same quiz count for every technology.",
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

function getQuizContext(module, lesson) {
  const sourceLessons =
    lesson.quiz?.scope === "module"
      ? (module.lessons || []).filter((item) => item.type !== "quiz")
      : (module.lessons || []).filter(
          (item) => item.type === "tutorial" && Number(item.order || 0) < Number(lesson.order || 0)
        ).slice(-1);

  return sourceLessons.map((item) => ({
    title: item.title,
    type: item.type,
    description: item.description || "",
    topics: item.tutorial?.requiredTopics || [],
    content: item.tutorial?.content || "",
    project: item.project || null
  }));
}

function validateQuizQuestions(questions, expectedCount) {
  const valid = Array.isArray(questions)
    ? questions.filter((item) =>
        item &&
        String(item.id || "").trim() &&
        String(item.question || "").trim() &&
        Array.isArray(item.options) &&
        item.options.length === 4 &&
        item.options.every((option) => option?.id && option?.text) &&
        item.options.some((option) => option.id === item.correctOptionId)
      )
    : [];

  if (valid.length < expectedCount) {
    const error = new Error("Gemini returned fewer valid quiz questions than requested");
    error.status = 502;
    throw error;
  }

  return valid.slice(0, expectedCount);
}

export async function generateCourseQuiz({ courseId, lessonId }) {
  if (!client) {
    const error = new Error("Gemini AI is not configured. Add GEMINI_API_KEY to generate quizzes.");
    error.status = 503;
    throw error;
  }

  const course = await Course.findOne({ _id: courseId, isPublished: true });
  if (!course) {
    const error = new Error("Course not found");
    error.status = 404;
    throw error;
  }

  let located = null;
  for (const module of course.modules || []) {
    const lessonIndex = (module.lessons || []).findIndex(
      (lesson) => String(lesson._id) === String(lessonId)
    );
    if (lessonIndex >= 0) {
      located = { module, lesson: module.lessons[lessonIndex], lessonIndex };
      break;
    }
  }

  if (!located?.lesson || located.lesson.type !== "quiz" || !located.lesson.quiz) {
    const error = new Error("Quiz lesson not found");
    error.status = 404;
    throw error;
  }

  const requestedCount = Math.max(3, Math.min(15, Number(located.lesson.quiz.questionCount) || 5));
  const existingQuestions = located.lesson.quiz.questions || [];
  if (existingQuestions.length >= requestedCount) {
    return {
      courseId: String(course._id),
      lessonId: String(located.lesson._id),
      quiz: located.lesson.quiz.toObject ? located.lesson.quiz.toObject() : located.lesson.quiz
    };
  }

  const context = getQuizContext(located.module, located.lesson);
  const prompt = [
    "You are BuddyForStudy's assessment designer.",
    "Generate a high-quality multiple-choice assessment from the supplied learning context.",
    `Create exactly ${requestedCount} questions.`,
    "Each question must test a distinct concept from the supplied topics.",
    "Use four plausible options and exactly one correct option.",
    "Do not ask about information that is not supported by the supplied learning context or established programming knowledge.",
    "Avoid trick wording. Prefer applied understanding, debugging, architecture, syntax, trade-offs, or concept selection where appropriate.",
    "Return concise explanations for the correct answer.",
    "",
    `Course: ${course.title}`,
    `Level: ${course.level}`,
    `Quiz scope: ${located.lesson.quiz.scope}`,
    `Focus topics: ${JSON.stringify(located.lesson.quiz.focusTopics || [])}`,
    `Learning context: ${JSON.stringify(context)}`
  ].join("\n");

  const response = await client.models.generateContent({
    model: env.geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: quizResponseSchema,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
      maxOutputTokens: Math.max(5000, requestedCount * 550)
    }
  });

  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const error = new Error("Gemini quiz provider returned invalid structured data");
    error.status = 502;
    throw error;
  }

  const questions = validateQuizQuestions(parsed?.questions, requestedCount).map((question, index) => ({
    id: normalizeId(question.id || `q-${index + 1}`) || `q-${index + 1}`,
    topic: String(question.topic || located.lesson.quiz.focusTopics?.[index % Math.max(1, located.lesson.quiz.focusTopics?.length || 1)] || "").trim(),
    question: String(question.question).trim(),
    options: question.options.slice(0, 4).map((option, optionIndex) => ({
      id: normalizeId(option.id || `option-${optionIndex + 1}`) || `option-${optionIndex + 1}`,
      text: String(option.text).trim()
    })),
    correctOptionId: normalizeId(question.correctOptionId),
    explanation: String(question.explanation || "").trim()
  }));

  located.lesson.quiz.questions = questions;
  located.lesson.quiz.generatedAt = new Date();
  await course.save();

  return {
    courseId: String(course._id),
    lessonId: String(located.lesson._id),
    quiz: located.lesson.quiz.toObject ? located.lesson.quiz.toObject() : located.lesson.quiz
  };
}


export async function generateAIRoadmap(input) {
  const topicKeys = buildTopicKeys(input.topic);
  const existing = await findRecentGeneratedCourse({ mode: "ai", topicKeys });
  if (existing) return cachedRoadmapFromCourse(existing, input);

  try {
    const ai = await generateWithGemini(input);
    const built = buildCourse(ai, input);
    const sources = await attachYouTubeResources(built.course);
    normalizeMultiVideoLessons(built.course);
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
