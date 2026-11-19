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

const addressSchema = z.object({
  line1: z.string().trim().max(160).optional(),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
  formatted: z.string().trim().max(500).optional()
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phoneNumber: z.string().trim().max(32).optional(),
  city: z.string().trim().max(100).optional(),
  address: addressSchema.optional()
}).refine((value) => Object.keys(value).length > 0, "At least one profile field is required.");

export const googleContactImportSchema = z.object({
  accessToken: z.string().min(20).max(4096)
});

export const phoneNumberSchema = z.object({
  phoneNumber: z.string().refine(
    (value) => value.startsWith("+") && /^[1-9][0-9]{7,14}$/.test(value.slice(1)),
    "Enter a valid international phone number."
  )
});

export const phoneVerificationSchema = z.object({
  code: z.string().regex(/^[0-9]{4,10}$/, "Enter the verification code sent to your phone.")
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: bcryptCompatiblePassword
});
