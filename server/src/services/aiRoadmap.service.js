import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { generateCoursePlan as generateKnowledgeBaseCoursePlan } from "./roadmapGenerator.service.js";
import { attachYouTubeResources } from "./youtube.service.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { buildTopicKeys, findRecentGeneratedCourse } from "./generatedCourseCache.service.js";
import { randomUUID } from "node:crypto";
import { normalizeMultiVideoLessons } from "./course.service.js";
import { consumeUsage, releaseUsage } from "./aiUsage.service.js";
import { readPlanLimit, getActivePlanForUser } from "./subscriptionEntitlement.service.js";
import { getActiveAIPrompt, renderActivePrompt } from "./aiPrompt.service.js";
import { resolveRoadmapDomain, composeRoadmapPrompt } from "./domainPlaybooks.js";
import { getRelevantCanonicalSkills, resolveCanonicalSkill, normalizeSkillSlug, validateSkillGraph } from "./skillRegistry.service.js";
import { findRoadmapTemplate, getOrCreateRoadmapTemplate, personalizeRoadmapTemplate } from "./roadmapTemplate.service.js";
import { normalizeGoal, buildInterviewModule, buildExamModules, buildProjectModule, buildLearnModule, buildSchedule, applyInterviewEvidence } from "./goalModules.service.js";
import { curateNormalSearch } from "./courseCurationDecisionEngine.service.js";

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


function isDataAnalyticsTopic(topic, ai) {
  const text = String(topic || "") + " " + String(ai?.title || "") + " " + String(ai?.canonicalTopic || "");
  return /data analytics|data analyst|business analytics|business intelligence/i.test(text);
}

function ensureDataAnalyticsStages(skills, topic, ai) {
  if (!isDataAnalyticsTopic(topic, ai)) return skills;
  const result = skills.map((skill) => ({
    ...skill,
    id: normalizeId(skill.id || skill.name),
    prerequisites: (skill.prerequisites || []).map(normalizeId)
  }));
  const stages = [
    { id:"spreadsheet-analysis", name:"Spreadsheet Analysis with Excel", category:"Data Analytics", topics:["workbooks and tables","data types and formatting","sorting and filtering","IF and lookup formulas","SUMIFS and COUNTIFS","pivot tables and pivot charts","data validation","spreadsheet reporting"], searchQueries:["Microsoft Excel for Data Analysis complete course pivot tables formulas","Excel data analysis full course for beginners"], courseDuration:{minMinutes:240,targetMinutes:360,maxMinutes:600}, practiceProject:"Analyze sales data and build an Excel KPI report", projectPlacement:"skill" },
    { id:"sql-for-analytics", name:"SQL for Data Analytics", category:"Data Analytics", topics:["relational tables and keys","SELECT and filtering","sorting and limiting","aggregate functions","GROUP BY and HAVING","INNER and OUTER JOINs","CASE expressions","CTEs and subqueries","window functions","date and text functions"], searchQueries:["SQL for Data Analytics complete course joins CTE window functions","SQL full course for data analysts with projects"], courseDuration:{minMinutes:360,targetMinutes:540,maxMinutes:900}, practiceProject:"Answer business questions using a relational sales database", projectPlacement:"skill" },
    { id:"statistics-for-analytics", name:"Statistics and Probability for Analytics", category:"Statistics", topics:["mean median mode","variance and standard deviation","distributions","sampling and bias","confidence intervals","hypothesis testing","correlation versus causation","A/B testing fundamentals"], searchQueries:["statistics for data analytics complete course hypothesis testing confidence intervals","probability and statistics for data analysts beginner course"], courseDuration:{minMinutes:240,targetMinutes:360,maxMinutes:600}, practiceProject:"Interpret an experiment and explain statistical uncertainty", projectPlacement:"skill" },
    { id:"python-for-analytics", name:"Python Fundamentals for Data Analytics", category:"Programming", topics:["Python syntax and variables","collections and loops","functions","modules and virtual environments","reading CSV and Excel files","exceptions","Jupyter notebooks","writing reusable analysis code"], searchQueries:["Python for Data Analysis complete beginner course Jupyter CSV Excel","Python full course for data analysts with practical exercises"], courseDuration:{minMinutes:360,targetMinutes:540,maxMinutes:900}, practiceProject:"Automate a repeatable data-cleaning report with Python", projectPlacement:"skill" },
    { id:"numpy-pandas", name:"Data Manipulation with NumPy and Pandas", category:"Python Data Analysis", topics:["NumPy arrays","Pandas Series and DataFrames","loading CSV and Excel","selecting and filtering rows","missing values","duplicates and inconsistent values","groupby and aggregation","merge and concatenate","datetime analysis","exporting clean datasets"], searchQueries:["Pandas NumPy for Data Analysis complete course data cleaning groupby merge","Python Pandas full course for data analysts project"], courseDuration:{minMinutes:360,targetMinutes:540,maxMinutes:900}, practiceProject:"Clean and combine multiple messy business datasets", projectPlacement:"skill" },
    { id:"exploratory-data-analysis", name:"Data Cleaning and Exploratory Data Analysis", category:"Data Analysis", topics:["data quality checks","missing data strategy","outlier investigation","univariate analysis","bivariate analysis","segmentation","trend and seasonality","feature relationships","documenting assumptions","reproducible analysis"], searchQueries:["exploratory data analysis EDA complete course Python Pandas real dataset","data cleaning and EDA end to end data analyst project"], courseDuration:{minMinutes:300,targetMinutes:480,maxMinutes:720}, practiceProject:"Explore a real-world dataset and publish an analysis notebook", projectPlacement:"skill" },
    { id:"data-visualization-bi", name:"Data Visualization and BI Dashboards", category:"Business Intelligence", topics:["chart selection","visual encoding","matplotlib and seaborn basics","Power BI or Tableau fundamentals","data modeling for dashboards","measures and calculated fields","filters and drill-down","dashboard layout","accessibility and misleading charts"], searchQueries:["Power BI complete course dashboard project for data analysts","Tableau data visualization full course dashboard project","Python data visualization Matplotlib Seaborn complete tutorial"], courseDuration:{minMinutes:360,targetMinutes:540,maxMinutes:900}, practiceProject:"Build an interactive business performance dashboard", projectPlacement:"skill" },
    { id:"business-insights-storytelling", name:"Business Metrics and Data Storytelling", category:"Business Analytics", topics:["business questions and hypotheses","KPIs and metric definitions","funnel and cohort analysis","revenue and retention metrics","root-cause analysis","communicating uncertainty","writing executive summaries","recommendations and impact"], searchQueries:["business analytics KPIs data storytelling complete course for data analysts","data analysis business case study end to end tutorial"], courseDuration:{minMinutes:180,targetMinutes:300,maxMinutes:480}, practiceProject:"Turn analysis findings into a concise stakeholder recommendation", projectPlacement:"skill" }
  ];
  const matches = (stage, skill) => {
    const n = String(skill.name || "").toLowerCase();
    if (skill.id === stage.id || n === stage.name.toLowerCase()) return true;
    if (stage.id === "spreadsheet-analysis") return /excel|spreadsheet/.test(n);
    if (stage.id === "sql-for-analytics") return /\bsql\b/.test(n);
    if (stage.id === "statistics-for-analytics") return /statistics|probability/.test(n);
    if (stage.id === "python-for-analytics") return /python/.test(n);
    if (stage.id === "numpy-pandas") return /pandas|numpy/.test(n);
    if (stage.id === "exploratory-data-analysis") return /exploratory|data cleaning|\beda\b/.test(n);
    if (stage.id === "data-visualization-bi") return /visualization|power bi|tableau|business intelligence/.test(n);
    if (stage.id === "business-insights-storytelling") return /business analytics|data storytelling|business metrics/.test(n);
    return false;
  };
  for (const stage of stages) {
    if (result.some((skill) => matches(stage, skill))) continue;
    const preceding = stages.slice(0, stages.indexOf(stage)).reverse().find((candidate) =>
      result.some((skill) => skill.id === candidate.id || matches(candidate, skill))
    );
    result.push({
      id:stage.id, name:stage.name, category:stage.category, importance:"Critical",
      prerequisites:preceding ? [preceding.id] : [], topics:stage.topics, searchQueries:stage.searchQueries,
      courseDuration:stage.courseDuration, practiceProject:stage.practiceProject, projectPlacement:stage.projectPlacement,
      projectPlan:{
        scenario:"Analyze a realistic business dataset using " + stage.name + ".",
        whyThisProject:"Build practical evidence that the learner can turn data into reliable decisions.",
        features:stage.topics.slice(0,6).map((item)=>"Apply " + item),
        architecture:["Document the dataset and data dictionary","Create a repeatable analysis workflow","Validate findings before communicating results"],
        milestones:["Define the business question","Prepare and analyze the data","Validate results","Present findings and recommendations"],
        testingChecklist:["Check data types and missing values","Validate calculations against sample rows","Document assumptions and limitations"],
        industrySkills:["Data quality","Analytical reasoning","Business communication","Reproducible workflow"],
        githubWorkflow:["Create a repository","Commit notebooks and documentation","Write a README with findings and setup"],
        videoSearchQueries:stage.searchQueries
      },
      quizPolicy:{lessonQuestionCount:5,moduleQuestionCount:8,passingScore:70}
    });
  }
  if (!result.some((skill) => /capstone|portfolio project/i.test(skill.name))) {
    result.push({
      id:"data-analytics-portfolio", name:"Data Analytics Portfolio Capstone", category:"Portfolio Project", importance:"Critical",
      prerequisites:stages.map((stage)=>stage.id).filter((id)=>result.some((skill)=>skill.id===id)),
      topics:["choose a business problem","load and validate a real dataset","clean and transform data","analyze with SQL or Python","build visualizations and KPIs","write evidence-based recommendations","publish a reproducible portfolio"],
      searchQueries:["end to end data analytics portfolio project SQL Excel Python Power BI","data analyst capstone project complete tutorial real dataset"],
      courseDuration:{minMinutes:360,targetMinutes:600,maxMinutes:1200},
      practiceProject:"Complete an end-to-end data analytics portfolio case study", projectPlacement:"none",
      projectPlan:{
        scenario:"A business team needs to understand performance trends and decide what to improve next.",
        whyThisProject:"Demonstrate the complete analytics workflow from raw data to decision-ready insights.",
        features:["Dataset sourcing and documentation","Data cleaning and validation","SQL/Python analysis","KPI dashboard","Written insights and recommendations"],
        architecture:["Raw dataset","Cleaning and analysis notebook or SQL scripts","Dashboard","Executive summary and README"],
        milestones:["Define the business question","Prepare data","Analyze and validate","Build dashboard","Present recommendations and limitations"],
        testingChecklist:["Reconcile key totals","Validate transformations","Check charts against source data","Document limitations"],
        industrySkills:["SQL","Excel","Python","Visualization","Business storytelling","GitHub documentation"],
        githubWorkflow:["Publish source data or a permitted sample","Commit analysis steps","Document reproduction instructions","Add dashboard screenshots and conclusions"],
        videoSearchQueries:["end to end data analytics portfolio project SQL Excel Python Power BI","data analyst capstone project complete tutorial real dataset"]
      },
      quizPolicy:{lessonQuestionCount:5,moduleQuestionCount:8,passingScore:70}
    });
  }
  if (isDataAnalyticsTopic(topic, ai)) {
    ai.title = "Data Analytics Complete Career Path";
    ai.canonicalTopic = "Data Analytics";
    ai.category = "Data Analytics";
    ai.description = "A complete, prerequisite-ordered Data Analytics course covering spreadsheets, SQL, statistics, Python, data cleaning, visualization, business insights, and portfolio projects.";
    ai.careerOutcome = "Build job-ready data analysis skills and a portfolio of evidence-based business insights.";
    const existingCapstones = Array.isArray(ai.capstoneProjects) ? ai.capstoneProjects : [];
    if (!existingCapstones.length) {
      ai.capstoneProjects = [{
        title: "End-to-End Data Analytics Business Case Study",
        scenario: "Analyze a realistic sales, customer, or operations dataset and recommend evidence-based actions to improve business performance.",
        whyThisProject: "Demonstrate the full analytics workflow from raw data through validated analysis, dashboards, and clear business recommendations.",
        features: [
          "Define a business question and measurable KPIs",
          "Document, clean, and validate a real dataset",
          "Use SQL and/or Python with Pandas to analyze the data",
          "Build an interactive Power BI or Tableau dashboard",
          "Explain trends, segments, risks, and limitations",
          "Present prioritized recommendations in an executive summary"
        ],
        architecture: [
          "Dataset and data dictionary",
          "SQL queries and/or reproducible Python notebook",
          "Cleaned analysis-ready dataset",
          "Dashboard with KPI definitions",
          "Executive summary and project README"
        ],
        milestones: [
          "Choose a dataset and define the business question",
          "Audit and clean the data",
          "Perform exploratory and statistical analysis",
          "Build and validate KPIs and visualizations",
          "Write recommendations supported by evidence",
          "Publish the portfolio project with reproduction instructions"
        ],
        testingChecklist: [
          "Reconcile key metrics against source data",
          "Check missing values, duplicates, and outliers",
          "Validate SQL/Python transformations",
          "Check that dashboard filters and calculations work",
          "Document assumptions and analytical limitations"
        ],
        industrySkills: ["Excel", "SQL", "Python", "Pandas", "Statistics", "Power BI or Tableau", "Data storytelling", "GitHub documentation"],
        githubWorkflow: ["Create a repository with a clear README", "Commit SQL scripts and notebooks", "Document dataset provenance and setup", "Include dashboard screenshots", "Publish findings and limitations"],
        videoSearchQueries: ["end to end data analytics project SQL Excel Python Power BI full tutorial", "data analyst portfolio capstone real dataset dashboard business insights"]
      }];
    } else {
      ai.capstoneProjects = existingCapstones;
    }
  }
  return result;
}

export async function buildCourse(ai, { topic, level, studyTimeMinutesPerDay, goals, knownSkills, domain, language, intentProfile, targetRole, targetCompany, examName, examDate, syllabusText, projectIdea, deadline }, { resolveSkill = resolveCanonicalSkill, logger = console, syllabusUnits = [] } = {}) {
  const webEnrichedSkills = ensureWebIndustryStage(ai.skills || [], topic, ai);
  const enrichedSkills = ensureDataAnalyticsStages(webEnrichedSkills, topic, ai);
  const graph = validateSkillGraph(enrichedSkills, { logger });
  const domainId = resolveRoadmapDomain({ domain, topic });
  const resolved = [];
  const canonicalByAlias = new Map();
  for (const skill of graph.skills) {
    const canonical = await resolveSkill(skill.name || skill.id, {
      domain: domainId,
      aliases: [skill.id, ...(skill.aliases || [])]
    });
    resolved.push({ ...skill, id: canonical.id, canonicalSkillId: canonical.id, name: canonical.name || skill.name });
    canonicalByAlias.set(normalizeSkillSlug(skill.id), canonical.id);
    canonicalByAlias.set(normalizeSkillSlug(skill.name), canonical.id);
    canonicalByAlias.set(normalizeSkillSlug(canonical.id), canonical.id);
  }
  const canonicalGraph = resolved.map((skill) => ({
    ...skill,
    prerequisites: (skill.prerequisites || []).map((prerequisite) =>
      canonicalByAlias.get(normalizeSkillSlug(prerequisite)) || normalizeSkillSlug(prerequisite)
    )
  }));
  const repairedGraph = validateSkillGraph(canonicalGraph, { logger });
  const orderedSkills = topoSort(repairedGraph.skills.map((skill) => ({
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

  const goalProfile = { topic, goal: intentProfile?.goal, goals, level, language, minutesPerDay: studyTimeMinutesPerDay, targetRole: targetRole || intentProfile?.targetRole, targetCompany: targetCompany || intentProfile?.targetCompany, examName: examName || intentProfile?.examName, examDate: examDate || intentProfile?.examDate, syllabusText: syllabusText || intentProfile?.syllabusText, projectIdea: projectIdea || intentProfile?.projectIdea, deadline: deadline || intentProfile?.deadline };
  const goal = normalizeGoal(goalProfile);
  let verifiedSyllabusUnits = syllabusUnits;
  if (goal === "exam" && goalProfile.syllabusText && !verifiedSyllabusUnits.length && client) {
    try {
      const syllabusResponse = await client.models.generateContent({
        model: env.geminiModel,
        contents: [
          "Extract only unit or section headings that are explicitly present in the user's pasted syllabus.",
          "Do not infer, complete, normalize into new units, or add official exam content.",
          "Each returned unit must be a verbatim substring of the source text. Return an empty array if no clear unit headings exist.",
          "Source syllabus:",
          String(goalProfile.syllabusText).slice(0, 20000)
        ].join("\n"),
        config: {
          responseMimeType: "application/json",
          responseSchema: { type: "object", properties: { units: { type: "array", items: { type: "string" }, maxItems: 100 } }, required: ["units"] },
          thinkingConfig: { thinkingLevel: "LOW" },
          maxOutputTokens: 2500
        }
      });
      const extracted = JSON.parse(syllabusResponse.text || "{}");
      const source = String(goalProfile.syllabusText).toLowerCase();
      verifiedSyllabusUnits = (Array.isArray(extracted.units) ? extracted.units : []).filter((unit) => {
        const value = String(unit || "").trim();
        return value.length > 1 && source.includes(value.toLowerCase());
      });
    } catch {
      // Never substitute invented units when extraction fails; the exam module will
      // retain only revision/practice scaffolding until the learner supplies headings.
      verifiedSyllabusUnits = [];
    }
  }
  let goalModule = null;
  if (goal === "job_ready") goalModule = buildInterviewModule(goalProfile);
  else if (goal === "exam") goalModule = buildExamModules(goalProfile, { syllabusUnits: verifiedSyllabusUnits });
  else if (goal === "project") goalModule = buildProjectModule(goalProfile);
  else goalModule = buildLearnModule(goalProfile, activeSkills);
  if (goalModule) {
    goalModule.order = modules.length + 1;
    modules.push(goalModule);
  }
  const schedule = buildSchedule(modules, { minutesPerDay: studyTimeMinutesPerDay || 60, deadline: goal === "exam" ? (goalProfile.examDate || deadline) : deadline, examDate: goalProfile.examDate, now: new Date() });
  modules.splice(0, modules.length, ...schedule.modules);
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
    schedule: { minutesPerDay: schedule.minutesPerDay, studyDaysPerWeek: schedule.studyDaysPerWeek, deadline: schedule.deadline, estimatedMinutes: schedule.estimatedMinutes, availableDays: schedule.availableDays, requiredDailyMinutes: schedule.requiredDailyMinutes, scheduleWarning: schedule.scheduleWarning, revisionShare: schedule.revisionShare, revisionStartDate: schedule.revisionStartDate },
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


export async function buildRoadmapPrompt({ topic, level, goals, studyTimeMinutesPerDay, knownSkills, domain }, activePrompt, relevantSkills = []) {
  const basePrompt = renderActivePrompt(activePrompt, {
    topic: String(topic || "").trim(),
    level: String(level || "Beginner"),
    goals: JSON.stringify(Array.isArray(goals) ? goals : []),
    studyTimeMinutesPerDay: String(studyTimeMinutesPerDay || 60),
    knownSkills: JSON.stringify(Array.isArray(knownSkills) ? knownSkills : [])
  });
  const selectedDomain = resolveRoadmapDomain({ domain, topic });
  return composeRoadmapPrompt({ basePrompt, domain: selectedDomain, topic, skills: relevantSkills });
}

async function generateWithGemini({ topic, level, goals, studyTimeMinutesPerDay, knownSkills, domain }, activePrompt) {
  if (!client) {
    const error = new Error("Gemini AI is not configured. Add GEMINI_API_KEY to build a personalized roadmap.");
    error.status = 503;
    throw error;
  }

  const relevantSkills = await getRelevantCanonicalSkills(topic, 40);
  const prompt = await buildRoadmapPrompt({ topic, level, goals, studyTimeMinutesPerDay, knownSkills, domain }, activePrompt, relevantSkills);
  const finalPrompt = prompt + "\n\nPLATFORM OUTPUT CONTRACT: Return one valid JSON object matching the supplied response schema, with no markdown fences or surrounding commentary. Do not invent URLs or claim a resource has been found; resource retrieval is handled by the platform after the curriculum is generated.";

  const response = await client.models.generateContent({
    model: env.geminiModel,
    contents: finalPrompt,
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

async function curateInterviewEvidence(course, profile = {}) {
  const interviewModule = (course?.modules || []).find((module) => module.goalModule === "interview");
  const lesson = interviewModule?.lessons?.find((item) => item.id === "interview-experiences");
  if (!lesson?.tutorial) return;
  const chain = lesson.tutorial.queryFallbackChain || [];
  const evidence = [];
  for (const fallback of chain) {
    try {
      const result = await curateNormalSearch(fallback.query, {
        nodeType: "interview",
        cacheScope: `interview:${fallback.matchedLevel}`,
        maxQueries: 2,
        overrides: {
          mode: "quick_reference",
          halfLifeDays: 540,
          minVideoSeconds: 60,
          maxVideoSeconds: 5400,
          minPlaylistItems: 1,
          minPlaylistSeconds: 60
        },
        level: profile.level || "Beginner",
        language: profile.language || "en"
      });
      const resources = (result.resources || []).filter((resource) => resource.videoId || resource.sourceId).slice(0, 3);
      for (const resource of resources) {
        evidence.push({
          videoId: String(resource.videoId || resource.sourceId).replace(/^video:/, ""),
          title: resource.title || "",
          description: resource.description || "",
          channelTitle: resource.channelTitle || "",
          url: resource.url || "",
          thumbnail: resource.thumbnail || "",
          durationSeconds: Number(resource.durationSeconds || 0),
          fetchedAt: resource.fetchedAt || new Date(),
          matchedLevel: fallback.matchedLevel,
          reason: `Matched ${fallback.matchedLevel.replace(/_/g, " ")} query`
        });
      }
      if (resources.length) break;
    } catch (error) {
      // Interview resources are supplementary; retrieval failures must not fail roadmap generation.
      console.warn("Interview evidence curation failed", { matchedLevel: fallback.matchedLevel, message: error?.message || String(error) });
    }
  }
  lesson.tutorial.videos = evidence;
  lesson.tutorial.matchedLevel = evidence[0]?.matchedLevel || null;
  lesson.tutorial.searchResultsLabel = evidence.length ? `Matched ${evidence[0].matchedLevel.replace(/_/g, " ")}` : null;
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

function getQuizContext(module, lesson, practiceOnly = false) {
  const sourceLessons = practiceOnly
    ? (lesson.type === "quiz" ? (module.lessons || []).filter((item) => item.type !== "quiz") : [lesson])
    : lesson.quiz?.scope === "module"
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
    project: item.project || null,
    videos: (item.tutorial?.videos || item.project?.videos || []).map((video) => ({ title: video.title, description: video.description, duration: video.duration }))
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

export async function generateCourseQuiz({ courseId, lessonId, userId = null, practiceOnly = false, excludeQuestions = [] }) {
  const publicCourseAccess = {
    isPublished: true,
    deletedAt: null,
    $and: [{
      $or: [
        { "generation.mode": { $nin: ["normal", "ai", "module", "discovery"] } },
        {
          aiReviewStatus: "approved",
          $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
        }
      ]
    }]
  };
  const accessBranches = [publicCourseAccess];
  if (userId && await Enrollment.exists({
    user: userId,
    course: courseId,
    status: { $in: ["active", "completed"] },
    revokedBy: null
  })) {
    // Match the lesson-player access rule: an enrolled learner may continue a
    // non-private, non-archived course even when it is no longer listed publicly.
    accessBranches.push({
      visibility: { $ne: "private" },
      deletedAt: null,
      status: { $ne: "archived" },
      aiReviewStatus: { $nin: ["pending", "rejected"] }
    });
    accessBranches.push({
      visibility: "private",
      createdForUser: userId,
      deletedAt: null,
      status: { $ne: "archived" },
      aiReviewStatus: "approved",
      $or: [{ aiReviewedBy: { $ne: null } }, { aiReviewSource: "automatic" }]
    });
  }

  const course = await Course.findOne({ _id: courseId, $or: accessBranches });
  if (!course) {
    const error = new Error("Course not found or not approved for this learner");
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

  if (!located?.lesson || (!practiceOnly && (located.lesson.type !== "quiz" || !located.lesson.quiz))) {
    const error = new Error(practiceOnly ? "Choose a tutorial or project lesson to generate practice questions." : "Quiz lesson not found");
    error.status = 404;
    throw error;
  }

  const requestedCount = practiceOnly ? 5 : Math.max(3, Math.min(15, Number(located.lesson.quiz.questionCount) || 5));
  const existingQuestions = practiceOnly ? [] : (located.lesson.quiz.questions || []);
  if (!practiceOnly && existingQuestions.length >= requestedCount) {
    return {
      courseId: String(course._id),
      lessonId: String(located.lesson._id),
      quiz: located.lesson.quiz.toObject ? located.lesson.quiz.toObject() : located.lesson.quiz
    };
  }

  // Existing saved quizzes are returned before this check. Only new AI
  // generation needs the external provider to be configured.
  if (!client) {
    const error = new Error("Gemini AI is not configured. Add GEMINI_API_KEY to generate quizzes.");
    error.status = 503;
    throw error;
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

  const context = getQuizContext(located.module, located.lesson, practiceOnly);
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
    `Quiz scope: ${practiceOnly ? "lesson practice" : located.lesson.quiz.scope}`,
    `Focus topics: ${JSON.stringify(practiceOnly ? (located.lesson.quiz?.focusTopics || []) : (located.lesson.quiz.focusTopics || []))}`,
    ...(practiceOnly ? ["Create a fresh practice set that directly assesses the selected lesson, including its video title/description or project brief when available. Do not repeat a fixed course assessment.", "Avoid repeating any question in this exclusion list; create different wording and test different concepts where possible.", `Previously used questions to avoid: ${JSON.stringify((excludeQuestions || []).slice(0, 100))}`] : []),
    `Learning context: ${JSON.stringify(context)}`
  ].join("\n");

  try {
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

  if (practiceOnly) {
    return {
      courseId: String(course._id),
      lessonId: String(located.lesson._id),
      quiz: { scope: "lesson", questionCount: questions.length, passingScore: 70, focusTopics: [], questions, generatedAt: new Date() }
    };
  }

  located.lesson.quiz.questions = questions;
  located.lesson.quiz.generatedAt = new Date();
  course.$locals.revisionContext = {
    source: "system",
    summary: "On-demand quiz generation",
    reason: "Generate missing quiz questions when a learner opens the quiz"
  };
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


function courseHasTutorialVideos(course) {
  return (course?.modules || []).some((module) =>
    (module.lessons || []).some((lesson) =>
      lesson.type === "tutorial" && (lesson.tutorial?.videos || []).length > 0
    )
  );
}

function buildTopicFallback(topic, level = "Beginner") {
  const rawTopic = String(topic || "").trim();
  const normalized = rawTopic.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const cybersecurityAliases = new Set(["ciber security", "cyber security", "cybersecurity", "cyber sec"]);
  const canonicalTopic = cybersecurityAliases.has(normalized) ? "Cybersecurity" : rawTopic.replace(/\s+/g, " ");
  const cyber = /cyber ?security|information security|ethical hacking|network security|soc|penetration testing/i.test(canonicalTopic);
  const stages = cyber ? [
    { id: "security-foundations", name: "Security Foundations", topics: ["confidentiality integrity availability", "threats vulnerabilities and risk", "security controls", "security ethics and legal boundaries"], project: "Create a personal security baseline and threat model" },
    { id: "networking-linux", name: "Networking and Linux Fundamentals", topics: ["TCP IP and common ports", "DNS HTTP HTTPS and TLS", "Linux command line", "processes permissions and logs"], project: "Build a safe home lab and document network traffic" },
    { id: "defensive-security", name: "Defensive Security and Monitoring", topics: ["logs and event analysis", "SIEM fundamentals", "indicators of compromise", "incident response lifecycle"], project: "Analyze a sample security log and write an incident report" },
    { id: "web-security", name: "Web and Application Security", topics: ["OWASP Top 10", "authentication and session security", "input validation", "secure configuration and secrets"], project: "Review a deliberately vulnerable training application and document fixes" },
    { id: "ethical-testing", name: "Ethical Security Testing", topics: ["scoping and authorization", "reconnaissance in a lab", "vulnerability validation", "responsible reporting"], project: "Write a lab-only vulnerability assessment with remediation steps" },
    { id: "security-capstone", name: "Cybersecurity Capstone", topics: ["risk prioritization", "defense in depth", "monitoring plan", "incident playbook"], project: "Produce a defensive security portfolio with a threat model, lab evidence and response playbook" }
  ] : [
    { id: "foundations", name: rawTopic + " Foundations", topics: ["core terminology and concepts in " + canonicalTopic, "how the field is organized", "common use cases and outcomes"], project: "Create a concept map and glossary for " + canonicalTopic },
    { id: "core-concepts", name: "Core Concepts and Methods", topics: ["essential principles of " + canonicalTopic, "common methods and workflows", "tools and environments used in the field"], project: "Complete a guided beginner exercise in " + canonicalTopic },
    { id: "practical-workflows", name: "Tools and Practical Workflows", topics: ["set up a learning environment", "follow a repeatable workflow", "validate results and troubleshoot errors"], project: "Document a repeatable workflow for " + canonicalTopic },
    { id: "applied-practice", name: "Applied Practice and Problem Solving", topics: ["analyze realistic scenarios", "compare approaches and trade-offs", "apply concepts to a practical problem"], project: "Solve a realistic " + canonicalTopic + " problem and explain the decisions" },
    { id: "portfolio-capstone", name: "Portfolio Capstone", topics: ["define a measurable objective", "plan and implement a solution", "test, document and present the result"], project: "Build and document a portfolio-ready " + canonicalTopic + " capstone" }
  ];
  const modules = stages.map((stage, index) => {
    const query = stage.name + " complete course tutorial";
    const project = stage.project;
    return {
      title: stage.name,
      description: "A structured " + level + "-level stage for " + canonicalTopic + ".",
      skillIds: [stage.id],
      order: index + 1,
      lessons: [
        {
          id: stage.id + "-tutorial",
          title: "Learn " + stage.name,
          description: "Study the core topics and apply them to " + canonicalTopic + ".",
          type: "tutorial",
          order: 1,
          tutorial: {
            content: "Core topics: " + stage.topics.join(", ") + ".",
            searchQuery: query,
            searchQueries: [query, canonicalTopic + " " + stage.topics.slice(0, 2).join(" ") + " full tutorial"],
            requiredTopics: stage.topics,
            durationMinutes: { minMinutes: 30, targetMinutes: 90, maxMinutes: 240 },
            searchPolicy: { contentType: "complete-course", minDurationMinutes: 20, targetDurationMinutes: 60, maxDurationMinutes: 240, excludeShorts: true, requireEmbeddable: true, preferProjectBased: true, preferredLanguage: "en" }
          }
        },
        {
          id: stage.id + "-quiz",
          title: stage.name + " Knowledge Check",
          description: "Check understanding before moving to the next stage.",
          type: "quiz",
          order: 2,
          quiz: { scope: "lesson", questionCount: 5, passingScore: 70, focusTopics: stage.topics, instructions: "Answer questions about the listed stage topics." }
        },
        {
          id: stage.id + "-project",
          title: project,
          description: project,
          type: "project",
          order: 3,
          project: {
            description: project,
            objectives: stage.topics.slice(0, 4),
            requirements: stage.topics.slice(0, 4),
            instructions: "Work only in authorized practice environments. Record your process, evidence, testing and conclusions.",
            expectedOutcome: "A documented practical deliverable demonstrating " + stage.name + ".",
            submissionRequirements: ["Project notes or source files", "README with setup and scope", "Testing evidence", "Lessons learned"]
          }
        }
      ]
    };
  });
  return {
    query: rawTopic,
    intent: "topic_fallback",
    canonicalTopic,
    careerOutcome: "Build practical, demonstrable skills in " + canonicalTopic + ".",
    skillGraph: stages.map((stage, index) => ({ id: stage.id, name: stage.name, category: canonicalTopic, importance: "core", prerequisites: index ? [stages[index - 1].id] : [], practiceProject: stage.project })),
    course: {
      title: canonicalTopic + " Learning Roadmap",
      description: "A structured learning path for " + canonicalTopic + ", with tutorial search targets, knowledge checks and practical projects. Resource availability depends on configured providers.",
      category: cyber ? "Cybersecurity" : "AI Course Search",
      level,
      duration: (stages.length * 1.5) + "+ weeks",
      learningOutcomes: [
        "Explain the essential concepts of " + canonicalTopic + ".",
        "Apply the concepts through guided practice and realistic scenarios.",
        "Produce documented projects that demonstrate practical understanding."
      ],
      modules
    },
    personalization: {
      goals: [],
      studyTimeMinutesPerDay: 60,
      knownSkills: [],
      skippedSkills: [],
      rationale: ["The configured AI provider and curated knowledge base could not supply a topic-specific path, so a structured topic fallback was created.", "Verify tutorial availability and complete each practical exercise before advancing."]
    },
    sources: [],
    fallback: true
  };
}

export async function generateAIRoadmap(input, options = {}) {
  const userId = options.userId || null;
  const personalized = options.personalized !== false;
  const projectsEnabled = options.projectsEnabled !== false;
  const plan = options.plan || null;
  const activePrompt = await getActiveAIPrompt("build_with_ai");
  const promptVersionId = activePrompt.versionId || null;
  const topicKeys = buildTopicKeys(
    input.topic,
    "industry-ready-v2",
    personalized ? JSON.stringify(input.goals || []) : "",
    personalized ? JSON.stringify(input.knownSkills || []) : "",
    personalized ? String(input.studyTimeMinutesPerDay || 60) : ""
  );
  const templateProfile = personalized
    ? { ...input, canonicalTopic: input.canonicalTopic || input.topic, language: input.language || "en" }
    : { ...input, canonicalTopic: input.canonicalTopic || input.topic, goals: [], knownSkills: [], studyTimeMinutesPerDay: 60, language: input.language || "en" };
  const templatePromptVersion = activePrompt.versionId || activePrompt.version || "builtin-v1";
  // Check the user-independent template before legacy course reuse. A template hit must be
  // personalized afresh so one learner never receives another learner's saved course.
  const cachedTemplate = await findRoadmapTemplate({ profile: templateProfile, promptVersion: templatePromptVersion });
  const existing = cachedTemplate ? null : await findRecentGeneratedCourse({ mode: "ai", topicKeys, exactQuery: input.topic, includeUnpublished: true, promptVersionId });
  if (!options.asyncBuild && existing && (courseHasTutorialVideos(existing) || !env.youtubeApiKey)) {
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
    const templateResult = await getOrCreateRoadmapTemplate({
      profile: generationInput,
      promptVersion: templatePromptVersion,
      generate: () => generateWithGemini({
        ...generationInput,
        // Known skills and schedule belong to personalization, not the cached Gemini template.
        knownSkills: [],
        studyTimeMinutesPerDay: 60
      }, activePrompt)
    });
    const personalizedTemplate = personalizeRoadmapTemplate(templateResult.roadmap, generationInput);
    const ai = personalizedTemplate.roadmap;
    const built = await buildCourse(ai, { ...personalizedTemplate.profile, intentProfile: input.intentProfile, targetRole: input.targetRole, targetCompany: input.targetCompany, examName: input.examName, examDate: input.examDate, syllabusText: input.syllabusText, projectIdea: input.projectIdea, deadline: input.deadline });
    built.personalization.knownSkills = personalizedTemplate.personalization.knownSkills;
    built.personalization.skippedSkills = personalizedTemplate.personalization.skippedSkills;
    built.personalization.estimatedStudyDays = personalizedTemplate.personalization.estimatedStudyDays;
    if (!projectsEnabled) {
      built.course.modules = (built.course.modules || []).map((module) => ({
        ...module,
        lessons: (module.lessons || []).filter((lesson) => lesson.type !== "project")
      }));
    }
    // Async mode persists the complete lesson skeleton first; independent node jobs attach resources later.
    const sources = options.asyncBuild
      ? []
      : await attachYouTubeResources(built.course, { topic: input.topic, level: input.level, language: input.language || "en" });
    if (!options.asyncBuild) {
      await curateInterviewEvidence(built.course, { ...input, level: input.level, language: input.language || "en" });
      applyInterviewEvidence(built.course);
      normalizeMultiVideoLessons(built.course);
    }
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
          promptVersionId,
          promptVersion: activePrompt.version,
          promptVersionName: activePrompt.name,
          canonicalTopic: ai.canonicalTopic,
          careerOutcome: ai.careerOutcome,
          skillGraph: built.skillGraph,
          personalization: built.personalization,
          sources,
          normalSearchSnapshot
        }
      },
      isPublished: options.asyncBuild ? false : true,
      ...(options.asyncBuild ? { visibility: "private", createdForUser: userId } : {}),
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
      cached: templateResult.cached
    };
  } catch (error) {
    if (error?.status === 429 || /quota|resource_exhausted|rate limit/i.test(String(error?.message || ""))) {
      if (reservation && userId) {
        await releaseUsage({ userId, feature: "ai_course_builds", period: "month", amount: 1 }).catch(() => {});
      }
      throw error;
    }

    try {
      let fallback;
      try {
        fallback = await generateKnowledgeBaseCoursePlan({ topic: input.topic, level: input.level });
      } catch (knowledgeBaseError) {
        if (knowledgeBaseError?.status !== 404) throw knowledgeBaseError;
        fallback = buildTopicFallback(input.topic, input.level);
        fallback.sources = options.asyncBuild ? [] : await attachYouTubeResources(fallback.course);
      }

      const fallbackPersonalization = {
        goals: input.goals || [],
        studyTimeMinutesPerDay: input.studyTimeMinutesPerDay || 60,
        knownSkills: input.knownSkills || [],
        skippedSkills: [],
        rationale: [
          "AI generation was unavailable, so BuddyForStudy used a validated topic path when available or a structured topic fallback.",
          ...(fallback.personalization?.rationale || [])
        ]
      };
      const fallbackCourse = await Course.create({
        ...fallback.course,
        slug: generatedAiSlug(fallback.course.title),
        generation: {
          mode: "ai",
          query: input.topic,
          topicKeys: buildTopicKeys(input.topic, "industry-ready-v2", fallback.canonicalTopic, fallback.course.title),
          snapshot: {
            intent: fallback.intent || "ai_personalized_path_fallback",
            // This course came from the validated knowledge base/topic fallback,
            // not from the active custom prompt; keep it out of that version's cache.
            promptVersionId: null,
            promptVersion: null,
            promptVersionName: "Fallback (prompt not used)",
            canonicalTopic: fallback.canonicalTopic,
            careerOutcome: fallback.careerOutcome,
            skillGraph: fallback.skillGraph || [],
            personalization: fallbackPersonalization,
            sources: fallback.sources || [],
            normalSearchSnapshot: buildNormalSearchSnapshot(fallback.course, input.topic)
          }
        },
        isPublished: options.asyncBuild ? false : true,
        ...(options.asyncBuild ? { visibility: "private", createdForUser: userId } : {}),
        pricing: { mode: "free", price: 0, currency: "INR" },
        enrollmentEnabled: true,
        certificateEnabled: true
      });

      return {
        ...fallback,
        course: toPublicCourse(fallbackCourse),
        intent: fallback.intent || "ai_personalized_path_fallback",
        personalization: fallbackPersonalization,
        cached: false
      };
    } catch (fallbackError) {
      if (reservation && userId) {
        await releaseUsage({ userId, feature: "ai_course_builds", period: "month", amount: 1 }).catch(() => {});
      }
      throw fallbackError;
    }
  }
}
