import { OAuth2Client } from "google-auth-library";
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
    authProvider: user.authProvider
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
    authProvider: "local"
  });

  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw authError("Invalid email or password", 401);
  }
  if (!user.isActive) throw authError("Account is inactive", 401);
  if (user.role === "admin") {
    throw authError("Administrator accounts must use the admin login.", 403);
  }

  return { user: publicUser(user), token: signAccessToken(user, "user") };
}

export async function adminLogin({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw authError("Invalid administrator credentials", 401);
  }
  if (!user.isActive) throw authError("Account is inactive", 401);
  if (user.role !== "admin") {
    throw authError("This account does not have administrator access.", 403);
  }

  return { user: publicUser(user), token: signAccessToken(user, "admin") };
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

  if (user?.role === "admin") {
    throw authError("Administrator accounts must use the admin login.", 403);
  }

  if (!user) {
    user = await User.create({
      name: payload.name || email.split("@")[0],
      email,
      role: "user",
      isActive: true,
      googleId: payload.sub,
      profileImage: payload.picture || "",
      authProvider: "google"
    });
  } else {
    if (!user.isActive) throw authError("Account is inactive", 401);
    user.googleId = payload.sub;
    user.profileImage = payload.picture || user.profileImage;
    user.authProvider = user.password ? "local_google" : "google";
    if (!user.name && payload.name) user.name = payload.name;
    await user.save();
  }

  return { user: publicUser(user), token: signAccessToken(user, "user") };
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
  if (!user.password) {
    throw authError("This account does not have a password. Sign in with Google.", 400);
  }

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw authError("Current password is incorrect", 401);

  user.password = await User.hashPassword(newPassword);
  await user.save();
  return { user: publicUser(user) };
}
