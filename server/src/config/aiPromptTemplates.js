export const AI_PROMPT_FEATURES = Object.freeze({
  build_with_ai: Object.freeze({
    key: "build_with_ai",
    label: "Build with AI",
    description: "Generates the curriculum structure and course outline for the learner's requested topic, goals, level, and prior skills.",
    defaultName: "Built-in Build with AI prompt",
    requiredPlaceholders: ["topic", "level", "goals", "studyTimeMinutesPerDay", "knownSkills"],
    maxLength: 30000,
    defaultPrompt: [
      "You are BuddyForStudy's curriculum architect.",
      "Create a realistic prerequisite-ordered learning curriculum for the learner.",
      "This is NOT a search result. Design a learning path from first principles to the stated outcome.",
      "Preserve the user's requested topic precisely. Do not silently replace Data Analytics with Data Science, or substitute a neighboring discipline just because the topics overlap.",
      "For Data Analytics requests, generate a complete Data Analytics curriculum rather than a generic Data Science curriculum. It must cover spreadsheet analysis (Excel or equivalent), SQL and relational querying, descriptive statistics and probability basics, Python for analytics, NumPy and Pandas, data cleaning and exploratory data analysis, visualization and dashboards (Power BI or Tableau), business metrics and communicating insights, and portfolio projects.",
      "For a broad career or full-course request such as Data Analytics, target 8-12 ordered skill modules unless the learner explicitly says they already know or want to skip parts. Each module must contain multiple concrete topics, a suitable long-form tutorial search query, a lesson quiz, and an applied project at meaningful milestones. Include a final capstone that uses a realistic dataset and ends with actionable business recommendations.",
      "Do not return only a high-level roadmap or a list of skill names. The generated course must be learner-ready: ordered modules, specific topic-level lessons, real tutorial/video resources attached by the resource service, quizzes/assessments, practical projects, and a final portfolio capstone.",
      "Use the requested topic to determine the curriculum title, canonicalTopic, category, skills, and learning outcomes. Only broaden the topic when the user explicitly asks for a broad career path.",
      "If the request is a course-search phrase such as 'data analytics full course', interpret 'full course' as a completeness preference, not as a different subject.",
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
      "Topic: {{topic}}",
      "Learner level: {{level}}",
      "Goals: {{goals}}",
      "Study time per day: {{studyTimeMinutesPerDay}} minutes",
      "Already known skills: {{knownSkills}}"
    ].join("\n")
  }),
  lesson_summary: Object.freeze({
    key: "lesson_summary",
    label: "Lesson summary",
    description: "Generates the concise lesson summary and practical key notes displayed in the learning assistant.",
    defaultName: "Built-in lesson summary prompt",
    requiredPlaceholders: ["context"],
    maxLength: 12000,
    defaultPrompt: [
      "You are BuddyForStudy's lesson study assistant.",
      "Use ONLY the supplied lesson/course context.",
      "Do not introduce unrelated topics, facts, recommendations, or content that is not supported by that context.",
      "Create a concise learner-friendly summary and practical key notes for THIS lesson only.",
      "Return valid JSON with exactly: summary (string) and keyNotes (array of strings).",
      "Keep summary under 250 words and keyNotes between 5 and 10 items.",
      "Context:",
      "{{context}}"
    ].join("\n")
  })
});

export const AI_PROMPT_FEATURE_KEYS = Object.freeze(Object.keys(AI_PROMPT_FEATURES));

export function validatePromptTemplate(feature, prompt) {
  const definition = AI_PROMPT_FEATURES[feature];
  if (!definition) return { valid: false, message: "Unsupported AI prompt feature." };
  if (typeof prompt !== "string") return { valid: false, message: "Prompt content must be text." };
  const value = prompt.trim();
  if (value.length < 100) return { valid: false, message: "Prompt must contain at least 100 characters." };
  if (value.length > definition.maxLength) return { valid: false, message: `Prompt exceeds the ${definition.maxLength.toLocaleString()} character limit.` };
  const missing = definition.requiredPlaceholders.filter((key) => !value.includes(`{{${key}}}`));
  if (missing.length) return { valid: false, message: "Required placeholders are missing: " + missing.map((key) => `{{${key}}}`).join(", ") + "." };
  return { valid: true, value };
}

export function renderPromptTemplate(template, values = {}) {
  return String(template || "").replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
