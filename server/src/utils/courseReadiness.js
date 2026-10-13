const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export function evaluateCourseReadiness(course) {
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const lessons = modules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  const checks = [
    { key: "title", label: "Course title", passed: hasText(course?.title) },
    { key: "description", label: "Course description", passed: hasText(course?.description) },
    { key: "category", label: "Course category", passed: hasText(course?.category) },
    { key: "duration", label: "Estimated duration", passed: hasText(course?.duration) },
    { key: "outcomes", label: "Learning outcomes", passed: Array.isArray(course?.learningOutcomes) && course.learningOutcomes.some(hasText) },
    { key: "modules", label: "At least one module", passed: modules.length > 0 },
    { key: "lessons", label: "At least one learning item", passed: lessons.length > 0 },
    { key: "lessonTitles", label: "All learning items have titles", passed: lessons.every((lesson) => hasText(lesson?.title)) },
    { key: "paidPrice", label: "Paid course has a positive price", passed: course?.pricing?.mode !== "paid" || Number(course?.pricing?.price) > 0 }
  ];
  const invalidQuizzes = lessons.filter((lesson) => lesson?.type === "quiz" && (!Array.isArray(lesson?.quiz?.questions) || lesson.quiz.questions.length === 0));
  const emptyTutorials = lessons.filter((lesson) => lesson?.type === "tutorial" && !(lesson?.tutorial?.videos?.length || lesson?.tutorial?.resources?.length || hasText(lesson?.tutorial?.content)));
  checks.push({ key: "quizContent", label: "Quiz items contain questions", passed: invalidQuizzes.length === 0 });
  checks.push({ key: "tutorialContent", label: "Tutorial items contain content or a resource", passed: emptyTutorials.length === 0 });
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    ready: failedChecks.length === 0,
    passedCount: checks.length - failedChecks.length,
    totalChecks: checks.length,
    checks,
    failedChecks: failedChecks.map(({ key, label }) => ({ key, label })),
    counts: { modules: modules.length, lessons: lessons.length, quizzesNeedingQuestions: invalidQuizzes.length, tutorialsNeedingContent: emptyTutorials.length }
  };
}
