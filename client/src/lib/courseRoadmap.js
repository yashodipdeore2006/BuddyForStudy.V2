const DEFAULT_BRAND_TOKENS = Object.freeze({
  primary: "var(--accent)",
  secondary: "var(--bfs-ai, #8B5CF6)",
  background: "var(--bg)",
  surface: "var(--surface)",
  surfaceMuted: "var(--surface-2)",
  border: "var(--border)",
  text: "var(--text)",
  mutedText: "var(--muted)"
});

export function parseRoadmapDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return 0;
  const iso = text.match(/^pt(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const clock = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) return clock[3] !== undefined
    ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
    : Number(clock[1]) * 60 + Number(clock[2]);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/);
  const seconds = text.match(/(\d+(?:\.\d+)?)\s*s/);
  return Math.max(0, Number(hours?.[1] || 0) * 3600 + Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0));
}

function uniqueStrings(values, limit = 4) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 3 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function extractTopicLines(lesson, phase) {
  const quizTopics = lesson?.quiz?.focusTopics;
  const projectTopics = [
    ...(lesson?.project?.objectives || []),
    ...(lesson?.project?.requirements || []),
    ...(lesson?.project?.features || [])
  ];
  const tutorialText = String(lesson?.tutorial?.content || "");
  const contentLines = tutorialText
    .split(/\r?\n|[•;]+/)
    .map((line) => line.replace(/^(?:[-*#]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length >= 4 && line.length <= 110 && !/^https?:\/\//i.test(line));
  const descriptionLines = String(lesson?.description || "")
    .split(/[.!?;\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 110);
  return uniqueStrings([
    ...quizTopics,
    ...projectTopics,
    ...contentLines,
    ...descriptionLines,
    ...(phase?.skills || [])
  ], 4);
}

function resolveNodeType(lesson, isFinalProjectInFinalPhase) {
  if (lesson?.type === "project") return isFinalProjectInFinalPhase ? "capstone" : "project";
  if (lesson?.type === "quiz") return "checkpoint";
  if (["checkpoint", "mock_test", "interview", "revision"].includes(lesson?.nodeType)) return "checkpoint";
  return "core";
}

function getLessonSeconds(lesson) {
  const declared = Number(lesson?.durationSeconds);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const videos = [
    ...(lesson?.tutorial?.videos || []),
    ...(lesson?.project?.videos || [])
  ];
  return videos.reduce((sum, video) => {
    const seconds = Number(video?.durationSeconds) || parseRoadmapDurationSeconds(video?.duration);
    return sum + Math.max(0, seconds);
  }, 0);
}

function getProjectTask(lesson) {
  if (lesson?.type !== "project") return "";
  return String(
    lesson?.project?.instructions ||
    lesson?.project?.description ||
    lesson?.project?.expectedOutcome ||
    ""
  ).trim();
}

export function buildCourseRoadmapDocument({ course, roadmap, completedIds = [], enrolled = false }) {
  const sourceModules = Array.isArray(course?.modules) ? course.modules : [];
  const modules = sourceModules.map((module, moduleIndex) => ({
    id: String(module?._id || module?.id || "module-" + (moduleIndex + 1)),
    title: String(module?.title || "Module " + (moduleIndex + 1)),
    order: Number(module?.order || moduleIndex + 1),
    resources: Array.isArray(module?.resources) ? module.resources : [],
    lessons: (Array.isArray(module?.lessons) ? module.lessons : []).map((lesson, lessonIndex) => ({
      ...lesson,
      id: String(lesson?._id || lesson?.id || "lesson-" + (moduleIndex + 1) + "-" + (lessonIndex + 1)),
      title: String(lesson?.title || "Lesson " + (lessonIndex + 1)),
      order: Number(lesson?.order || lessonIndex + 1),
      type: ["tutorial", "project", "quiz"].includes(lesson?.type) ? lesson.type : "tutorial"
    }))
  }));
  const lessonById = new Map(modules.flatMap((module) => module.lessons.map((lesson) => [
    lesson.id,
    { ...lesson, moduleId: module.id, moduleTitle: module.title }
  ])));
  const stageInput = Array.isArray(roadmap?.stages) ? roadmap.stages : [];
  const stages = stageInput.length ? stageInput : modules
    .filter((module) => module.lessons.length)
    .map((module, index) => ({
      id: "module-phase-" + (index + 1),
      order: index + 1,
      title: module.title,
      hours: 0,
      lessonIds: module.lessons.map((lesson) => lesson.id),
      skills: [],
      outcome: ""
    }));

  const assigned = new Set();
  const orderedStages = stages.map((stage, stageIndex) => {
    const nodeIds = uniqueStrings(
      (stage?.lessonIds || []).map(String).filter((id) => lessonById.has(id) && !assigned.has(id)),
      Number.MAX_SAFE_INTEGER
    );
    nodeIds.forEach((id) => assigned.add(id));
    return {
      id: String(stage?.id || "phase-" + (stageIndex + 1)),
      order: Number(stage?.order || stageIndex + 1),
      title: String(stage?.title || "Phase " + (stageIndex + 1)),
      estimatedHours: Math.max(0, Number(stage?.hours) || 0),
      outcome: String(stage?.outcome || "").trim(),
      skills: uniqueStrings(stage?.skills, 4),
      nodeIds
    };
  });

  // A stale or older roadmap can omit recently added course lessons. Keep them
  // visible by appending unassigned real lessons to the final phase.
  const unassigned = [...lessonById.keys()].filter((id) => !assigned.has(id));
  if (unassigned.length) {
    if (!orderedStages.length) {
      orderedStages.push({
        id: "phase-1",
        order: 1,
        title: "Course foundations",
        estimatedHours: 0,
        outcome: "",
        skills: [],
        nodeIds: []
      });
    }
    orderedStages[orderedStages.length - 1].nodeIds.push(...unassigned);
  }

  const flatIds = orderedStages.flatMap((phase) => phase.nodeIds);
  const validCompleted = new Set((Array.isArray(completedIds) ? completedIds : []).map(String));
  const totalCount = flatIds.length;
  const completedCount = enrolled ? flatIds.filter((id) => validCompleted.has(id)).length : 0;
  const currentNodeId = enrolled ? flatIds.find((id) => !validCompleted.has(id)) || null : null;
  const finalPhaseId = orderedStages[orderedStages.length - 1]?.id || null;
  const nodes = [];
  let previousNodeId = null;

  for (const phase of orderedStages) {
    const phaseLessons = phase.nodeIds.map((id) => lessonById.get(id)).filter(Boolean);
    const finalProjectId = [...phaseLessons].reverse().find((lesson) => lesson.type === "project")?.id || null;

    for (const lesson of phaseLessons) {
      const status = enrolled && validCompleted.has(lesson.id)
        ? "completed"
        : enrolled && lesson.id === currentNodeId
          ? "in_progress"
          : "remaining";
      const isFinalProjectInFinalPhase = phase.id === finalPhaseId && lesson.id === finalProjectId;
      const node = {
        id: lesson.id,
        title: lesson.title,
        type: resolveNodeType(lesson, isFinalProjectInFinalPhase),
        lessonType: lesson.type,
        estimatedHours: Math.round(getLessonSeconds(lesson) / 3600 * 100) / 100,
        prerequisites: previousNodeId ? [previousNodeId] : [],
        subtopics: extractTopicLines(lesson, phase),
        projectTask: getProjectTask(lesson),
        status,
        phaseId: phase.id,
        phaseTitle: phase.title,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        durationSeconds: getLessonSeconds(lesson),
        description: String(lesson.description || "").trim()
      };
      nodes.push(node);
      previousNodeId = lesson.id;
    }
  }

  const phaseProgress = orderedStages.map((phase) => {
    const phaseNodes = nodes.filter((node) => node.phaseId === phase.id);
    const done = phaseNodes.filter((node) => node.status === "completed").length;
    const percent = phaseNodes.length ? Math.round(done / phaseNodes.length * 100) : 0;
    return { ...phase, nodeIds: phaseNodes.map((node) => node.id), completedCount: done, nodeCount: phaseNodes.length, completionPercent: percent, status: percent === 100 && phaseNodes.length ? "completed" : percent > 0 ? "in_progress" : "remaining" };
  });

  const totalHours = Math.max(0, Number(roadmap?.totalHours) || 0);
  const nodeDurationSum = nodes.reduce((sum, node) => sum + node.durationSeconds, 0);
  const hoursRemaining = nodes.length && nodeDurationSum > 0
    ? nodes.filter((node) => node.status !== "completed").reduce((sum, node) => sum + node.durationSeconds, 0) / 3600
    : phaseProgress.reduce((sum, phase) => sum + phase.estimatedHours * (1 - phase.completionPercent / 100), 0) || (totalCount ? totalHours * (1 - completedCount / totalCount) : 0);

  const progressPercent = totalCount ? Math.round(completedCount / totalCount * 100) : 0;
  const firstIncompletePhase = phaseProgress.find((phase) => phase.status !== "completed");
  const learningOutcomes = uniqueStrings(course?.learningOutcomes, 1);
  const outcome = learningOutcomes[0] || String(course?.description || "").split(/[.!?]/)[0].trim();

  return {
    brandThemeTokens: DEFAULT_BRAND_TOKENS,
    courseMeta: {
      id: String(course?._id || course?.id || roadmap?.courseId || ""),
      title: String(course?.title || roadmap?.title || "Course roadmap"),
      description: String(course?.description || "").trim(),
      outcome,
      level: String(course?.level || ""),
      totalHours,
      moduleCount: modules.length,
      lessonCount: totalCount,
      phaseCount: phaseProgress.length
    },
    progress: {
      completedCount,
      totalCount,
      percent: progressPercent,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      currentPhaseId: firstIncompletePhase?.id || null,
    },
    phases: phaseProgress,
    nodes
  };
}

export function getRoadmapFilterMatches(node, filter, query = "") {
  const text = [
    node?.title,
    node?.moduleTitle,
    node?.phaseTitle,
    ...(node?.subtopics || [])
  ].join(" ").toLowerCase();
  if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;

  if (filter === "foundations" && !["core", "checkpoint"].includes(node?.type)) return false;
  if (filter === "projects" && !["project", "capstone"].includes(node?.type)) return false;
  if (filter === "completed" && node?.status !== "completed") return false;
  if (filter === "remaining" && node?.status === "completed") return false;
  return true;
}
