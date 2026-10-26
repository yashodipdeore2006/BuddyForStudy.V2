import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { AuthOtp } from "../models/AuthOtp.js";
import { env } from "../config/env.js";

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

function emailCopy(purpose, code, name) {
  const isReset = purpose === "password_reset";
  const subject = isReset ? "Reset your BuddyForStudy password" : "Verify your BuddyForStudy email";
  const heading = isReset ? "Password reset code" : "Verify your email";
  const intro = isReset
    ? "Use this one-time code to reset your BuddyForStudy password."
    : "Use this one-time code to verify your BuddyForStudy account.";
  return {
    subject,
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#0f172a">',
      "<h2 style=\"margin:0 0 12px\">" + heading + "</h2>",
      "<p style=\"margin:0 0 20px\">Hi " + (name || "there") + ",</p>",
      "<p style=\"line-height:1.6\">" + intro + "</p>",
      '<div style="margin:24px 0;padding:18px;background:#eff6ff;border-radius:12px;text-align:center">',
      '<div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#2563eb">' + code + "</div>",
      "</div>",
      '<p style="line-height:1.6;color:#475569">This code expires in 10 minutes. Never share it with anyone.</p>',
      "</div>"
    ].join("")
  };
}

export async function sendOtp(user, purpose) {
  const now = new Date();
  const existing = await AuthOtp.findOne({ user: user._id, purpose }).sort({ createdAt: -1 });
  if (existing?.lastSentAt && now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (now.getTime() - existing.lastSentAt.getTime())) / 1000);
    const error = authError("Please wait before requesting another OTP.", 429);
    error.retryAfter = retryAfter;
    throw error;
  }
  const code = createOtp();
  const copy = emailCopy(purpose, code, user.name);
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
    await mailer().sendMail({ from: env.mailFrom, to: user.email, subject: copy.subject, html: copy.html });
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
