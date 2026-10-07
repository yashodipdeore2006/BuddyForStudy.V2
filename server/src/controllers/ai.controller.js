import { z } from "zod";
import { generateAIRoadmap } from "../services/aiRoadmap.service.js";
import { createCourse } from "../services/course.service.js";
import { failure, success } from "../utils/response.js";

const schema = z.object({
  topic: z.string().trim().min(2).max(200),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  goals: z.array(z.string().trim().min(1)).max(20).default([]),
  studyTimeMinutesPerDay: z.number().int().min(15).max(720).default(60),
  knownSkills: z.array(z.string().trim().min(1)).max(50).default([])
});

export async function generateRoadmap(req, res, next) {
  try {
    const input = schema.parse(req.body);
    const result = await generateAIRoadmap(input);
    return success(res, result, "Learning roadmap generated successfully");
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
