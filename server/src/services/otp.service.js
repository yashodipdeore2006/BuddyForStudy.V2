import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { AuthOtp } from "../models/AuthOtp.js";
import { env } from "../config/env.js";
import { escapeEmailHtml, emailHtmlToText, renderBrandedEmail } from "../utils/brandedEmail.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function authError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.isOperational = true;
  return error;
}

function hashOtp(code) {
  return crypto.createHmac("sha256", env.jwtSecret).update(code).digest("hex");
}

function createOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function getOtpResendCooldownSeconds(lastSentAt, now = new Date()) {
  const lastSentMs = new Date(lastSentAt).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(lastSentMs) || !Number.isFinite(nowMs)) return 0;
  const remainingMs = RESEND_COOLDOWN_MS - (nowMs - lastSentMs);
  return remainingMs > 0 ? Math.min(RESEND_COOLDOWN_MS / 1000, Math.ceil(remainingMs / 1000)) : 0;
}

function mailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    throw authError("Email delivery is not configured on the server.", 503);
  }
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
    requireTLS: true
  });
}

export function buildOtpEmail(purpose, code, name) {
  const isReset = purpose === "password_reset";
  const isLogin = purpose === "login_verification";
  const subject = isReset
    ? "Reset your BuddyForStudy password"
    : isLogin
      ? "Your BuddyForStudy sign-in code"
      : "Verify your BuddyForStudy email";
  const heading = isReset ? "Reset your password" : isLogin ? "Confirm your sign-in" : "Welcome to BuddyForStudy";
  const intro = isReset
    ? "Use this one-time code to securely reset your password."
    : isLogin
      ? "Use this one-time code to finish signing in to your account."
      : "One quick step to get your learning journey started. Enter this code to verify your email address.";
  const contentHtml = [
    '<h1 style="margin:0 0 12px;color:#1A1B41;font-size:25px;line-height:1.25;">' + heading + '</h1>',
    '<p style="margin:0 0 18px;">Hi ' + escapeEmailHtml(name || "there") + ',</p>',
    '<p style="margin:0 0 22px;">' + intro + '</p>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td align="center" style="padding:22px 12px;background-color:#f3eefe;border:1px solid #e5ddfb;border-radius:14px;">',
    '<div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#666980;">Your one-time code</div>',
    '<div style="margin-top:8px;font-size:34px;line-height:1.3;font-weight:800;letter-spacing:9px;color:#1A1B41;">' + code + '</div>',
    '</td></tr></table>',
    '<p style="margin:0 0 10px;color:#666980;font-size:13px;">This code expires in 10 minutes. For your security, never share it with anyone.</p>',
    '<p style="margin:0;color:#666980;font-size:13px;">If you did not request this, you can safely ignore this email.</p>'
  ].join("");
  const html = renderBrandedEmail({
    contentHtml,
    preheader: isReset ? "Your secure password reset code" : isLogin ? "Your secure BuddyForStudy sign-in code" : "Verify your email to get started with BuddyForStudy",
    appUrl: env.clientUrl
  });
  return { subject, html, text: emailHtmlToText(html) };
}

export async function sendOtp(user, purpose) {
  const now = new Date();
  const existing = await AuthOtp.findOne({ user: user._id, purpose }).sort({ createdAt: -1 });
  const retryAfter = existing?.lastSentAt ? getOtpResendCooldownSeconds(existing.lastSentAt, now) : 0;
  if (retryAfter > 0) {
    const error = authError("Please wait before requesting another OTP.", 429);
    error.retryAfter = retryAfter;
    throw error;
  }
  const code = createOtp();
  const copy = buildOtpEmail(purpose, code, user.name);
  await AuthOtp.deleteMany({ user: user._id, purpose, usedAt: null });
  await AuthOtp.create({
    email: user.email,
    user: user._id,
    purpose,
    codeHash: hashOtp(code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    lastSentAt: now,
    attempts: 0
  });
  try {
    await mailer().sendMail({ from: env.mailFrom, to: user.email, subject: copy.subject, text: copy.text, html: copy.html });
  } catch (error) {
    await AuthOtp.deleteMany({ user: user._id, purpose, codeHash: hashOtp(code) });
    throw authError("Unable to send the verification email. Please try again.", 503);
  }
  return { email: user.email };
}

export async function verifyOtp({ email, purpose, code }) {
  const normalizedEmail = email.trim().toLowerCase();
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const record = await AuthOtp.findOne({ email: normalizedEmail, purpose, usedAt: null }).sort({ createdAt: -1 });
  if (!record || record.expiresAt.getTime() <= nowMs) throw authError("OTP is invalid or expired.", 400);
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) throw authError("Too many incorrect OTP attempts. Please request a new OTP.", 429);

  const submittedHash = hashOtp(code);
  if (submittedHash !== record.codeHash) {
    const attemptUpdate = await AuthOtp.updateOne(
      {
        _id: record._id,
        usedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: MAX_VERIFY_ATTEMPTS }
      },
      { $inc: { attempts: 1 } }
    );
    if (!attemptUpdate?.modifiedCount) {
      throw authError("Too many incorrect OTP attempts. Please request a new OTP.", 429);
    }
    throw authError("Incorrect OTP.", 400);
  }

  // Consume atomically so concurrent valid submissions cannot both succeed.
  const consumed = await AuthOtp.findOneAndUpdate(
    {
      _id: record._id,
      email: normalizedEmail,
      purpose,
      codeHash: submittedHash,
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: MAX_VERIFY_ATTEMPTS }
    },
    { $set: { usedAt: now } },
    { new: true }
  );
  if (!consumed) throw authError("OTP is invalid or expired.", 400);
  return consumed;
}
