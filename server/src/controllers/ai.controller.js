import { z } from "zod";
import { generateCoursePlan } from "../services/ai.service.js";
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
