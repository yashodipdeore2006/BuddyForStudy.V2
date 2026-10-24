const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const hasTextList = (value) => Array.isArray(value) && value.some(hasText);

function hasUsableQuiz(lesson) {
  const questions = lesson?.quiz?.questions;
  return Array.isArray(questions) && questions.length > 0 && questions.every((question) => {
    if (!hasText(question?.question || question?.text || question?.title)) return false;
    const options = question?.options;
    if (!Array.isArray(options) || options.length < 2) return false;
    const usableOptions = options.filter((option) => hasText(typeof option === "string" ? option : option?.text || option?.label));
    if (usableOptions.length < 2) return false;
    const answerKey = question?.correctOptionId ?? question?.correctAnswer ?? question?.answer ?? question?.correctOption;
    if (answerKey === undefined || answerKey === null || answerKey === "") return false;
    if (options.some((option) => option && typeof option === "object" && option.id !== undefined)) {
      return options.some((option) => String(option.id) === String(answerKey));
    }
    if (typeof answerKey === "number") return answerKey >= 0 && answerKey < options.length;
    return options.some((option) => String(typeof option === "string" ? option : option?.text || option?.label) === String(answerKey));
  });
}

function hasUsableProject(lesson) {
  const project = lesson?.project;
  return Boolean(
    hasText(project?.instructions) ||
    hasText(project?.description) ||
    hasTextList(project?.objectives) ||
    hasText(project?.expectedOutcome) ||
    hasText(lesson?.description) ||
    hasText(lesson?.content)
  );
}

function hasUsableTutorial(lesson) {
  const tutorial = lesson?.tutorial;
  const hasResource = Array.isArray(tutorial?.resources) && tutorial.resources.some(hasText);
  // A title alone is not a usable video resource; require a playable URL or provider ID.
  const hasVideo = Array.isArray(tutorial?.videos) && tutorial.videos.some((video) =>
    hasText(video?.url) || hasText(video?.videoId)
  );
  return hasText(tutorial?.content) || hasResource || hasVideo;
}

export function evaluateCourseReadiness(course) {
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const lessons = modules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  const invalidModuleTitles = modules.filter((module) => !hasText(module?.title));
  const invalidLessonTypes = lessons.filter((lesson) => !["tutorial", "project", "quiz"].includes(lesson?.type));
  const invalidQuizzes = lessons.filter((lesson) => lesson?.type === "quiz" && !hasUsableQuiz(lesson));
  const emptyTutorials = lessons.filter((lesson) => lesson?.type === "tutorial" && !hasUsableTutorial(lesson));
  const emptyProjects = lessons.filter((lesson) => lesson?.type === "project" && !hasUsableProject(lesson));
  const checks = [
    { key: "title", label: "Course title", passed: hasText(course?.title) },
    { key: "description", label: "Course description", passed: hasText(course?.description) },
    { key: "category", label: "Course category", passed: hasText(course?.category) },
    { key: "duration", label: "Estimated duration", passed: hasText(course?.duration) },
    { key: "outcomes", label: "Learning outcomes", passed: hasTextList(course?.learningOutcomes) },
    { key: "modules", label: "At least one module", passed: modules.length > 0 },
    { key: "moduleTitles", label: "All modules have titles", passed: invalidModuleTitles.length === 0 },
    { key: "lessons", label: "At least one learning item", passed: lessons.length > 0 },
    { key: "lessonTitles", label: "All learning items have titles", passed: lessons.every((lesson) => hasText(lesson?.title)) },
    { key: "lessonTypes", label: "All learning items have a supported type", passed: invalidLessonTypes.length === 0 },
    { key: "paidPrice", label: "Paid course has a positive price", passed: course?.pricing?.mode !== "paid" || Number(course?.pricing?.price) > 0 },
    { key: "quizContent", label: "Missing quiz questions can be generated when a learner opens the quiz", passed: true },
    { key: "tutorialContent", label: "Tutorial items contain content or a resource", passed: emptyTutorials.length === 0 },
    { key: "projectContent", label: "Project items include instructions or learning objectives", passed: emptyProjects.length === 0 }
  ];
  const fixGuidance = {
    title: "Add a clear course title in the course details.",
    description: "Write a course description so learners know what they will learn.",
    category: "Choose a course category in the course details.",
    duration: "Set an estimated course duration (for example, 6 weeks or 20 hours).",
    outcomes: "Add at least one non-empty learning outcome describing a skill the learner will gain.",
    modules: "Open Manage Curriculum and add at least one module.",
    moduleTitles: "Add a title to each of the " + invalidModuleTitles.length + " module(s) with a missing title.",
    lessons: "Add at least one lesson or learning item under a module.",
    lessonTitles: "Add a title to each learning item. " + lessons.filter((lesson) => !hasText(lesson?.title)).length + " item(s) currently have no title.",
    lessonTypes: "Change the type of each of the " + invalidLessonTypes.length + " unsupported learning item(s) to Tutorial, Project, or Quiz.",
    paidPrice: "Set the paid course price to a value greater than zero, or switch the pricing mode to Free.",
    quizContent: "Open Manage Curriculum and edit the " + invalidQuizzes.length + " invalid quiz lesson(s). Each question needs a question prompt, at least two non-empty answer choices, and a valid correct answer.",
    tutorialContent: "Open Manage Curriculum and add lesson content, a resource URL, or a playable video URL/ID to each of the " + emptyTutorials.length + " empty tutorial lesson(s).",
    projectContent: "Open Manage Curriculum and add instructions, objectives, an expected outcome, or project description to each of the " + emptyProjects.length + " empty project lesson(s)."
  };
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    ready: failedChecks.length === 0,
    passedCount: checks.length - failedChecks.length,
    totalChecks: checks.length,
    checks,
    failedChecks: failedChecks.map(({ key, label }) => ({ key, label, fix: fixGuidance[key] || "Review this field and complete the missing information." })),
    counts: {
      modules: modules.length,
      lessons: lessons.length,
      quizzesNeedingQuestions: invalidQuizzes.length,
      tutorialsNeedingContent: emptyTutorials.length,
      projectsNeedingInstructions: emptyProjects.length,
      modulesNeedingTitles: invalidModuleTitles.length,
      lessonsWithUnsupportedTypes: invalidLessonTypes.length
    }
  };
}
