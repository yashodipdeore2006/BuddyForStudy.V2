import { z } from "zod";
import { generateCoursePlan } from "../services/ai.service.js";
import { createCourse } from "../services/course.service.js";
import { failure, success } from "../utils/response.js";

const schema = z.object({
  topic: z.string().trim().min(2).max(200),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  goals: z.array(z.string().trim().min(1)).max(20).default([])
});

export async function generateCourse(req, res, next) {
  try {
    const input = schema.parse(req.body);
    const result = await generateCoursePlan(input);
    return success(res, result, "AI course generated successfully");
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}

export async function generateAndSaveCourse(req, res, next) {
  try {
    const input = schema.parse(req.body);
    const result = await generateCoursePlan(input);
    const sourceUrls = result.sources.map((source) => source.url);

    let tutorialIndex = 0;
    for (const module of result.course.modules || []) {
      for (const lesson of module.lessons || []) {
        if (lesson.type === "tutorial") {
          lesson.tutorial ||= {};
          lesson.tutorial.resources = [
            ...(lesson.tutorial.resources || []),
            ...(sourceUrls[tutorialIndex] ? [sourceUrls[tutorialIndex]] : [])
          ];
          tutorialIndex += 1;
        }
      }
    }

    const course = await createCourse(result.course);
    return success(res, { course, sources: result.sources }, "AI course generated and saved successfully", 201);
  } catch (e) {
    if (e instanceof z.ZodError) return failure(res, "Validation failed", 400, e.flatten().fieldErrors);
    next(e);
  }
}
