/**
 * Learner-facing projection for saved personalized roadmaps.
 * Quiz answer indices and explanations are withheld until that module has an
 * attempt saved for this learner; server-side grading still uses the stored key.
 */
export function sanitizeLearningRoadmap(roadmap) {
  const value = roadmap?.toObject ? roadmap.toObject() : roadmap;
  if (!value || typeof value !== "object") return value;
  const attemptedModules = new Set(
    (Array.isArray(value.quizAttempts) ? value.quizAttempts : [])
      .map((attempt) => Number(attempt?.moduleIndex))
      .filter((index) => Number.isInteger(index) && index >= 0)
  );
  const modules = Array.isArray(value.course?.modules) ? value.course.modules : [];
  return {
    ...value,
    course: value.course ? {
      ...value.course,
      modules: modules.map((module, moduleIndex) => {
        if (!module?.quiz || !Array.isArray(module.quiz.questions)) return module;
        if (attemptedModules.has(moduleIndex)) return module;
        return {
          ...module,
          quiz: {
            ...module.quiz,
            questions: module.quiz.questions.map((question) => {
              if (!question || typeof question !== "object") return question;
              const { answer, correctOptionId, explanation, ...publicQuestion } = question;
              return publicQuestion;
            })
          }
        };
      })
    } : value.course
  };
}
