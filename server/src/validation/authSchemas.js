import { z } from "zod";

const bcryptCompatiblePassword = z.string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be 72 UTF-8 bytes or fewer.");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: bcryptCompatiblePassword,
  termsAccepted: z.literal(true, { error: "You must agree to the Terms of Service." }),
  privacyAcknowledged: z.literal(true, { error: "Please acknowledge the Privacy Policy." }),
  marketingEmailConsent: z.boolean().default(false)
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

export const loginOtpSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code")
});

export const googleSchema = z.object({
  credential: z.string().min(1),
  termsAccepted: z.literal(true).optional(),
  privacyAcknowledged: z.literal(true).optional(),
  marketingEmailConsent: z.boolean().optional()
});

export const otpSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code")
});

export const resendOtpSchema = z.object({
  email: z.string().trim().email(),
  purpose: z.enum(["email_verification", "login_verification", "password_reset"])
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email()
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
  newPassword: bcryptCompatiblePassword
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: bcryptCompatiblePassword
});
