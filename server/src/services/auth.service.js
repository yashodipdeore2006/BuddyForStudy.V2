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

export async function register({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const error = new Error("Email is already registered");
    error.status = 409;
    throw error;
  }

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
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error("Account is inactive");
    error.status = 401;
    throw error;
  }

  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function googleLogin(credential) {
  if (!env.googleClientId) {
    const error = new Error("Google OAuth is not configured on the server");
    error.status = 503;
    throw error;
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: env.googleClientId
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    const error = new Error("Google account could not be verified");
    error.status = 401;
    throw error;
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
      authProvider: "google"
    });
  } else {
    if (!user.isActive) {
      const error = new Error("Account is inactive");
      error.status = 401;
      throw error;
    }

    user.googleId = payload.sub;
    user.profileImage = payload.picture || user.profileImage;
    user.authProvider = user.password ? "local_google" : "google";
    if (!user.name && payload.name) user.name = payload.name;
    await user.save();
  }

  return { user: publicUser(user), token: signAccessToken(user) };
}
