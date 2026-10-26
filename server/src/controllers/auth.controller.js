import { z } from "zod";
import { registerSchema, loginSchema, loginOtpSchema, googleSchema, otpSchema, resendOtpSchema, forgotPasswordSchema, resetPasswordSchema, profileSchema, changePasswordSchema } from "../validation/authSchemas.js";
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";
import { success, failure } from "../utils/response.js";
import { authErrorResponse } from "../utils/authErrorResponse.js";

export async function register(req, res) {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    return success(res, result, "User registered successfully", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function login(req, res) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    return success(res, result, "Login successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export function googleConfig(_req, res) {
  return success(res, { enabled: Boolean(env.googleClientId), clientId: env.googleClientId });
}

export async function googleLogin(req, res) {
  try {
    const input = googleSchema.parse(req.body);
    const consent = input.termsAccepted === true && input.privacyAcknowledged === true
      ? {
          termsAccepted: true,
          privacyAcknowledged: true,
          marketingEmailConsent: input.marketingEmailConsent === true
        }
      : null;
    const result = await authService.googleLogin(input.credential, consent);
    return success(res, result, "Google authentication successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}


export async function verifyLogin(req, res) {
  try {
    const input = loginOtpSchema.parse(req.body);
    const result = await authService.verifyLogin(input);
    return success(res, result, "Login successful");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function verifyEmail(req, res) {
  try {
    const input = otpSchema.parse(req.body);
    const result = await authService.verifyEmail(input);
    return success(res, result, "Email verified successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function resendOtp(req, res) {
  try {
    const input = resendOtpSchema.parse(req.body);
    const result = input.purpose === "email_verification"
      ? await authService.resendEmailVerification(input.email)
      : input.purpose === "login_verification"
        ? await authService.resendLoginOtp(input.email)
        : await authService.requestPasswordReset(input.email);
    return success(res, result, "OTP sent successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function forgotPassword(req, res) {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(input.email);
    return success(res, result, "If the account exists, a password reset OTP has been sent.");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function resetPassword(req, res) {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(input);
    return success(res, result, "Password reset successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function updateProfile(req, res) {
  try {
    const input = profileSchema.parse(req.body);
    const result = await authService.updateProfile(req.user.user._id, input);
    return success(res, result, "Profile updated successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}

export async function changePassword(req, res) {
  try {
    const input = changePasswordSchema.parse(req.body);
    const result = await authService.changePassword(req.user.user._id, input);
    return success(res, result, "Password updated successfully");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
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
      authProvider: req.user.user.authProvider,
      phoneNumber: req.user.user.phoneNumber || "",
      phoneNumberVerified: req.user.user.phoneNumberVerified === true,
      city: req.user.user.city || "",
      learningGoal: req.user.user.learningGoal || "",
      profileSetupSkippedAt: req.user.user.profileSetupSkippedAt || null,
      termsAcceptedVersion: req.user.user.termsAcceptedVersion || "",
      privacyAcknowledgedVersion: req.user.user.privacyAcknowledgedVersion || "",
      marketingEmailConsent: req.user.user.marketingEmailConsent === true
    }
  });
}

export async function updateLearningPace(req, res) {
  try {
    const input = z.object({ hoursPerDay: z.number().int().min(1).max(4) }).parse(req.body);
    const { User } = await import("../models/User.js");
    const user = await User.findByIdAndUpdate(req.user.user._id, { $set: { learningPaceHoursPerDay: input.hoursPerDay } }, { new: true, runValidators: true }).select("learningPaceHoursPerDay");
    return success(res, { hoursPerDay: user?.learningPaceHoursPerDay || input.hoursPerDay }, "Learning pace updated");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    return authErrorResponse(res, error);
  }
}
