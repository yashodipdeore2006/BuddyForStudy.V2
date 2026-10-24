/**
 * Goal-specific roadmap builders. All builders are deterministic and side-effect free.
 * External evidence (Gemini syllabus extraction and retrieved video metadata) is supplied by callers.
 */

const asText = (value) => String(value ?? "").trim();
const slug = (value) => asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unique = (items) => [...new Set(items.map(asText).filter(Boolean))];

export function normalizeGoal(profile = {}) {
  const goal = profile.goal || profile.intentProfile?.goal;
  if (["job_ready", "exam", "project", "learn"].includes(goal)) return goal;
  const legacy = profile.goals || [];
  if (legacy.includes("Career or work growth")) return "job_ready";
  if (legacy.includes("Exam or certification")) return "exam";
  if (legacy.includes("Create something") || legacy.includes("Create a project or deliverable")) return "project";
  return "learn";
}

export function buildInterviewQueries({ targetCompany = "", targetRole = "", topic = "" } = {}) {
  const company = asText(targetCompany);
  const role = asText(targetRole);
  const subject = asText(topic);
  const candidates = [
    company && role ? { query: `${company} ${role} interview experience questions`, matchedLevel: "company_role" } : null,
    company ? { query: `${company} interview experience questions`, matchedLevel: "company" } : null,
    role ? { query: `${role} interview questions experience`, matchedLevel: "role" } : null,
    subject ? { query: `${subject} interview questions`, matchedLevel: "generic" } : null
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((item) => {
    const key = item.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Only summarizes retrieved evidence; never infers rounds from a company name. */
export function buildEvidenceBackedRoundsSummary(videos = []) {
  const evidence = videos.filter((video) => asText(video.videoId) && (asText(video.title) || asText(video.description)));
  if (!evidence.length) return null;
  return {
    label: "Evidence from retrieved videos",
    summary: evidence.map((video) => [asText(video.title), asText(video.description)].filter(Boolean).join(" — ")).join("\n"),
    evidenceVideoIds: unique(evidence.map((video) => video.videoId))
  };
}

export function buildInterviewModule(profile = {}, retrievedVideos = []) {
  const topic = asText(profile.topic || profile.intentProfile?.topic);
  const targetRole = asText(profile.targetRole || profile.intentProfile?.targetRole);
  const targetCompany = asText(profile.targetCompany || profile.intentProfile?.targetCompany);
  const queries = buildInterviewQueries({ targetCompany, targetRole, topic });
  if (!queries.length) return null;
  const evidenceSummary = buildEvidenceBackedRoundsSummary(retrievedVideos);
  return {
    title: "Interview preparation",
    description: "Interview preparation based on retrieved learning resources; company-specific details are included only when supported by evidence.",
    goalModule: "interview",
    queryFallbackChain: queries,
    skillIds: [],
    order: 0,
    lessons: [
      {
        id: "interview-experiences",
        title: "Interview experiences and questions",
        description: "Review retrieved interview experiences and role-relevant questions. Search results are labelled by the specificity of the query that found them.",
        type: "tutorial",
        order: 1,
        tutorial: {
          content: evidenceSummary?.summary || "No verified interview-video evidence has been retrieved yet. No company rounds or hiring facts are asserted.",
          searchQueries: queries.map((item) => item.query),
          queryFallbackChain: queries,
          evidenceVideoIds: evidenceSummary?.evidenceVideoIds || [],
          roundsSummary: evidenceSummary
        }
      },
      {
        id: "interview-practice-questions",
        title: "Role-focused practice questions",
        description: "Practice technical, HR, and behavioural questions grounded in the role's learning topics.",
        type: "quiz",
        order: 2,
        quiz: { scope: "module", questionCount: 10, passingScore: 70, focusTopics: unique([topic, targetRole]), instructions: "Use only established topic knowledge and retrieved evidence; do not assert company-specific rounds without evidence." }
      }
    ]
  };
}

export function buildExamModules(profile = {}, { syllabusUnits = [] } = {}) {
  const examName = asText(profile.examName || profile.intentProfile?.examName) || "Exam preparation";
  const pastedSyllabus = asText(profile.syllabusText || profile.intentProfile?.syllabusText);
  const source = pastedSyllabus ? "user" : "typical";
  const units = pastedSyllabus
    ? unique(syllabusUnits.filter((unit) => pastedSyllabus.toLowerCase().includes(asText(unit).toLowerCase())))
    : unique(syllabusUnits);
  const safeUnits = units.length ? units : (pastedSyllabus ? [] : [`${examName} core concepts`, `${examName} practice questions`]);
  const examDate = asText(profile.examDate || profile.intentProfile?.examDate);
  const startOrder = 1;
  const lessons = safeUnits.map((unit, index) => ({
    id: `exam-unit-${index + 1}-${slug(unit)}`,
    title: unit,
    description: source === "user" ? "Unit extracted and verified against the syllabus text you provided." : "Typical practice topic; not an official syllabus claim.",
    type: "tutorial",
    order: startOrder + index,
    source,
    tutorial: { content: unit, requiredTopics: [unit], searchQuery: `${examName} ${unit} study tutorial`, searchQueries: [`${examName} ${unit} study tutorial`], source }
  }));
  const studyDays = examDate ? Math.max(1, Math.ceil((Date.parse(examDate) - Date.now()) / 86400000)) : null;
  const revisionMinutes = studyDays ? Math.round(studyDays * 0.2 * 60) : null;
  lessons.push({
    id: "exam-revision-block",
    title: "Final revision block",
    description: "Reserve the final 20% of available preparation time for revision and recall practice.",
    type: "revision",
    order: lessons.length + 1,
    source,
    schedule: { share: 0.2, minutes: revisionMinutes }
  });
  lessons.push({
    id: "exam-mock-tests",
    title: "Mock tests and exam practice",
    description: "Practice questions based on the supplied syllabus or clearly labelled typical topics.",
    type: "quiz",
    order: lessons.length + 1,
    source,
    quiz: { scope: "module", questionCount: 15, passingScore: 70, focusTopics: safeUnits }
  });
  return {
    title: examName,
    description: source === "typical" ? "Typical exam-preparation topics, not verified official syllabus content." : "Exam preparation mapped only to units verified against the syllabus text supplied by the learner.",
    goalModule: "exam",
    source,
    syllabusWarning: source === "typical" ? "These are typical practice topics, not an official syllabus." : null,
    examDate: examDate || null,
    skillIds: [],
    order: 0,
    lessons
  };
}

export function buildProjectModule(profile = {}) {
  const idea = asText(profile.projectIdea || profile.intentProfile?.projectIdea || profile.topic);
  if (!idea) return null;
  const milestones = [
    "Define requirements and acceptance criteria",
    "Design the architecture and data model",
    "Implement the smallest end-to-end version",
    "Add validation, error handling, and tests",
    "Document setup and deployment"
  ];
  return {
    title: "Project build path",
    description: "A milestone-based build path for the project idea supplied by the learner.",
    goalModule: "project",
    projectIdea: idea,
    skillIds: [],
    order: 0,
    lessons: milestones.map((milestone, index) => ({
      id: `project-milestone-${index + 1}`,
      title: milestone,
      description: `Milestone ${index + 1} for: ${idea}`,
      type: index === milestones.length - 1 ? "checkpoint" : "project",
      order: index + 1,
      source: "user",
      project: { description: milestone, milestones: [milestone], videoSearchQueries: [`${idea} ${milestone.toLowerCase()} tutorial`] }
    }))
  };
}

export function buildLearnModule(profile = {}, skills = []) {
  const topic = asText(profile.topic || profile.intentProfile?.topic) || "the selected topic";
  const sourceSkills = unique(skills.map((skill) => skill.name || skill.title || skill));
  const fundamentals = sourceSkills.length ? sourceSkills.slice(0, 6) : [`${topic} fundamentals`, `${topic} core concepts`];
  const lessons = [];
  fundamentals.forEach((skill, index) => {
    lessons.push({ id: `learn-fundamentals-${index + 1}-${slug(skill)}`, title: skill, description: "Learn core concepts and check understanding before moving forward.", type: "tutorial", order: lessons.length + 1, source: "generated", tutorial: { requiredTopics: [skill], searchQueries: [`${skill} fundamentals tutorial`] } });
    lessons.push({ id: `learn-quiz-${index + 1}`, title: `${skill} quiz`, description: `Check understanding of ${skill}.`, type: "quiz", order: lessons.length + 1, quiz: { scope: "lesson", questionCount: 5, passingScore: 70, focusTopics: [skill] } });
  });
  lessons.push({ id: "learn-small-project", title: `Small ${topic} project`, description: "Apply the fundamentals in one small, finishable project.", type: "project", order: lessons.length + 1, project: { description: `Build a small project that demonstrates ${topic} fundamentals.`, milestones: ["Plan", "Build", "Test", "Explain what you learned"] } });
  return { title: `${topic} learning path`, description: "Fundamentals, knowledge checks, and one small project.", goalModule: "learn", skillIds: [], order: 0, lessons };
}

export function buildSchedule(modules = [], { minutesPerDay = 60, deadline = null, examDate = null, studyDaysPerWeek = 6, now = "2000-01-01T00:00:00.000Z" } = {}) {
  const dailyMinutes = Math.max(15, Number(minutesPerDay) || 60);
  const daysPerWeek = Math.max(1, Math.min(7, Number(studyDaysPerWeek) || 6));
  const endDate = deadline || examDate;
  const lessons = modules.flatMap((module) => module.lessons || []);
  const estimatedMinutes = lessons.reduce((sum, lesson) => sum + Math.max(15, Number(lesson.durationMinutes || lesson.tutorial?.durationMinutes?.targetMinutes || lesson.project?.estimatedMinutes || (lesson.type === "quiz" ? 20 : 45))), 0);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const availableDays = endDate ? Math.max(0, Math.ceil((Date.parse(endDate) - nowMs) / 86400000)) : null;
  const availableStudyDays = availableDays === null ? null : Math.floor(availableDays / 7) * daysPerWeek + Math.min(daysPerWeek, availableDays % 7);
  const requiredDailyMinutes = availableStudyDays > 0 ? Math.ceil(estimatedMinutes / availableStudyDays) : null;
  const scheduleWarning = requiredDailyMinutes !== null && requiredDailyMinutes > dailyMinutes * 1.5
    ? "The deadline requires more than 1.5 times your selected daily study time. Lowest-priority items should be optional."
    : null;
  const revision = endDate ? lessons.filter((lesson) => lesson.type === "revision" || lesson.id === "exam-revision-block") : [];
  const revisionStartDate = endDate ? new Date(Date.parse(endDate) - Math.ceil(Math.max(1, availableDays || 1) * 0.2) * 86400000).toISOString().slice(0, 10) : null;
  const scheduledModules = modules.map((module) => ({ ...module, lessons: (module.lessons || []).map((lesson) => ({ ...lesson })) }));
  const scheduledLessons = scheduledModules.flatMap((module) => module.lessons);
  if (endDate && scheduledLessons.length) {
    let cursor = Date.parse(revisionStartDate || endDate);
    const regular = scheduledLessons.filter((lesson) => lesson.type !== "revision" && lesson.id !== "exam-revision-block");
    for (let index = regular.length - 1; index >= 0; index -= 1) {
      const lesson = regular[index];
      const duration = Math.max(15, Number(lesson.durationMinutes || lesson.tutorial?.durationMinutes?.targetMinutes || lesson.project?.estimatedMinutes || (lesson.type === "quiz" ? 20 : 45)));
      const spanDays = Math.max(1, Math.ceil(duration / dailyMinutes));
      const finish = new Date(cursor).toISOString().slice(0, 10);
      cursor -= spanDays * 86400000;
      lesson.schedule = { ...(lesson.schedule || {}), startDate: new Date(cursor).toISOString().slice(0, 10), endDate: finish, estimatedMinutes: duration };
    }
    for (const revisionLesson of revision) {
      const scheduled = scheduledLessons.find((item) => item.id === revisionLesson.id);
      if (scheduled) scheduled.schedule = { ...(scheduled.schedule || {}), startDate: revisionStartDate, endDate, share: 0.2 };
    }
  }
  return { minutesPerDay: dailyMinutes, studyDaysPerWeek: daysPerWeek, deadline: endDate, estimatedMinutes, availableDays, requiredDailyMinutes, scheduleWarning, revisionShare: revision.length ? 0.2 : 0, revisionStartDate, modules: scheduledModules };
}

/** Attach retrieved evidence after the normal video retrieval pipeline has completed. */
export function applyInterviewEvidence(course) {
  const module = (course?.modules || []).find((item) => item.goalModule === "interview");
  if (!module) return course;
  const lesson = (module.lessons || []).find((item) => item.id === "interview-experiences");
  if (!lesson) return course;
  const videos = (lesson.tutorial?.videos || []).map((video) => ({
    videoId: video.videoId,
    title: video.title,
    description: video.description
  }));
  const summary = buildEvidenceBackedRoundsSummary(videos);
  lesson.tutorial.roundsSummary = summary;
  lesson.tutorial.evidenceVideoIds = summary?.evidenceVideoIds || [];
  lesson.tutorial.content = summary?.summary || "No verified interview-video evidence has been retrieved yet. No company rounds or hiring facts are asserted.";
  return course;
}
