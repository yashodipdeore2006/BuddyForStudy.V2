import { z } from "zod";
import { generateAIRoadmap, generateCourseQuiz } from "../services/aiRoadmap.service.js";
import { createCourse } from "../services/course.service.js";
import { failure, success } from "../utils/response.js";
import { getEntitlement } from "../services/subscriptionEntitlement.service.js";
import { getActivePlanForUser } from "../services/subscriptionEntitlement.service.js";

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
      lessonId: z.string().trim().min(1)
    });
    const input = practiceSchema.parse(req.body);
    const { Enrollment } = await import("../models/Enrollment.js");
    const enrollment = await Enrollment.findOne({
      user: req.user.userId,
      course: input.courseId,
      status: { $in: ["active", "completed"] }
    });
    if (!enrollment) return failure(res, "Active or completed enrollment required", 403);

    const result = await generateCourseQuiz({ ...input, userId: req.user.userId, practiceOnly: true });
    return success(res, result, "Practice quiz generated successfully");
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
