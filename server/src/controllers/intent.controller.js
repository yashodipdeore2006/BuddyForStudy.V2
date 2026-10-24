import { z } from "zod";
import { env } from "../config/env.js";
import { parseIntent, IntentQuery } from "../services/intent.service.js";
import { failure, success } from "../utils/response.js";
export async function parseIntentController(req, res, next) {
  if (!env.intentV2) return failure(res, "Intent v2 is not enabled.", 404);
  try {
    const body = z.object({ query: IntentQuery }).parse(req.body);
    const result = await parseIntent(body.query);
    return success(res, result, "Intent parsed");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    next(error);
  }
}
