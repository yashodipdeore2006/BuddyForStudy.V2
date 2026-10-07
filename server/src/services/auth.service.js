import { OAuth2Client } from "google-auth-library";
import * as otpService from "./otp.service.js";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { signAccessToken } from "../utils/jwt.js";

const googleClient = new OAuth2Client(env.googleClientId);

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    profileImage: user.profileImage || "",
    authProvider: user.authProvider,
    emailVerified: user.emailVerified !== false
  };
}

function authError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function register({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw authError("Email is already registered", 409);

  const hashedPassword = await User.hashPassword(password);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    role: "user",
    authProvider: "local",
    emailVerified: false
  });

  await otpService.sendOtp(user, "email_verification");

  return {
    requiresVerification: true,
    email: user.email
  };
}

export async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw authError("Invalid email or password", 401);
  }
  if (!user.isActive) throw authError("Account is inactive", 401);
  if (user.authProvider !== "google" && user.emailVerified === false) {
    throw authError("Email not verified. Please verify your email before signing in.", 403);
  }
  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function googleLogin(credential) {
  if (!env.googleClientId) throw authError("Google OAuth is not configured on the server", 503);

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: env.googleClientId
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw authError("Google account could not be verified", 401);
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

  if (!user) {
    user = await User.create({
      name: payload.name || email.split("@")[0],
      email,
      role: "user",
      isActive: true,
      googleId: payload.sub,
      profileImage: payload.picture || "",
      authProvider: "google",
      emailVerified: true
    });
  } else {
    if (!user.isActive) throw authError("Account is inactive", 401);
    user.googleId = payload.sub;
    user.profileImage = payload.picture || user.profileImage;
    user.authProvider = user.password ? "local_google" : "google";
    user.emailVerified = true;
    if (!user.name && payload.name) user.name = payload.name;
    await user.save();
  }

  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function updateProfile(userId, { name }) {
  const normalizedName = name.trim();
  if (normalizedName.length < 2 || normalizedName.length > 100) {
    throw authError("Name must be between 2 and 100 characters", 400);
  }

  const user = await User.findById(userId);
  if (!user) throw authError("User not found", 404);
  if (!user.isActive) throw authError("Account is inactive", 401);

  user.name = normalizedName;
  await user.save();
  return { user: publicUser(user) };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw authError("User not found", 404);
  if (!user.isActive) throw authError("Account is inactive", 401);
  if (user.authProvider === "google") {
    throw authError("Google-only accounts cannot change their BuddyForStudy password.", 400);
  }
  if (!user.password) {
    throw authError("This account does not have a password. Sign in with Google.", 400);
  }

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw authError("Current password is incorrect", 401);

  user.password = await User.hashPassword(newPassword);
  await user.save();
  return { user: publicUser(user) };
}


export async function verifyEmail({ email, otp }) {
  const record = await otpService.verifyOtp({ email, purpose: "email_verification", code: otp });
  const user = await User.findById(record.user);
  if (!user) throw authError("Account not found", 404);
  user.emailVerified = true;
  await user.save();
  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function resendEmailVerification(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    authProvider: { $in: ["local", "local_google"] }
  });

  if (!user || user.emailVerified === true) {
    return { email: normalizedEmail };
  }

  await otpService.sendOtp(user, "email_verification");
  return { email: user.email };
}

export async function requestPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    authProvider: { $in: ["local", "local_google"] }
  });

  if (user) {
    await otpService.sendOtp(user, "password_reset");
  }

  return { email: normalizedEmail };
}

export async function resetPassword({ email, otp, newPassword }) {
  const record = await otpService.verifyOtp({ email, purpose: "password_reset", code: otp });
  const user = await User.findById(record.user).select("+password");
  if (!user) throw authError("Account not found", 404);
  if (user.authProvider === "google" || !user.password) {
    throw authError("This account does not use an email password.", 400);
  }

  user.password = await User.hashPassword(newPassword);
  user.emailVerified = true;
  await user.save();

  return { user: publicUser(user), token: signAccessToken(user) };
}
