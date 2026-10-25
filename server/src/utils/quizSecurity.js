function plainQuestion(question) {
  return question && typeof question.toObject === "function" ? question.toObject() : (question || {});
}

export function toPublicQuizQuestion(question) {
  const value = plainQuestion(question);
  return {
    id: String(value.id || ""),
    ...(value.topic ? { topic: String(value.topic) } : {}),
    question: String(value.question || ""),
    options: (Array.isArray(value.options) ? value.options : []).map((option) => {
      const item = option && typeof option.toObject === "function" ? option.toObject() : (option || {});
      return { id: String(item.id || ""), text: String(item.text || "") };
    })
  };
}

export function toPublicQuiz(quiz) {
  const value = quiz && typeof quiz.toObject === "function" ? quiz.toObject() : (quiz || {});
  return {
    ...(value.scope ? { scope: value.scope } : {}),
    ...(value.title ? { title: String(value.title) } : {}),
    ...(value.instructions ? { instructions: String(value.instructions) } : {}),
    questionCount: Number(value.questionCount ?? value.questions?.length ?? 0),
    passingScore: Number(value.passingScore ?? 70),
    ...(value.focusTopics ? { focusTopics: value.focusTopics } : {}),
    ...(value.generatedAt ? { generatedAt: value.generatedAt } : {}),
    questions: (Array.isArray(value.questions) ? value.questions : []).map(toPublicQuizQuestion)
  };
}

export function gradeQuizSubmission(questions, answers = {}, passingScore = 70) {
  const list = Array.isArray(questions) ? questions : [];
  const results = list.map((rawQuestion) => {
    const question = plainQuestion(rawQuestion);
    const questionId = String(question.id || "");
    const selectedOptionId = typeof answers?.[questionId] === "string" ? answers[questionId] : "";
    const options = Array.isArray(question.options) ? question.options.map((option) =>
      option && typeof option.toObject === "function" ? option.toObject() : option
    ) : [];
    const validSelection = options.some((option) => String(option?.id || "") === selectedOptionId);
    const isCorrect = validSelection && selectedOptionId === String(question.correctOptionId || "");
    return {
      questionId,
      selectedOptionId: selectedOptionId || null,
      correctOptionId: String(question.correctOptionId || ""),
      isCorrect,
      explanation: String(question.explanation || "")
    };
  });
  const correctCount = results.filter((result) => result.isCorrect).length;
  const questionCount = results.length;
  const score = questionCount ? Math.round((correctCount / questionCount) * 100) : 0;
  const threshold = Number(passingScore);
  const normalizedPassingScore = Number.isFinite(threshold) ? Math.min(100, Math.max(0, threshold)) : 70;
  return {
    score,
    passed: questionCount > 0 && score >= normalizedPassingScore,
    correctCount,
    questionCount,
    results
  };
}

export function normalizeQuizAnswers(questions, answers = {}, questionIdPrefix = "") {
  const list = Array.isArray(questions) ? questions : [];
  if (!list.length) return { valid: false, questionId: "" };
  const normalized = {};
  for (const rawQuestion of list) {
    const question = plainQuestion(rawQuestion);
    const questionId = String(question.id || "");
    if (!questionId) return { valid: false, questionId: "" };
    const answerKey = questionIdPrefix + questionId;
    const selectedOptionId = typeof answers?.[answerKey] === "string" ? answers[answerKey] : "";
    const options = Array.isArray(question.options) ? question.options.map((option) =>
      option && typeof option.toObject === "function" ? option.toObject() : option
    ) : [];
    if (!selectedOptionId || !options.some((option) => String(option?.id || "") === selectedOptionId)) {
      return { valid: false, questionId: answerKey };
    }
    normalized[questionId] = selectedOptionId;
  }
  return { valid: true, answers: normalized };
}
