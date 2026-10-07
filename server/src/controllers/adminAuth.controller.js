import { z } from "zod";
import * as authService from "../services/auth.service.js";
import { success, failure } from "../utils/response.js";

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

export async function login(req, res) {
  try {
    const input = adminLoginSchema.parse(req.body);
    const result = await authService.adminLogin(input);
    return success(res, result, "Admin login successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}
