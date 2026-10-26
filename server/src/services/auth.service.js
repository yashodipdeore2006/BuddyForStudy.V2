import { OAuth2Client } from "google-auth-library";
import * as otpService from "./otp.service.js";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { signAccessToken } from "../utils/jwt.js";
import { acceptLegalPolicies } from "./consent.service.js";

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
    emailVerified: user.emailVerified !== false,
    phoneNumber: user.phoneNumber || "",
    phoneNumberVerified: user.phoneNumberVerified === true,
    city: user.city || "",
    learningGoal: user.learningGoal || "",
    profileSetupSkippedAt: user.profileSetupSkippedAt || null,
    termsAcceptedVersion: user.termsAcceptedVersion || "",
    privacyAcknowledgedVersion: user.privacyAcknowledgedVersion || "",
    marketingEmailConsent: user.marketingEmailConsent === true
  };
}

function authError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.isOperational = true;
  return error;
}

function authTokenVersionFilter(user) {
  const version = Number.isSafeInteger(user.authTokenVersion) && user.authTokenVersion >= 0
    ? user.authTokenVersion
    : 0;
  if (version === 0) {
    // Some existing accounts predate the version field and still need revocation support.
    return {
      _id: user._id,
      $or: [
        { authTokenVersion: 0 },
        { authTokenVersion: { $exists: false } }
      ]
    };
  }
  return { _id: user._id, authTokenVersion: version };
}

async function updatePasswordAndRotateSessions(user, passwordHash, additionalFields = {}) {
  const updatedUser = await User.findOneAndUpdate(
    authTokenVersionFilter(user),
    {
      $set: { ...additionalFields, password: passwordHash },
      $inc: { authTokenVersion: 1 }
    },
    { new: true, runValidators: true }
  ).select("+password");

  if (!updatedUser) {
    throw authError("Account security settings changed. Please retry.", 409);
  }
  return updatedUser;
}

export async function register({
  name,
  email,
  password,
  termsAccepted,
  privacyAcknowledged,
  marketingEmailConsent = false
}) {
  if (termsAccepted !== true) throw authError("You must agree to the Terms of Service before registering.", 400);
  if (privacyAcknowledged !== true) throw authError("Please acknowledge the Privacy Policy before registering.", 400);
  if (typeof marketingEmailConsent !== "boolean") throw authError("Marketing email preference must be true or false.", 400);

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw authError("Email is already registered", 409);

  const hashedPassword = await User.hashPassword(password);
  let user;
  try {
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: "user",
      authProvider: "local",
      emailVerified: false,
      marketingEmailConsent: false
    });
  } catch (error) {
    // The unique email index is the final arbiter when simultaneous registrations race.
    if (error?.code === 11000) throw authError("Email is already registered", 409);
    throw error;
  }

  try {
    await otpService.sendOtp(user, "email_verification");
    await acceptLegalPolicies(user._id, {
      termsAccepted,
      privacyAcknowledged,
      marketingEmailConsent,
      source: "registration"
    });
  } catch (error) {
    // A failed registration must not leave an unusable half-created account.
    await UserConsentEventDeleteBestEffort(user._id);
    await AuthOtpDeleteBestEffort(user._id);
    await user.deleteOne();
    throw error;
  }

  return {
    requiresVerification: true,
    email: user.email
  };
}

async function AuthOtpDeleteBestEffort(userId) {
  try {
    const { AuthOtp } = await import("../models/AuthOtp.js");
    await AuthOtp.deleteMany({ user: userId });
  } catch {
    // Preserve the original registration error; cleanup should not mask it.
  }
}

async function UserConsentEventDeleteBestEffort(userId) {
  try {
    const { UserConsentEvent } = await import("../models/UserConsentEvent.js");
    await UserConsentEvent.deleteMany({ user: userId });
  } catch {
    // Preserve the original registration error; the account itself is removed below.
  }
}

export async function loginWithDependencies({ email, password }, { findUserByEmail, sendOtp }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user || !(await user.comparePassword(password))) {
    throw authError("Invalid email or password", 401);
  }
  if (!user.isActive) throw authError("Account is inactive", 401);
  if (user.authProvider !== "google" && user.emailVerified === false) {
    throw authError("Email not verified. Please verify your email before signing in.", 403);
  }

  await sendOtp(user, "login_verification");
  return {
    requiresOtp: true,
    purpose: "login_verification",
    email: user.email
  };
}

export async function login({ email, password }) {
  return loginWithDependencies({ email, password }, {
    findUserByEmail: (normalizedEmail) => User.findOne({ email: normalizedEmail }).select("+password"),
    sendOtp: otpService.sendOtp
  });
}



export async function revokeAllSessions(userId) {
  const result = await User.updateOne(
    { _id: userId },
    { $inc: { authTokenVersion: 1 } }
  );
  if (!result?.matchedCount) throw authError("User not found", 404);
  return { revoked: true };
}

export async function verifyLogin({ email, otp }) {
  const record = await otpService.verifyOtp({ email, purpose: "login_verification", code: otp });
  const user = await User.findById(record.user);
  if (!user) throw authError("Account not found", 404);
  if (!user.isActive) throw authError("Account is inactive", 401);

  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function googleLoginWithDependencies(credential, consent = null, dependencies = {}) {
  const clientId = dependencies.clientId ?? env.googleClientId;
  if (!clientId) throw authError("Google OAuth is not configured on the server", 503);

  const verifyIdToken = dependencies.verifyIdToken ?? ((options) => googleClient.verifyIdToken(options));
  const ticket = await verifyIdToken({
    idToken: credential,
    audience: clientId
  });
  const payload = ticket?.getPayload?.();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw authError("Google account could not be verified", 401);
  }

  const findUser = dependencies.findUser ?? ((filter) => User.findOne(filter));
  const createUser = dependencies.createUser ?? ((document) => User.create(document));
  const saveUser = dependencies.saveUser ?? ((user) => user.save());
  const acceptConsent = dependencies.acceptConsent ?? acceptLegalPolicies;
  const findUserById = dependencies.findUserById ?? ((userId) => User.findById(userId));
  const issueToken = dependencies.issueToken ?? signAccessToken;

  const email = payload.email.toLowerCase();
  let user = await findUser({ $or: [{ googleId: payload.sub }, { email }] });

  if (!user) {
    user = await createUser({
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
    await saveUser(user);
  }

  if (consent) {
    await acceptConsent(user._id, {
      termsAccepted: consent.termsAccepted === true,
      privacyAcknowledged: consent.privacyAcknowledged === true,
      marketingEmailConsent: consent.marketingEmailConsent === true,
      source: "registration"
    });
    user = await findUserById(user._id);
    if (!user) throw authError("Account not found", 404);
  }

  return { user: publicUser(user), token: issueToken(user) };
}

export async function googleLogin(credential, consent = null) {
  return googleLoginWithDependencies(credential, consent);
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

  const passwordHash = await User.hashPassword(newPassword);
  const updatedUser = await updatePasswordAndRotateSessions(user, passwordHash);
  return { user: publicUser(updatedUser), token: signAccessToken(updatedUser) };
}


export async function verifyEmail({ email, otp }) {
  const record = await otpService.verifyOtp({ email, purpose: "email_verification", code: otp });
  const user = await User.findById(record.user);
  if (!user) throw authError("Account not found", 404);
  user.emailVerified = true;
  await user.save();
  return { user: publicUser(user), token: signAccessToken(user) };
}

export async function resendLoginOtp(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("_id email name isActive authProvider");
  if (!user || user.authProvider === "google" || user.emailVerified === false || !user.isActive) {
    return { email: normalizedEmail };
  }
  await otpService.sendOtp(user, "login_verification");
  return { email: user.email };
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

  const passwordHash = await User.hashPassword(newPassword);
  const updatedUser = await updatePasswordAndRotateSessions(user, passwordHash, { emailVerified: true });

  return { user: publicUser(updatedUser), token: signAccessToken(updatedUser) };
}
