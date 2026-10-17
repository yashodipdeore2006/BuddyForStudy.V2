import { z } from "zod";
import { generateAIRoadmap, generateCourseQuiz } from "../services/aiRoadmap.service.js";
import { createCourse } from "../services/course.service.js";
import { failure, success } from "../utils/response.js";
import { getEntitlement } from "../services/subscriptionEntitlement.service.js";
import { getActivePlanForUser } from "../services/subscriptionEntitlement.service.js";
import { createHash } from "node:crypto";
import { QuizBank } from "../models/QuizBank.js";

const quizGenerationJobs = new Set();

async function queueNextLessonQuiz(courseId, lessonId) {
  const key = `${courseId}:${lessonId}`;
  if (quizGenerationJobs.has(key)) return;
  quizGenerationJobs.add(key);
  setImmediate(async () => {
    try {
      const bank = await QuizBank.find({ course: courseId, lesson: lessonId }).lean();
      const excluded = bank.flatMap((item) => item.questions || []).map((question) => question.question).slice(0, 150);
      const { generateCourseQuiz } = await import("../services/aiRoadmap.service.js");
      const generated = await generateCourseQuiz({ courseId, lessonId, practiceOnly: true, excludeQuestions: excluded });
      const questions = generated.quiz.questions || [];
      const fingerprint = createHash("sha256").update(questions.map((question) => String(question.question).trim().toLowerCase()).sort().join("|")).digest("hex");
      await QuizBank.updateOne(
        { course: courseId, lesson: lessonId, fingerprint },
        { $setOnInsert: { course: courseId, lesson: lessonId, fingerprint, title: generated.quiz.title || "Lesson Practice Quiz", questions, generatedAt: new Date() } },
        { upsert: true }
      );
    } catch (error) {
      console.error("Background lesson quiz generation failed:", error?.message || error);
    } finally {
      quizGenerationJobs.delete(key);
    }
  });
}

const schema = z.object({
  topic: z.string().trim().min(2).max(200),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  goals: z.array(z.string().trim().min(1)).max(20).default([]),
  studyTimeMinutesPerDay: z.number().int().min(15).max(720).default(60),
  knownSkills: z.array(z.string().trim().min(1)).max(50).default([])
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
  try {
    const input = schema.parse(req.body);
    const isAdmin = req.user?.user?.role === "admin";
    const personalized = isAdmin || (await getEntitlement(req.user.userId, "personalized_roadmaps")).allowed;
    const projectsEnabled = isAdmin || (await getEntitlement(req.user.userId, "project_based_learning")).allowed;
    const plan = await getActivePlanForUser(req.user.userId);
    const result = await generateAIRoadmap(input, {
      userId: req.user.userId,
      plan,
      personalized,
      projectsEnabled
    });
    return success(res, result, "Learning roadmap generated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}


export async function generateQuiz(req, res, next) {
  try {
    const quizSchema = z.object({
      courseId: z.string().trim().min(1),
      lessonId: z.string().trim().min(1)
    });
    const input = quizSchema.parse(req.body);

    const { Enrollment } = await import("../models/Enrollment.js");
    const enrollment = await Enrollment.findOne({
      user: req.user.userId,
      course: input.courseId,
      status: { $in: ["active", "completed"] }
    });
    if (!enrollment) return failure(res, "Active or completed enrollment required", 403);

    const result = await generateCourseQuiz({ ...input, userId: req.user.userId });
    return success(res, result, "Quiz generated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function generatePracticeQuiz(req, res, next) {
  try {
    const practiceSchema = z.object({
      courseId: z.string().trim().min(1),
      lessonId: z.string().trim().min(1),
      mode: z.enum(["generate", "reattempt"]).default("generate")
    });
    const input = practiceSchema.parse(req.body);
    const { Enrollment } = await import("../models/Enrollment.js");
    const enrollment = await Enrollment.findOne({
      user: req.user.userId,
      course: input.courseId,
      status: { $in: ["active", "completed"] }
    });
    if (!enrollment) return failure(res, "Active or completed enrollment required", 403);

    const filter = { course: input.courseId, lesson: input.lessonId };
    const bank = await QuizBank.find(filter).sort({ generatedAt: 1 });
    if (input.mode === "reattempt") {
      const attempted = bank.filter((item) => item.attempts.some((attempt) => String(attempt.user) === String(req.user.userId)));
      const unique = new Map();
      for (const item of attempted) for (const question of item.questions) unique.set(`${item._id}-${question.id}`, { ...(question.toObject?.() || question), id: `${item._id}-${question.id}` });
      const questions = [...unique.values()];
      if (!questions.length) return failure(res, "You have not taken a quiz for this lesson yet.", 404);
      return success(res, {
        courseId: input.courseId, lessonId: input.lessonId,
        quiz: { scope: "lesson", title: "Quiz reattempt", questionCount: questions.length, passingScore: 70, questions, quizBankIds: attempted.map((item) => String(item._id)) },
        reattempt: true
      }, "Previous lesson quiz questions loaded");
    }

    const available = bank.find((item) => !item.attempts.some((attempt) => String(attempt.user) === String(req.user.userId)));
    if (available) {
      return success(res, {
        courseId: input.courseId, lessonId: input.lessonId,
        quiz: { scope: "lesson", title: available.title, questionCount: available.questions.length, passingScore: 70, questions: available.questions, quizBankId: String(available._id) },
        reused: true
      }, "Lesson quiz loaded from shared question bank");
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

    let saved;
    try {
      saved = await QuizBank.create({
        ...filter,
        fingerprint,
        title: generated.quiz.title || "Lesson Practice Quiz",
        questions,
        generatedBy: req.user.userId
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      saved = await QuizBank.findOne(filter).sort({ generatedAt: 1 });
      if (!saved) throw error;
    }

    return success(res, {
      courseId: input.courseId, lessonId: input.lessonId,
      quiz: { scope: "lesson", title: saved.title, questionCount: saved.questions.length, passingScore: 70, questions: saved.questions, quizBankId: String(saved._id) },
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
      courseId: z.string().trim().min(1),
      lessonId: z.string().trim().min(1),
      quizBankId: z.string().trim().min(1).optional(),
      quizBankIds: z.array(z.string().trim().min(1)).default([]),
      score: z.number().min(0).max(100),
      answers: z.record(z.string(), z.string()).default({})
    });
    const input = schema.parse(req.body);
    const ids = [...new Set([...(input.quizBankId ? [input.quizBankId] : []), ...input.quizBankIds])];
    if (!ids.length) return failure(res, "Quiz set reference is required", 400);
    const bankQuizzes = await QuizBank.find({ _id: { $in: ids }, course: input.courseId, lesson: input.lessonId });
    if (!bankQuizzes.length) return failure(res, "Quiz set not found", 404);
    for (const bankQuiz of bankQuizzes) {
      bankQuiz.attempts.push({ user: req.user.userId, score: input.score, answers: input.answers, attemptedAt: new Date() });
      await bankQuiz.save();
    }
    const allLessonQuizzes = await QuizBank.find({ course: input.courseId, lesson: input.lessonId });
    const userExhaustedBank = allLessonQuizzes.length > 0 && allLessonQuizzes.every((quiz) =>
      quiz.attempts.some((attempt) => String(attempt.user) === String(req.user.userId))
    );
    if (userExhaustedBank) void queueNextLessonQuiz(input.courseId, input.lessonId);
    return success(res, { saved: true, backgroundGenerationQueued: userExhaustedBank }, "Quiz attempt saved");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function generateAndSaveCourse(req, res, next) {
  try {
    const input = schema.parse(req.body);
    const result = await generateAIRoadmap(input);
    const course = await createCourse(result.course);
    return success(res, { course, sources: result.sources }, "Course generated and saved successfully", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}
