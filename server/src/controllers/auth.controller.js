import { z } from "zod";
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

const googleSchema = z.object({
  credential: z.string().min(1)
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128)
});

export async function register(req, res) {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    return success(res, result, "User registered successfully", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}

export async function login(req, res) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    return success(res, result, "Login successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}

export async function adminLogin(req, res) {
  try {
    const input = adminLoginSchema.parse(req.body);
    const result = await authService.adminLogin(input);
    return success(res, result, "Admin login successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}

export function googleConfig(_req, res) {
  return success(res, { enabled: Boolean(env.googleClientId), clientId: env.googleClientId });
}

export async function googleLogin(req, res) {
  try {
    const { credential } = googleSchema.parse(req.body);
    const result = await authService.googleLogin(credential);
    return success(res, result, "Google authentication successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}

export async function updateProfile(req, res) {
  try {
    const input = profileSchema.parse(req.body);
    const result = await authService.updateProfile(req.user.user._id, input);
    return success(res, result, "Profile updated successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}

export async function changePassword(req, res) {
  try {
    const input = changePasswordSchema.parse(req.body);
    const result = await authService.changePassword(req.user.user._id, input);
    return success(res, result, "Password updated successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return failure(res, error.message, error.status || 500);
  }
}

export function logout(_req, res) {
  return success(res, {}, "Logout successful");
}

export async function me(req, res) {
  return success(res, {
    user: {
      id: req.user.user._id.toString(),
      name: req.user.user.name,
      email: req.user.user.email,
      role: req.user.user.role,
      isActive: req.user.user.isActive,
      profileImage: req.user.user.profileImage || "",
      authProvider: req.user.user.authProvider
    }
  });
}
