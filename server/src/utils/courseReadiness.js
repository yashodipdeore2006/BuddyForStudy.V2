const hasText = (value) => typeof value === "string" && value.trim().length > 0;

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
    if (Array.isArray(options) && options.some((option) => option && typeof option === "object" && option.id !== undefined)) {
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
    hasText(project?.objectives) ||
    hasText(project?.expectedOutcome) ||
    hasText(lesson?.description) ||
    hasText(lesson?.content)
  );
}

export function evaluateCourseReadiness(course) {
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const lessons = modules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  const invalidModuleTitles = modules.filter((module) => !hasText(module?.title));
  const invalidLessonTypes = lessons.filter((lesson) => !["tutorial", "project", "quiz"].includes(lesson?.type));
  const invalidQuizzes = lessons.filter((lesson) => lesson?.type === "quiz" && !hasUsableQuiz(lesson));
  const emptyTutorials = lessons.filter((lesson) => lesson?.type === "tutorial" && !(lesson?.tutorial?.videos?.length || lesson?.tutorial?.resources?.length || hasText(lesson?.tutorial?.content)));
  const emptyProjects = lessons.filter((lesson) => lesson?.type === "project" && !hasUsableProject(lesson));
  const checks = [
    { key: "title", label: "Course title", passed: hasText(course?.title) },
    { key: "description", label: "Course description", passed: hasText(course?.description) },
    { key: "category", label: "Course category", passed: hasText(course?.category) },
    { key: "duration", label: "Estimated duration", passed: hasText(course?.duration) },
    { key: "outcomes", label: "Learning outcomes", passed: Array.isArray(course?.learningOutcomes) && course.learningOutcomes.some(hasText) },
    { key: "modules", label: "At least one module", passed: modules.length > 0 },
    { key: "moduleTitles", label: "All modules have titles", passed: invalidModuleTitles.length === 0 },
    { key: "lessons", label: "At least one learning item", passed: lessons.length > 0 },
    { key: "lessonTitles", label: "All learning items have titles", passed: lessons.every((lesson) => hasText(lesson?.title)) },
    { key: "lessonTypes", label: "All learning items have a supported type", passed: invalidLessonTypes.length === 0 },
    { key: "paidPrice", label: "Paid course has a positive price", passed: course?.pricing?.mode !== "paid" || Number(course?.pricing?.price) > 0 },
    { key: "quizContent", label: "Quiz questions have prompt and answer choices or answer key", passed: invalidQuizzes.length === 0 },
    { key: "tutorialContent", label: "Tutorial items contain content or a resource", passed: emptyTutorials.length === 0 },
    { key: "projectContent", label: "Project items include instructions or learning objectives", passed: emptyProjects.length === 0 }
  ];
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    ready: failedChecks.length === 0,
    passedCount: checks.length - failedChecks.length,
    totalChecks: checks.length,
    checks,
    failedChecks: failedChecks.map(({ key, label }) => ({ key, label })),
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
