import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { generateCoursePlan as generateKnowledgeBaseCoursePlan } from "./roadmapGenerator.service.js";
import { attachYouTubeResources } from "./youtube.service.js";
import { Course } from "../models/Course.js";
import { buildTopicKeys, findRecentGeneratedCourse } from "./generatedCourseCache.service.js";
import { randomUUID } from "node:crypto";
import { normalizeMultiVideoLessons } from "./course.service.js";
import { consumeUsage, releaseUsage } from "./aiUsage.service.js";
import { readPlanLimit, getActivePlanForUser } from "./subscriptionEntitlement.service.js";

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
          projectPlan: {
            type: "object",
            properties: {
              scenario: { type: "string" },
              whyThisProject: { type: "string" },
              features: { type: "array", items: { type: "string" } },
              architecture: { type: "array", items: { type: "string" } },
              milestones: { type: "array", items: { type: "string" } },
              testingChecklist: { type: "array", items: { type: "string" } },
              industrySkills: { type: "array", items: { type: "string" } },
              githubWorkflow: { type: "array", items: { type: "string" } },
              videoSearchQueries: { type: "array", items: { type: "string" } }
            },
            required: [
              "scenario",
              "whyThisProject",
              "features",
              "architecture",
              "milestones",
              "testingChecklist",
              "industrySkills",
              "githubWorkflow",
              "videoSearchQueries"
            ]
          },
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
        required: [
          "id",
          "name",
          "category",
          "importance",
          "prerequisites",
          "topics",
          "searchQueries",
          "courseDuration",
          "practiceProject",
          "projectPlacement",
          "projectPlan",
          "quizPolicy"
        ]
      }
    },
    capstoneProjects: {
      type: "array",
      minItems: 0,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          scenario: { type: "string" },
          whyThisProject: { type: "string" },
          features: { type: "array", items: { type: "string" } },
          architecture: { type: "array", items: { type: "string" } },
          milestones: { type: "array", items: { type: "string" } },
          testingChecklist: { type: "array", items: { type: "string" } },
          industrySkills: { type: "array", items: { type: "string" } },
          githubWorkflow: { type: "array", items: { type: "string" } },
          videoSearchQueries: { type: "array", items: { type: "string" } }
        },
        required: [
          "title",
          "scenario",
          "whyThisProject",
          "features",
          "architecture",
          "milestones",
          "testingChecklist",
          "industrySkills",
          "githubWorkflow",
          "videoSearchQueries"
        ]
      }
    }
  },
  required: [
    "canonicalTopic",
    "title",
    "description",
    "careerOutcome",
    "category",
    "learningOutcomes",
    "skills",
    "capstoneProjects"
  ]
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

function projectPlanToContent(plan, skill, fallbackProject) {
  const value = plan || {};
  return {
    description: value.whyThisProject || fallbackProject || `Build a practical project using ${skill}.`,
    realWorldScenario: value.scenario || `Solve a realistic problem with ${skill}.`,
    objectives: (value.features || []).slice(0, 8).length
      ? (value.features || []).slice(0, 8).map((feature) => `Implement: ${feature}`)
      : [`Apply the core ${skill} concepts in a working application.`],
    requirements: (value.industrySkills || []).length
      ? value.industrySkills.slice(0, 8)
      : [skill],
    instructions: [
      value.scenario ? `Scenario: ${value.scenario}` : "",
      value.whyThisProject ? `Why this project: ${value.whyThisProject}` : "",
      value.architecture?.length ? `Architecture: ${value.architecture.join(" | ")}` : "",
      value.milestones?.length ? `Milestones: ${value.milestones.map((item, index) => `${index + 1}. ${item}`).join(" | ")}` : "",
      "Implement the project incrementally. Use clean code, meaningful Git commits, validation, error handling, and documentation.",
      value.testingChecklist?.length ? `Testing checklist: ${value.testingChecklist.join(" | ")}` : "",
      value.githubWorkflow?.length ? `GitHub workflow: ${value.githubWorkflow.join(" | ")}` : ""
    ].filter(Boolean).join("\n\n"),
    expectedOutcome:
      value.scenario
        ? `A working project that solves the scenario: ${value.scenario}`
        : `A working project demonstrating practical ${skill} skills.`,
    features: (value.features || []).slice(0, 12),
    architecture: (value.architecture || []).slice(0, 10),
    milestones: (value.milestones || []).slice(0, 12),
    testingChecklist: (value.testingChecklist || []).slice(0, 12),
    industrySkills: (value.industrySkills || []).slice(0, 12),
    githubWorkflow: (value.githubWorkflow || []).slice(0, 10),
    videoSearchQueries: (value.videoSearchQueries || []).slice(0, 3),
    resources: [],
    videos: [],
    submissionRequirements: [
      "Source code repository on GitHub",
      "README with setup, architecture, and usage",
      "Test evidence or test suite",
      "Deployed application or recorded demo where applicable",
      "Short explanation of technical decisions"
    ]
  };
}

function isWebOrFullStackTopic(topic, ai) {
  const text = `${topic || ""} ${ai?.title || ""} ${ai?.category || ""}`.toLowerCase();
  return /(mern|mean|full.?stack|web development|frontend|backend|react|node\.js|express|next\.js|java full stack|\.net|web app)/i.test(text);
}

function ensureWebIndustryStage(skills, topic, ai) {
  if (!isWebOrFullStackTopic(topic, ai)) return skills;

  const normalized = skills.map((skill) => ({
    ...skill,
    id: normalizeId(skill.id || skill.name),
    prerequisites: (skill.prerequisites || []).map(normalizeId)
  }));

  const ensureStage = (name, id, topics, queries, afterNames = []) => {
    if (normalized.some((skill) => normalizeId(skill.id || skill.name) === id || String(skill.name).toLowerCase() === name.toLowerCase())) return;
    const preceding = normalized.filter((skill) =>
      afterNames.some((after) => String(skill.name).toLowerCase().includes(after))
    );
    const prerequisites = preceding.length ? [normalizeId(preceding[preceding.length - 1].id || preceding[preceding.length - 1].name)] : [];
    normalized.push({
      id,
      name,
      category: "Engineering Workflow",
      importance: "High",
      prerequisites,
      topics,
      searchQueries: queries,
      courseDuration: {
        minMinutes: 120,
        targetMinutes: 180,
        maxMinutes: 300
      },
      practiceProject: `Apply ${name} in a small professional workflow.`,
      projectPlacement: "none",
      projectPlan: {
        scenario: `Use ${name} to work on the codebase professionally.`,
        whyThisProject: `Build the habits needed to collaborate, ship, and maintain software reliably.`,
        features: [],
        architecture: [],
        milestones: [],
        testingChecklist: ["Verify the workflow on a real repository."],
        industrySkills: ["Version control", "Documentation", "Professional collaboration"],
        githubWorkflow: [
          "Create a Git repository",
          "Use meaningful commits",
          "Create feature branches",
          "Open and review pull requests",
          "Write a useful README"
        ],
        videoSearchQueries: queries
      },
      quizPolicy: { lessonQuestionCount: 4, moduleQuestionCount: 5, passingScore: 70 }
    });
  };

  const jsIndex = normalized.findIndex((skill) => /javascript|typescript/i.test(skill.name || ""));
  if (jsIndex >= 0) {
    const hasGitHub = normalized.some((skill) => /git.?hub|version control/i.test(skill.name || ""));
    if (!hasGitHub) {
      normalized.splice(jsIndex + 1, 0, {
        id: "git-github-workflow",
        name: "Git & GitHub Workflow",
        category: "Engineering Workflow",
        importance: "Critical",
        prerequisites: [normalizeId(normalized[jsIndex].id || normalized[jsIndex].name)],
        topics: [
          "Git fundamentals",
          "branching",
          "commits",
          "merge and rebase basics",
          "pull requests",
          "GitHub repositories",
          "issues",
          "README and collaboration"
        ],
        searchQueries: [
          "Git and GitHub for beginners complete tutorial",
          "GitHub workflow pull requests branches tutorial"
        ],
        courseDuration: { minMinutes: 180, targetMinutes: 300, maxMinutes: 480 },
        practiceProject: "",
        projectPlacement: "none",
        projectPlan: {
          scenario: "Manage a real web-project repository with professional Git and GitHub practices.",
          whyThisProject: "Every industry-ready developer must be able to collaborate, review changes, and ship code safely.",
          features: [],
          architecture: [],
          milestones: [],
          testingChecklist: ["Create a branch", "Commit changes", "Open a pull request", "Review and merge"],
          industrySkills: ["Git", "GitHub", "Code review", "Collaboration", "Documentation"],
          githubWorkflow: [
            "Initialize and structure the repository",
            "Create feature branches",
            "Use atomic commits",
            "Open pull requests",
            "Review and merge changes",
            "Track work with issues",
            "Maintain a professional README"
          ],
          videoSearchQueries: [
            "Git and GitHub for beginners complete tutorial",
            "GitHub workflow pull requests branches tutorial"
          ]
        },
        quizPolicy: { lessonQuestionCount: 5, moduleQuestionCount: 8, passingScore: 70 }
      });
    }
  }

  ensureStage(
    "Testing, Debugging & Quality",
    "testing-debugging-quality",
    ["unit testing", "integration testing", "debugging", "linting", "validation", "error handling"],
    ["web application testing debugging complete tutorial", "JavaScript Node React testing debugging tutorial"],
    ["react", "node", "express", "backend", "full"]
  );
  ensureStage(
    "Deployment, Security & Production",
    "deployment-security-production",
    ["deployment", "environment variables", "security basics", "HTTPS", "production configuration", "monitoring"],
    ["web app deployment security production complete tutorial", "MERN production deployment security tutorial"],
    ["testing", "backend", "express", "node"]
  );

  return normalized;
}

function defaultWebCapstoneProjects(topic, ai) {
  const text = `${topic || ""} ${ai?.title || ""}`.toLowerCase();
  if (!isWebOrFullStackTopic(topic, ai)) return [];

  const mern = text.includes("mern");
  const stackName = mern ? "MERN" : (ai?.canonicalTopic || topic || "full-stack");
  return [
    {
      title: `${stackName} Production E-Commerce Platform`,
      scenario: "Build a realistic commerce platform where users can browse products, authenticate, manage carts, place orders, and administrators can manage inventory.",
      whyThisProject: "It combines frontend, backend, database, authentication, APIs, validation, testing, deployment, and professional GitHub workflow into one portfolio-grade application.",
      features: [
        "User registration, login, logout, and protected routes",
        "Product catalog with search, filters, pagination, and details",
        "Cart and checkout/order workflow",
        "Admin dashboard for products and orders",
        "Input validation, authorization, and secure error handling",
        "Responsive frontend with loading, empty, and error states",
        "API documentation and environment-based configuration"
      ],
      architecture: [
        `${stackName} frontend application`,
        "REST API with controllers, services, validation, and middleware",
        "MongoDB persistence with normalized domain models",
        "Authentication and authorization layer",
        "Testing and deployment pipeline"
      ],
      milestones: [
        "Plan requirements and create the GitHub repository",
        "Build the frontend shell and reusable UI components",
        "Design the API and database models",
        "Implement authentication and authorization",
        "Build catalog and cart flows",
        "Implement orders and admin workflows",
        "Add tests, validation, security hardening, and error handling",
        "Deploy and document the finished application"
      ],
      testingChecklist: [
        "Authentication and authorization tests",
        "API validation and error-path tests",
        "Critical user-flow tests",
        "Responsive and accessibility checks",
        "Production environment configuration check"
      ],
      industrySkills: [
        "REST API design",
        "Authentication and authorization",
        "Database modeling",
        "Testing",
        "Git and GitHub collaboration",
        "Deployment",
        "Debugging",
        "Technical documentation"
      ],
      githubWorkflow: [
        "Create a professional repository and README",
        "Use feature branches and atomic commits",
        "Open pull requests for meaningful changes",
        "Review and merge changes",
        "Track tasks with issues",
        "Tag a release after deployment"
      ],
      videoSearchQueries: [
        `${stackName} full stack e-commerce project tutorial complete`,
        `${stackName} full stack project from scratch deployment`
      ]
    },
    {
      title: `${stackName} SaaS Project Management Application`,
      scenario: "Build a team project-management SaaS where users can create workspaces, manage projects and tasks, collaborate, and track progress.",
      whyThisProject: "It forces the learner to integrate the stack around realistic product requirements instead of following isolated tutorials.",
      features: [
        "User and workspace management",
        "Projects, tasks, statuses, priorities, and due dates",
        "Role-based access control",
        "Search, filtering, sorting, and pagination",
        "Activity history and notifications",
        "Dashboard analytics",
        "Responsive UI and robust loading/error handling"
      ],
      architecture: [
        `${stackName} frontend`,
        "REST API and service layer",
        "MongoDB data model with relationships",
        "Authentication, authorization, and validation",
        "Testing, deployment, and monitoring"
      ],
      milestones: [
        "Define product requirements and architecture",
        "Create the repository and branching strategy",
        "Build authentication and workspace management",
        "Build project and task workflows",
        "Add role-based access and collaboration features",
        "Test critical paths and harden security",
        "Deploy, monitor, and document the application"
      ],
      testingChecklist: [
        "Protected-route and role tests",
        "CRUD and validation tests",
        "Critical end-to-end workflow checks",
        "Performance and error handling checks",
        "Production smoke test"
      ],
      industrySkills: [
        "Full-stack integration",
        "API design",
        "Database modeling",
        "RBAC",
        "Testing",
        "Deployment",
        "GitHub collaboration",
        "Product thinking"
      ],
      githubWorkflow: [
        "Maintain issues for product work",
        "Use feature branches",
        "Write atomic commits",
        "Open pull requests and review changes",
        "Maintain release notes and a professional README"
      ],
      videoSearchQueries: [
        `${stackName} full stack project management app tutorial complete`,
        `${stackName} full stack SaaS project tutorial from scratch`
      ]
    }
  ];
}

function buildCourse(ai, { topic, level, studyTimeMinutesPerDay, goals, knownSkills }) {
  const enrichedSkills = ensureWebIndustryStage(ai.skills || [], topic, ai);
  const orderedSkills = topoSort(enrichedSkills.map((skill) => ({
    ...skill,
    id: normalizeId(skill.id || skill.name),
    prerequisites: (skill.prerequisites || []).map(normalizeId),
    courseDuration: normalizeCourseDuration(skill.courseDuration),
    topics: skill.topics?.slice(0, 16) || [],
    searchQueries: (skill.searchQueries?.length
      ? skill.searchQueries
      : [`${skill.name} complete course tutorial`]).slice(0, 3),
    projectPlacement: skill.projectPlacement || "skill",
    projectPlan: skill.projectPlan || {},
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
    const topicChunks = splitTopics(skill.topics, skill.topics.length > 10 ? 4 : 5);
    const moduleLessons = [];
    let lessonOrder = 1;

    topicChunks.forEach((topicChunk, chunkIndex) => {
      const query = `${skill.name}: ${topicChunk.join(", ")} complete tutorial`;

      moduleLessons.push({
        id: `${skill.id}-tutorial-${chunkIndex + 1}`,
        title: topicChunks.length > 1
          ? `${skill.name} — Part ${chunkIndex + 1}: ${topicChunk.slice(0, 2).join(" & ")}`
          : `Learn ${skill.name}`,
        description: `Cover ${topicChunk.join(", ")} in a ${level}-level lesson with practical context.`,
        type: "tutorial",
        order: lessonOrder++,
        tutorial: {
          content: `Core topics: ${topicChunk.join(", ")}.`,
          searchQuery: query,
          searchQueries: [query, ...skill.searchQueries.filter((item) => item !== query)].slice(0, 3),
          requiredTopics: topicChunk,
          durationMinutes: {
            minMinutes: Math.max(30, Math.round(skill.courseDuration.minMinutes / topicChunks.length)),
            targetMinutes: Math.max(45, Math.round(skill.courseDuration.targetMinutes / topicChunks.length)),
            maxMinutes: Math.max(60, Math.round(skill.courseDuration.maxMinutes / topicChunks.length))
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
        description: skill.projectPlan?.scenario || "Apply the skills from this stage in a realistic project.",
        type: "project",
        order: lessonOrder++,
        project: projectPlanToContent(skill.projectPlan, skill.name, skill.practiceProject)
      });
    }

    if (skill.quizPolicy.moduleQuestionCount > 0) {
      moduleLessons.push({
        id: `${skill.id}-module-quiz`,
        title: `${skill.name} Module Assessment`,
        description: `An assessment covering the major topics of ${skill.name}.`,
        type: "quiz",
        order: lessonOrder++,
        quiz: {
          scope: "module",
          questionCount: skill.quizPolicy.moduleQuestionCount,
          passingScore: skill.quizPolicy.passingScore,
          focusTopics: skill.topics,
          instructions: "Validate the whole module before continuing to the next technology."
        }
      });
    }

    modules.push({
      title: skill.name,
      description: `AI-selected ${skill.name} stage for a ${level} learner, ordered after prerequisites.`,
      skillIds: [skill.id],
      order: globalOrder++,
      lessons: moduleLessons
    });
  }

  let capstones = (ai.capstoneProjects || []).slice(0, 2);
  if (isWebOrFullStackTopic(topic, ai) && capstones.length === 0) {
    capstones = defaultWebCapstoneProjects(topic, ai).slice(0, 2);
  }
  if (capstones.length) {
    const capstoneLessons = [];

    capstones.forEach((project, index) => {
      capstoneLessons.push({
        id: `capstone-project-${index + 1}`,
        title: project.title,
        description: project.scenario,
        type: "project",
        order: capstoneLessons.length + 1,
        project: projectPlanToContent(project, ai.title, project.title)
      });
    });

    modules.push({
      title: "Final Capstone Projects",
      description: "Build portfolio-grade projects that combine the technologies learned across the roadmap.",
      skillIds: activeSkills.map((skill) => skill.id),
      order: globalOrder++,
      lessons: capstoneLessons
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
      learningOutcomes: [
        ...(ai.learningOutcomes || []),
        "Build practical projects that prove your ability to apply the stack.",
        "Use Git and GitHub with professional collaboration and documentation practices.",
        "Test, debug, secure, and deploy applications instead of stopping at tutorial completion."
      ],
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
        "Inserted professional workflow stages where appropriate for software/web stacks.",
        "Added practical project briefs with architecture, milestones, testing, GitHub workflow, and industry skills.",
        "Added adaptive lesson and module assessments based on topic depth.",
        capstones.length
          ? `Added ${capstones.length} final portfolio capstone project(s) at the end of the curriculum.`
          : "Used the AI-selected practical project progression for this learning path.",
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
    "For software/web/full-stack learning paths, explicitly include a Git & GitHub workflow stage after the core programming/foundation stage and before heavy framework work. Teach repositories, branches, commits, pull requests, issues, README/documentation, code review, and collaborative workflow.",
    "For web/full-stack paths, include production readiness: HTTP and APIs, validation, authentication/authorization, security basics, testing/debugging, environment configuration, deployment, monitoring, and performance where relevant.",
    "Also teach software engineering fundamentals that transfer across stacks: clean code, debugging strategy, API contracts/documentation, data modeling, security, testing strategy, deployment, observability, performance trade-offs, and basic system design when relevant.",
    "Do not assume a learner becomes job-ready by watching videos alone. Sequence learning so each major stage has hands-on application, feedback/assessment, and professional engineering practice.",
    "Project plans must be detailed enough for a complete beginner to understand the problem, why it matters, what to build, architecture, feature milestones, testing, GitHub workflow, industry skills, and a sensible definition of done.",
    "At the END of a web/full-stack curriculum, provide 1-2 portfolio-grade capstone projects that combine the major technologies. For MERN, these must be full-stack MERN applications. Generate one strong YouTube search query per capstone for a long-form project build tutorial.",
    "Never invent GitHub repository URLs or YouTube URLs. Return search queries only; the resource search layer will select real embeddable resources.",
    "Adapt the sequence to the learner's topic rather than forcing MERN-specific technologies onto unrelated careers.",

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

  try {
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

export async function generateCourseQuiz({ courseId, lessonId, userId = null }) {
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

  let usageReserved = false;
  if (userId) {
    const plan = await getActivePlanForUser(userId);
    const limit = readPlanLimit(plan, "ai_quiz_generations_per_month", -1);
    const usage = await consumeUsage({
      userId,
      feature: "ai_quiz_generations",
      period: "month",
      limit,
      amount: 1
    });
    if (!usage.allowed) {
      const error = new Error("You have reached your AI quiz-generation limit for this month.");
      error.status = 429;
      error.code = "AI_USAGE_LIMIT";
      throw error;
    }
    usageReserved = true;
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
  } catch (error) {
    if (usageReserved && userId) {
      await releaseUsage({ userId, feature: "ai_quiz_generations", period: "month", amount: 1 }).catch(() => {});
    }
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(error?.message || ""))) {
      const e = new Error("Quiz generation is temporarily unavailable because the Gemini API quota has been reached.");
      e.status = 429;
      throw e;
    }
    throw error;
  }
}


export async function generateAIRoadmap(input, options = {}) {
  const userId = options.userId || null;
  const personalized = options.personalized !== false;
  const projectsEnabled = options.projectsEnabled !== false;
  const plan = options.plan || null;
  const topicKeys = buildTopicKeys(
    input.topic,
    "industry-ready-v2",
    personalized ? JSON.stringify(input.goals || []) : "",
    personalized ? JSON.stringify(input.knownSkills || []) : "",
    personalized ? String(input.studyTimeMinutesPerDay || 60) : ""
  );
  const existing = await findRecentGeneratedCourse({ mode: "ai", topicKeys });
  if (existing) {
    const cached = cachedRoadmapFromCourse(existing, input);
    if (!projectsEnabled) {
      cached.course.modules = (cached.course.modules || []).map((module) => ({
        ...module,
        lessons: (module.lessons || []).filter((lesson) => lesson.type !== "project")
      }));
    }
    return cached;
  }

  let reservation = false;
  if (userId) {
    const limit = readPlanLimit(options.plan, "ai_course_builds_per_month", -1);
    const result = await consumeUsage({
      userId,
      feature: "ai_course_builds",
      period: "month",
      limit,
      amount: 1
    });
    if (!result.allowed) {
      const error = new Error("You have reached your AI course-builder limit for this month.");
      error.status = 429;
      error.code = "AI_USAGE_LIMIT";
      throw error;
    }
    reservation = true;
  }

  const generationInput = personalized
    ? input
    : { ...input, goals: [], knownSkills: [], studyTimeMinutesPerDay: 60 };

  try {
    const ai = await generateWithGemini(generationInput);
    const built = buildCourse(ai, generationInput);
    if (!projectsEnabled) {
      built.course.modules = (built.course.modules || []).map((module) => ({
        ...module,
        lessons: (module.lessons || []).filter((lesson) => lesson.type !== "project")
      }));
    }
    const sources = await attachYouTubeResources(built.course);
    normalizeMultiVideoLessons(built.course);
    const normalSearchSnapshot = buildNormalSearchSnapshot(built.course, input.topic);

    const course = await Course.create({
      ...built.course,
      slug: generatedAiSlug(built.course.title),
      generation: {
        mode: "ai",
        query: input.topic,
        topicKeys: buildTopicKeys(input.topic, "industry-ready-v2", ai.canonicalTopic, ai.title, ai.category),
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
    if (reservation && userId) {
      await releaseUsage({ userId, feature: "ai_course_builds", period: "month", amount: 1 }).catch(() => {});
    }
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
        topicKeys: buildTopicKeys(input.topic, "industry-ready-v2", fallback.canonicalTopic, fallback.course.title),
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
