export const domainPlaybooks = Object.freeze({
  software_web: [
    "For software/web/full-stack learning paths, explicitly include a Git & GitHub workflow stage after the core programming/foundation stage and before heavy framework work. Teach repositories, branches, commits, pull requests, issues, README/documentation, code review, and collaborative workflow.",
    "For web/full-stack paths, include production readiness: HTTP and APIs, validation, authentication/authorization, security basics, testing/debugging, environment configuration, deployment, monitoring, and performance where relevant.",
    "Also teach software engineering fundamentals that transfer across stacks: clean code, debugging strategy, API contracts/documentation, data modeling, security, testing strategy, deployment, observability, performance trade-offs, and basic system design when relevant.",
    "At the END of a web/full-stack curriculum, provide 1-2 portfolio-grade capstone projects that combine the major technologies. For MERN, these must be full-stack MERN applications. Generate one strong YouTube search query per capstone for a long-form project build tutorial."
  ].join("\n"),
  data: [
    "Preserve the user's requested topic precisely. Do not silently replace Data Analytics with Data Science, or substitute a neighboring discipline just because the topics overlap.",
    "If the request is a course-search phrase such as 'data analytics full course', interpret 'full course' as a completeness preference, not as a different subject.",
    "For Data Analytics requests, generate a complete Data Analytics curriculum rather than a generic Data Science curriculum. It must cover spreadsheet analysis (Excel or equivalent), SQL and relational querying, descriptive statistics and probability basics, Python for analytics, NumPy and Pandas, data cleaning and exploratory data analysis, visualization and dashboards (Power BI or Tableau), business metrics and communicating insights, and portfolio projects.",
    "For a broad career or full-course request such as Data Analytics, target 8-12 ordered skill modules unless the learner explicitly says they already know or want to skip parts. Each module must contain multiple concrete topics, a suitable long-form tutorial search query, a lesson quiz, and an applied project at meaningful milestones. Include a final capstone that uses a realistic dataset and ends with actionable business recommendations."
  ].join("\n"),
  exam: "Build an exam-oriented learning path only from the supplied exam and syllabus context. Clearly distinguish user-provided syllabus items from typical topics.",
  language: "Sequence language learning from foundations through guided practice, comprehension, production, and review appropriate to the learner's level.",
  creative: "Sequence creative learning from foundational concepts through deliberate practice, critique, and a portfolio-ready applied project.",
  general: "Create a balanced prerequisite-ordered curriculum tailored to the requested topic without imposing an unrelated domain's technologies."
});
export function resolveRoadmapDomain({ domain, topic } = {}) {
  const requested = String(domain || "").trim().toLowerCase().replace(/-/g, "_");
  if (Object.hasOwn(domainPlaybooks, requested)) return requested;
  const value = String(topic || "").toLowerCase();
  if (/data analytics|data analyst|business intelligence|power bi|tableau|pandas|data cleaning/.test(value)) return "data";
  if (/exam|certification|syllabus|test preparation/.test(value)) return "exam";
  if (/language|english speaking|grammar|vocabulary|spanish|french/.test(value)) return "language";
  if (/design|drawing|photography|music|creative|video editing/.test(value)) return "creative";
  if (/mern|mean|full.?stack|web development|frontend|backend|react|node\.js|express|next\.js|java full stack|\.net|web app|software engineering|programming|developer/.test(value)) return "software_web";
  return "general";
}

export function composeRoadmapPrompt({ basePrompt, domain, topic, skills = [] } = {}) {
  const selectedDomain = resolveRoadmapDomain({ domain, topic });
  const relevant = skills.slice(0, 40).map((skill) => ({ id: skill.id, name: skill.name, domain: skill.domain || selectedDomain }));
  const registryInstruction = [
    "CANONICAL SKILL REGISTRY: Reuse the listed canonical IDs when a generated skill is the same skill. Set that skill's id to the canonical ID. Do not create a new ID for a synonym or spelling variation.",
    "Relevant canonical skills (reuse IDs when the skill is the same):",
    JSON.stringify(relevant)
  ].join("\n");
  return [String(basePrompt || "").trim(), "DOMAIN PLAYBOOK (" + selectedDomain + "):\n" + domainPlaybooks[selectedDomain], registryInstruction]
    .filter(Boolean).join("\n\n");
}
