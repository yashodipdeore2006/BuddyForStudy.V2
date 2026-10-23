import { LegalDocument } from "../models/LegalDocument.js";
import { User } from "../models/User.js";
import { UserConsentEvent } from "../models/UserConsentEvent.js";
import { NotificationPreference } from "../models/NotificationPreference.js";

const DEFAULT_POLICY_VERSIONS = Object.freeze({
  terms: "terms-of-service@v1",
  privacy: "privacy-policy@v1",
  cookies: "cookie-policy@v1",
  marketing: "marketing-email@v1"
});

const POLICY_SLUGS = Object.freeze({
  terms: "terms-of-service",
  privacy: "privacy-policy",
  cookies: "cookie-policy"
});

function serviceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicVersion(slug, document) {
  if (!document) return DEFAULT_POLICY_VERSIONS[slug];
  const published = (document.versions || []).find((item) => item.version === document.currentVersion);
  const versionSlug = published?.slug || document.publishedSlug || document.slug || POLICY_SLUGS[slug];
  return versionSlug + "@v" + String(published?.version ?? document.currentVersion ?? 1);
}

export async function getCurrentPolicyVersions() {
  const slugs = Object.values(POLICY_SLUGS);
  const documents = await LegalDocument.find({
    isPublished: true,
    isArchived: false,
    $or: [{ slug: { $in: slugs } }, { publishedSlug: { $in: slugs } }]
  }).select("slug publishedSlug currentVersion versions").lean();

  const find = (slug) => documents.find((document) => document.publishedSlug === slug || document.slug === slug) || null;
  return {
    terms: publicVersion("terms", find(POLICY_SLUGS.terms)),
    privacy: publicVersion("privacy", find(POLICY_SLUGS.privacy)),
    cookies: publicVersion("cookies", find(POLICY_SLUGS.cookies)),
    marketing: DEFAULT_POLICY_VERSIONS.marketing,
    published: {
      terms: Boolean(find(POLICY_SLUGS.terms)),
      privacy: Boolean(find(POLICY_SLUGS.privacy)),
      cookies: Boolean(find(POLICY_SLUGS.cookies))
    }
  };
}

async function appendEvent(userId, event) {
  await UserConsentEvent.create({
    user: userId,
    type: event.type,
    version: event.version || "",
    accepted: event.accepted ?? null,
    preferences: event.preferences,
    source: event.source,
    changedFields: event.changedFields || []
  });
}

export function hasExplicitPushConsentChoice(input) {
  return Boolean(
    input &&
    typeof input === "object" &&
    Object.prototype.hasOwnProperty.call(input, "pushEnabled") &&
    typeof input.pushEnabled === "boolean"
  );
}

export function buildPushNotificationConsentEvent(enabled) {
  if (typeof enabled !== "boolean") {
    throw serviceError("Push notification consent must be true or false.");
  }
  return {
    type: "push_notifications",
    version: "web-push@v1",
    accepted: enabled,
    source: "settings",
    changedFields: []
  };
}

export async function recordPushNotificationConsent(userId, enabled) {
  const event = buildPushNotificationConsentEvent(enabled);
  await appendEvent(userId, event);
  return { accepted: event.accepted, version: event.version };
}

export async function acceptLegalPolicies(userId, {
  termsAccepted,
  privacyAcknowledged,
  marketingEmailConsent = false,
  source = "account_gate"
} = {}) {
  if (termsAccepted !== true) throw serviceError("You must agree to the Terms of Service to continue.");
  if (privacyAcknowledged !== true) throw serviceError("Please acknowledge the Privacy Policy to continue.");
  if (typeof marketingEmailConsent !== "boolean") throw serviceError("Marketing email preference must be true or false.");

  const user = await User.findById(userId);
  if (!user) throw serviceError("Account not found.", 404);
  if (!user.isActive) throw serviceError("Account is inactive.", 401);

  const versions = await getCurrentPolicyVersions();
  const now = new Date();
  user.termsAcceptedVersion = versions.terms;
  user.termsAcceptedAt = now;
  user.privacyAcknowledgedVersion = versions.privacy;
  user.privacyAcknowledgedAt = now;
  user.marketingEmailConsent = marketingEmailConsent;
  user.marketingEmailConsentAt = now;
  await user.save();

  // Keep the existing announcement email delivery gate in sync with the explicit opt-in.
  await NotificationPreference.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        emailAnnouncements: marketingEmailConsent,
        emailAnnouncementsConsentAt: marketingEmailConsent ? now : null
      },
      $setOnInsert: { user: user._id }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Promise.all([
    appendEvent(user._id, { type: "terms", version: versions.terms, accepted: true, source }),
    appendEvent(user._id, { type: "privacy", version: versions.privacy, accepted: true, source }),
    appendEvent(user._id, { type: "marketing_email", version: versions.marketing, accepted: marketingEmailConsent, source })
  ]);

  return getConsentStatus(user._id);
}

export function normalizeCookiePreferences(input = {}) {
  const value = input && typeof input === "object" ? input : {};
  return {
    necessary: true,
    analytics: value.analytics === true,
    marketing: value.marketing === true
  };
}

export async function getCookiePreferences(userId) {
  const event = await UserConsentEvent.findOne({ user: userId, type: "cookie_preferences" })
    .sort({ createdAt: -1 })
    .select("version preferences createdAt")
    .lean();
  if (!event) return { preferences: null, version: (await getCurrentPolicyVersions()).cookies };
  return {
    preferences: normalizeCookiePreferences(event.preferences || {}),
    version: event.version,
    updatedAt: event.createdAt || null
  };
}

export async function saveCookiePreferences(userId, input, source = "cookie_banner") {
  if (!input || typeof input.analytics !== "boolean" || typeof input.marketing !== "boolean") {
    throw serviceError("Choose whether to allow optional analytics and marketing cookies.");
  }
  const preferences = normalizeCookiePreferences(input);
  const versions = await getCurrentPolicyVersions();
  await appendEvent(userId, {
    type: "cookie_preferences",
    version: versions.cookies,
    preferences,
    source
  });
  return { preferences, version: versions.cookies, updatedAt: new Date().toISOString() };
}

export function normalizePhoneNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 32) return null;
  const normalized = trimmed.replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) return null;
  return normalized;
}

export async function updateContactDetails(userId, {
  phoneNumber = "",
  city = "",
  learningGoal = "",
  skip = false,
  requirePhone = false
} = {}, source = "profile_settings") {
  const user = await User.findById(userId);
  if (!user) throw serviceError("Account not found.", 404);
  if (!user.isActive) throw serviceError("Account is inactive.", 401);

  if (skip === true) {
    user.profileSetupSkippedAt = new Date();
    await user.save();
    await appendEvent(user._id, {
      type: "profile_details",
      version: "google-profile-v1",
      accepted: null,
      source,
      changedFields: ["profile_setup_skipped"]
    });
    return getConsentStatus(user._id);
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (normalizedPhone === null || (requirePhone && !normalizedPhone)) {
    throw serviceError("Enter a valid phone number with country code (8–15 digits), or choose Skip for now.");
  }
  if (typeof city !== "string" || city.trim().length > 100) throw serviceError("City must be 100 characters or fewer.");
  if (typeof learningGoal !== "string" || learningGoal.trim().length > 240) throw serviceError("Learning goal must be 240 characters or fewer.");

  const changedFields = [];
  const oldPhone = user.phoneNumber || "";
  const oldCity = user.city || "";
  const oldGoal = user.learningGoal || "";

  if (oldPhone !== normalizedPhone) {
    user.phoneNumber = normalizedPhone;
    user.phoneNumberVerified = false;
    changedFields.push("phone_number");
  }
  if (oldCity !== city.trim()) { user.city = city.trim(); changedFields.push("city"); }
  if (oldGoal !== learningGoal.trim()) { user.learningGoal = learningGoal.trim(); changedFields.push("learning_goal"); }

  if (normalizedPhone) user.profileSetupSkippedAt = null;
  else if (!requirePhone) user.profileSetupSkippedAt = new Date();

  await user.save();
  if (changedFields.length) {
    await appendEvent(user._id, {
      type: "profile_details",
      version: "profile-details-v1",
      accepted: null,
      source,
      changedFields
    });
  }
  return getConsentStatus(user._id);
}

export async function updateMarketingEmailConsent(userId, enabled) {
  if (typeof enabled !== "boolean") throw serviceError("Choose whether to receive optional product updates by email.");
  const user = await User.findById(userId);
  if (!user) throw serviceError("Account not found.", 404);
  if (!user.isActive) throw serviceError("Account is inactive.", 401);

  user.marketingEmailConsent = enabled;
  user.marketingEmailConsentAt = new Date();
  await user.save();
  await NotificationPreference.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        emailAnnouncements: enabled,
        emailAnnouncementsConsentAt: enabled ? user.marketingEmailConsentAt : null
      },
      $setOnInsert: { user: user._id }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const versions = await getCurrentPolicyVersions();
  await appendEvent(user._id, {
    type: "marketing_email",
    version: versions.marketing,
    accepted: enabled,
    source: "settings"
  });
  return { marketingEmailConsent: enabled, updatedAt: user.marketingEmailConsentAt };
}

export async function getConsentStatus(userId) {
  const user = await User.findById(userId)
    .select("name email authProvider phoneNumber phoneNumberVerified city learningGoal profileSetupSkippedAt termsAcceptedVersion termsAcceptedAt privacyAcknowledgedVersion privacyAcknowledgedAt marketingEmailConsent marketingEmailConsentAt isActive")
    .lean();
  if (!user) throw serviceError("Account not found.", 404);

  const versions = await getCurrentPolicyVersions();
  const usesGoogle = ["google", "local_google"].includes(user.authProvider);
  return {
    policies: {
      termsVersion: versions.terms,
      privacyVersion: versions.privacy,
      cookieVersion: versions.cookies,
      termsPublished: versions.published.terms,
      privacyPublished: versions.published.privacy,
      termsUrl: "/legal/terms-of-service",
      privacyUrl: "/legal/privacy-policy",
      cookiesUrl: "/legal/cookie-policy"
    },
    requiresLegalAcceptance: user.termsAcceptedVersion !== versions.terms || user.privacyAcknowledgedVersion !== versions.privacy,
    requiresProfileCompletion: usesGoogle && !user.phoneNumber && !user.profileSetupSkippedAt,
    user: {
      name: user.name,
      email: user.email,
      authProvider: user.authProvider,
      phoneNumber: user.phoneNumber || "",
      phoneNumberVerified: user.phoneNumberVerified === true,
      city: user.city || "",
      learningGoal: user.learningGoal || "",
      marketingEmailConsent: user.marketingEmailConsent === true,
      termsAcceptedAt: user.termsAcceptedAt || null,
      privacyAcknowledgedAt: user.privacyAcknowledgedAt || null
    }
  };
}
