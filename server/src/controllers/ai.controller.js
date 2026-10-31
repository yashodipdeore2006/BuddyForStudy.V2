import { z } from "zod";
import { generateAIRoadmap, generateCourseQuiz } from "../services/aiRoadmap.service.js";
import { failure, success } from "../utils/response.js";
import { getEntitlement, canAccessCourse } from "../services/subscriptionEntitlement.service.js";
import { getActivePlanForUser } from "../services/subscriptionEntitlement.service.js";
import { createHash } from "node:crypto";
import { QuizBank } from "../models/QuizBank.js";
import { Course } from "../models/Course.js";
import { CourseQuizAttempt } from "../models/CourseQuizAttempt.js";
import { isValidObjectId } from "../utils/ids.js";
import { gradeQuizSubmission, normalizeQuizAnswers, toPublicQuiz, toPublicQuizQuestion } from "../utils/quizSecurity.js";
import { isAutomaticContentApproval } from "../services/contentApprovalPolicy.service.js";
import { checkCourseLearningAccess } from "../utils/courseLearningAccess.js";
import { IntentProfile, normalizeIntentInput } from "../services/intent.service.js";
import { consumeRoadmapRequestAllowance, runWithRoadmapAdmission } from "../services/roadmapAdmission.service.js";
import { safeTelemetryError } from "../utils/safeTelemetryError.js";

const quizGenerationJobs = new Set();

async function ensureCourseLearningAccess(req, courseId) {
  return checkCourseLearningAccess({
    user: req.user,
    courseId,
    findEnrollment: async (filter) => {
      const { Enrollment } = await import("../models/Enrollment.js");
      return Enrollment.findOne(filter);
    },
    canAccessCourse
  });
}

async function queueNextLessonQuiz(courseId, lessonId) {
  const key = `${courseId}:${lessonId}`;
  if (quizGenerationJobs.has(key)) return;
  quizGenerationJobs.add(key);
  setImmediate(async () => {
    try {
      const bank = await QuizBank.find({ course: courseId, lesson: lessonId, isHidden: { $ne: true } }).lean();
      const excluded = bank.flatMap((item) => item.questions || []).map((question) => question.question).slice(0, 150);
      const { generateCourseQuiz } = await import("../services/aiRoadmap.service.js");
      const generated = await generateCourseQuiz({ courseId, lessonId, practiceOnly: true, excludeQuestions: excluded });
      const questions = generated.quiz.questions || [];
      const fingerprint = createHash("sha256").update(questions.map((question) => String(question.question).trim().toLowerCase()).sort().join("|")).digest("hex");
      const automaticallyApproved = await isAutomaticContentApproval("aiQuizzes");
      await QuizBank.updateOne(
        { course: courseId, lesson: lessonId, fingerprint },
        { $setOnInsert: {
          course: courseId,
          lesson: lessonId,
          fingerprint,
          title: generated.quiz.title || "Lesson Practice Quiz",
          questions,
          generatedAt: new Date(),
          moderationStatus: automaticallyApproved ? "approved" : "pending",
          moderationNote: automaticallyApproved ? "Automatically approved by the platform content policy." : "",
          moderatedBy: null,
          moderatedAt: automaticallyApproved ? new Date() : null,
          isHidden: false
        } },
        { upsert: true }
      );
    } catch (error) {
      console.error("Background lesson quiz generation failed", safeTelemetryError(error));
    } finally {
      quizGenerationJobs.delete(key);
    }
  });
}

const legacySchema = z.object({
  topic: z.string().trim().min(2).max(200),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  goals: z.array(z.string().trim().min(1)).max(20).default([]),
  studyTimeMinutesPerDay: z.number().int().min(15).max(720).default(60),
  knownSkills: z.array(z.string().trim().min(1)).max(50).default([])
});
const schema = z.object({
  topic: z.string().trim().min(2).max(200).optional(),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  goals: z.array(z.string().trim().min(1)).max(20).optional(),
  studyTimeMinutesPerDay: z.number().int().min(15).max(720).optional(),
  knownSkills: z.array(z.string().trim().min(1)).max(50).optional(),
  intentProfile: IntentProfile.optional()
}).transform((input) => {
  if (!input.intentProfile) return legacySchema.parse(input);
  const profile = normalizeIntentInput(input);
  return {
    ...input,
    topic: profile.topic,
    level: profile.level,
    goals: [({ job_ready: "Career or work growth", exam: "Exam or certification", project: "Create something", learn: "Build practical skills" })[profile.goal || "learn"]],
    studyTimeMinutesPerDay: profile.minutesPerDay,
    knownSkills: profile.knownSkills,
    intentProfile: profile
  };
});

export async function usage(req, res, next) {
  try {
    const plan = await getActivePlanForUser(req.user.userId);
    return success(res, {
      plan: plan ? {
        id: String(plan._id),
        name: plan.name,
        slug: plan.slug,
        limits: plan.limits || {}
      } : null,
      features: {
        aiCourseBuilder: Boolean((await getEntitlement(req.user.userId, "ai_course_builder")).allowed),
        personalizedRoadmaps: Boolean((await getEntitlement(req.user.userId, "personalized_roadmaps")).allowed),
        projectBasedLearning: Boolean((await getEntitlement(req.user.userId, "project_based_learning")).allowed)
      }
    });
  } catch (e) { next(e); }
}

export async function generateRoadmap(req, res, next) {
  let generatedResult = null;
  try {
    const input = schema.parse(req.body);
    const isAdmin = req.user?.user?.role === "admin";
    const personalized = isAdmin || (await getEntitlement(req.user.userId, "personalized_roadmaps")).allowed;
    const projectsEnabled = isAdmin || (await getEntitlement(req.user.userId, "project_based_learning")).allowed;
    if (!personalized) {
      return failure(res, "Personalized learning roadmaps are not included in your current plan. Upgrade to use this feature.", 403, { feature: "personalized_roadmaps", plan: (await getActivePlanForUser(req.user.userId))?.name || "Free" });
    }
    await consumeRoadmapRequestAllowance({ userId: req.user.userId, maxRequests: 5 });
    const plan = await getActivePlanForUser(req.user.userId);
    const result = await runWithRoadmapAdmission({
      userId: req.user.userId,
      work: async (assertLease) => {
        generatedResult = await generateAIRoadmap(input, {
          userId: req.user.userId,
          plan,
          personalized,
          projectsEnabled
        });
        await assertLease();
        return generatedResult;
      }
    });
    return success(res, result, "Learning roadmap generated successfully");
  } catch (e) {
    if (generatedResult?.course?._id || generatedResult?.course?.id) {
      await Course.updateOne(
        { _id: generatedResult.course._id || generatedResult.course.id, createdForUser: req.user.userId },
        { $set: { status: "archived", isPublished: false, visibility: "private" } }
      ).catch(() => {});
    }
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    if (["ROADMAP_USER_RATE_LIMIT", "ROADMAP_USER_QUEUE_LIMIT", "ROADMAP_QUEUE_FULL", "ROADMAP_ADMISSION_LEASE_LOST"].includes(e?.code)) {
      return failure(res, e.message, e.status || 503, { code: e.code, retryable: true });
    }
    next(e);
  }
}


export async function generateQuiz(req, res, next) {
  try {
    const quizSchema = z.object({
      courseId: z.string().trim().length(24),
      lessonId: z.string().trim().length(24)
    }).strict();
    const input = quizSchema.parse(req.body);
    if (!isValidObjectId(input.courseId) || !isValidObjectId(input.lessonId)) return failure(res, "Invalid course or lesson identifier", 400);

    const access = await ensureCourseLearningAccess(req, input.courseId);
    if (!access.allowed) return failure(res, access.message, access.status);

    const result = await generateCourseQuiz({ ...input, userId: req.user.userId });
    return success(res, { ...result, quiz: toPublicQuiz(result.quiz) }, "Quiz generated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function generatePracticeQuiz(req, res, next) {
  try {
    const practiceSchema = z.object({
      courseId: z.string().trim().length(24),
      lessonId: z.string().trim().length(24),
      mode: z.enum(["generate", "reattempt"]).default("generate")
    }).strict();
    const input = practiceSchema.parse(req.body);
    if (!isValidObjectId(input.courseId) || !isValidObjectId(input.lessonId)) return failure(res, "Invalid course or lesson identifier", 400);
    const access = await ensureCourseLearningAccess(req, input.courseId);
    if (!access.allowed) return failure(res, access.message, access.status);

    const filter = { course: input.courseId, lesson: input.lessonId, isHidden: { $ne: true } };
    const allBank = await QuizBank.find(filter).sort({ generatedAt: 1 });
    const bank = allBank.filter((item) => item.moderationStatus === "approved");
    if (input.mode === "reattempt") {
      const attempted = bank.filter((item) => item.attempts.some((attempt) => String(attempt.user) === String(req.user.userId)));
      const unique = new Map();
      for (const item of attempted) for (const question of item.questions) unique.set(`${item._id}-${question.id}`, { ...(question.toObject?.() || question), id: `${item._id}-${question.id}` });
      const questions = [...unique.values()];
      if (!questions.length) return failure(res, "You have not taken a quiz for this lesson yet.", 404);
      return success(res, {
        courseId: input.courseId, lessonId: input.lessonId,
        quiz: { scope: "lesson", title: "Quiz reattempt", questionCount: questions.length, passingScore: 70, questions: questions.map(toPublicQuizQuestion), quizBankIds: attempted.map((item) => String(item._id)) },
        reattempt: true
      }, "Previous lesson quiz questions loaded");
    }

    const available = bank.find((item) => !item.attempts.some((attempt) => String(attempt.user) === String(req.user.userId)));
    if (available) {
      return success(res, {
        courseId: input.courseId, lessonId: input.lessonId,
        quiz: { scope: "lesson", title: available.title, questionCount: available.questions.length, passingScore: 70, questions: available.questions.map(toPublicQuizQuestion), quizBankId: String(available._id) },
        reused: true
      }, "Lesson quiz loaded from shared question bank");
    }

    if (allBank.some((item) => item.moderationStatus !== "approved")) {
      return success(res, { courseId: input.courseId, lessonId: input.lessonId, pendingReview: true }, "AI practice questions are waiting for administrator approval");
    }

    const jobKey = `${input.courseId}:${input.lessonId}`;
    if (quizGenerationJobs.has(jobKey)) {
      return success(res, { courseId: input.courseId, lessonId: input.lessonId, generating: true }, "New lesson questions are being prepared");
    }

    const excluded = bank.flatMap((item) => item.questions.map((question) => question.question)).slice(0, 150);
    const generated = await generateCourseQuiz({
      courseId: input.courseId,
      lessonId: input.lessonId,
      userId: req.user.userId,
      practiceOnly: true,
      excludeQuestions: excluded
    });
    const questions = generated.quiz.questions || [];
    const fingerprint = createHash("sha256")
      .update(questions.map((question) => String(question.question).trim().toLowerCase()).sort().join("|"))
      .digest("hex");

    const automaticallyApproved = await isAutomaticContentApproval("aiQuizzes");
    let saved;
    try {
      saved = await QuizBank.create({
        ...filter,
        fingerprint,
        title: generated.quiz.title || "Lesson Practice Quiz",
        questions,
        generatedBy: req.user.userId,
        moderationStatus: automaticallyApproved ? "approved" : "pending",
        moderationNote: automaticallyApproved ? "Automatically approved by the platform content policy." : "",
        moderatedAt: automaticallyApproved ? new Date() : null
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      saved = await QuizBank.findOne({
        ...filter,
        attempts: { $not: { $elemMatch: { user: req.user.userId } } }
      }).sort({ generatedAt: 1 });
      if (!saved) {
        const unavailable = new Error("AI generated a duplicate quiz set. Please try Generate More again.");
        unavailable.status = 503;
        throw unavailable;
      }
    }

    if (saved.moderationStatus !== "approved") {
      return success(res, { courseId: input.courseId, lessonId: input.lessonId, pendingReview: true, reviewStatus: saved.moderationStatus || "pending" }, "AI practice questions are waiting for administrator approval");
    }
    return success(res, {
      courseId: input.courseId, lessonId: input.lessonId,
      quiz: { scope: "lesson", title: saved.title, questionCount: saved.questions.length, passingScore: 70, questions: saved.questions.map(toPublicQuizQuestion), quizBankId: String(saved._id) },
      reused: false
    }, "Lesson practice quiz ready");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function submitPracticeQuiz(req, res, next) {
  try {
    const schema = z.object({
      courseId: z.string().trim().length(24),
      lessonId: z.string().trim().length(24),
      quizBankId: z.string().trim().length(24).optional(),
      quizBankIds: z.array(z.string().trim().length(24)).max(20).default([]),
      answers: z.record(z.string().max(100), z.string().max(100)).default({})
    }).strict();
    const input = schema.parse(req.body || {});
    if (!isValidObjectId(input.courseId) || !isValidObjectId(input.lessonId)) return failure(res, "Invalid course or lesson identifier", 400);
    if (Object.keys(input.answers).length > 200) return failure(res, "Too many quiz answers were submitted", 400);
    const access = await ensureCourseLearningAccess(req, input.courseId);
    if (!access.allowed) return failure(res, access.message, access.status);
    const ids = [...new Set([...(input.quizBankId ? [input.quizBankId] : []), ...input.quizBankIds])];
    if (!ids.length) return failure(res, "Quiz set reference is required", 400);
    if (ids.some((id) => !isValidObjectId(id))) return failure(res, "Invalid quiz set reference", 400);
    const bankQuizzes = await QuizBank.find({
      _id: { $in: ids },
      course: input.courseId,
      lesson: input.lessonId,
      moderationStatus: "approved",
      isHidden: { $ne: true }
    });
    if (bankQuizzes.length !== ids.length) return failure(res, "One or more quiz sets are not approved or are no longer available.", 404);

    // Validate every selected answer across the whole submission before
    // writing any quiz attempts, so an invalid set cannot cause partial saves.
    const submissions = [];
    for (const bankQuiz of bankQuizzes) {
      const reattempt = input.quizBankIds.includes(String(bankQuiz._id));
      const questions = bankQuiz.questions || [];
      const normalized = normalizeQuizAnswers(questions, input.answers, reattempt ? `${bankQuiz._id}-` : "");
      if (!normalized.valid) return failure(res, "Answer every question using one of its available options before submitting.", 400);
      submissions.push({ bankQuiz, reattempt, questions, answers: normalized.answers });
    }

    let correctCount = 0;
    let questionCount = 0;
    const results = [];
    for (const submission of submissions) {
      const { bankQuiz, reattempt, questions, answers } = submission;
      const graded = gradeQuizSubmission(questions, answers, 70);
      bankQuiz.attempts.push({
        user: req.user.userId,
        score: graded.score,
        answers,
        attemptedAt: new Date()
      });
      await bankQuiz.save();
      correctCount += graded.correctCount;
      questionCount += graded.questionCount;
      results.push(...graded.results.map((result) => ({
        ...result,
        questionId: reattempt ? `${bankQuiz._id}-${result.questionId}` : result.questionId
      })));
    }

    const score = questionCount ? Math.round((correctCount / questionCount) * 100) : 0;
    const allLessonQuizzes = await QuizBank.find({ course: input.courseId, lesson: input.lessonId });
    const userExhaustedBank = allLessonQuizzes.length > 0 && allLessonQuizzes.every((quiz) =>
      quiz.attempts.some((attempt) => String(attempt.user) === String(req.user.userId))
    );
    if (userExhaustedBank) void queueNextLessonQuiz(input.courseId, input.lessonId);
    return success(res, {
      saved: true,
      score,
      passed: questionCount > 0 && score >= 70,
      correctCount,
      questionCount,
      results,
      backgroundGenerationQueued: userExhaustedBank
    }, "Quiz attempt graded and saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function submitCourseQuiz(req, res, next) {
  try {
    const schema = z.object({
      courseId: z.string().trim().length(24),
      lessonId: z.string().trim().length(24),
      answers: z.record(z.string().max(100), z.string().max(100)).default({})
    }).strict();
    const input = schema.parse(req.body || {});
    if (!isValidObjectId(input.courseId) || !isValidObjectId(input.lessonId)) return failure(res, "Invalid course or lesson identifier", 400);
    if (Object.keys(input.answers).length > 200) return failure(res, "Too many quiz answers were submitted", 400);

    const access = await ensureCourseLearningAccess(req, input.courseId);
    if (!access.allowed) return failure(res, access.message, access.status);

    const course = await Course.findOne({ _id: input.courseId, deletedAt: null, status: { $ne: "archived" } })
      .select("modules")
      .lean();
    if (!course) return failure(res, "Course not found", 404);
    let lesson = null;
    for (const module of course.modules || []) {
      lesson = (module.lessons || []).find((item) => String(item._id || item.id) === input.lessonId) || null;
      if (lesson) break;
    }
    if (!lesson || lesson.type !== "quiz" || !lesson.quiz) return failure(res, "Quiz lesson not found", 404);
    const questions = Array.isArray(lesson.quiz.questions) ? lesson.quiz.questions : [];
    if (!questions.length) return failure(res, "Quiz questions are not available yet. Retry quiz generation.", 409);

    const normalized = normalizeQuizAnswers(questions, input.answers);
    if (!normalized.valid) return failure(res, "Answer every question using one of its available options before submitting.", 400);
    const validAnswers = normalized.answers;
    const graded = gradeQuizSubmission(questions, validAnswers, lesson.quiz.passingScore || 70);
    const quizFingerprint = createHash("sha256")
      .update(JSON.stringify(questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: (question.options || []).map((option) => ({ id: option.id, text: option.text }))
      }))))
      .digest("hex");
    await CourseQuizAttempt.create({
      user: req.user.userId,
      course: input.courseId,
      lesson: input.lessonId,
      quizFingerprint,
      answers: validAnswers,
      score: graded.score,
      passed: graded.passed,
      correctCount: graded.correctCount,
      questionCount: graded.questionCount,
      attemptedAt: new Date()
    });
    return success(res, { ...graded, passingScore: lesson.quiz.passingScore || 70 }, "Quiz graded and attempt saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function generateAndSaveCourse(req, res, next) {
  try {
    const input = schema.parse(req.body);
    // generateAIRoadmap persists the Course itself. Do not create a second
    // Course from its public response projection (which intentionally omits
    // generation metadata and can collide on the unique slug).
    const result = await generateAIRoadmap(input);
    return success(res, { course: result.course, sources: result.sources }, "Course generated and saved successfully", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}
