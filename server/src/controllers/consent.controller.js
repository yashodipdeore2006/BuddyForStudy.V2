import { z } from "zod";
import * as consentService from "../services/consent.service.js";
import { failure, success } from "../utils/response.js";

const legalAcceptanceSchema = z.object({
  termsAccepted: z.literal(true, { error: "You must agree to the Terms of Service." }),
  privacyAcknowledged: z.literal(true, { error: "You must acknowledge the Privacy Policy." }),
  marketingEmailConsent: z.boolean().default(false)
});

const cookiePreferencesSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean()
});

const profileDetailsSchema = z.object({
  phoneNumber: z.string().max(32).default(""),
  city: z.string().max(100).default(""),
  learningGoal: z.string().max(240).default("")
});

const marketingConsentSchema = z.object({ enabled: z.boolean() });

function actorId(req) {
  return req.user?.user?._id || req.user?.userId;
}

function respondError(res, error) {
  if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
  return failure(res, error.message || "Unable to update consent settings.", error.status || 500);
}

export async function policyVersions(_req, res, next) {
  try {
    const versions = await consentService.getCurrentPolicyVersions();
    return success(res, {
      policies: {
        termsVersion: versions.terms,
        privacyVersion: versions.privacy,
        cookieVersion: versions.cookies,
        termsPublished: versions.published.terms,
        privacyPublished: versions.published.privacy,
        termsUrl: "/legal/terms-of-service",
        privacyUrl: "/legal/privacy-policy",
        cookiesUrl: "/legal/cookie-policy"
      }
    });
  } catch (error) { next(error); }
}

export async function status(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    return success(res, { status: await consentService.getConsentStatus(actorId(req)) });
  } catch (error) { next(error); }
}

export async function acceptLegal(req, res, next) {
  try {
    const input = legalAcceptanceSchema.parse(req.body);
    const status = await consentService.acceptLegalPolicies(actorId(req), {
      ...input,
      source: "account_gate"
    });
    return success(res, { status }, "Legal acknowledgements saved.");
  } catch (error) { return respondError(res, error); }
}

export async function getCookiePreferences(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    return success(res, await consentService.getCookiePreferences(actorId(req)));
  } catch (error) { next(error); }
}

export async function saveCookiePreferences(req, res, next) {
  try {
    const input = cookiePreferencesSchema.parse(req.body);
    const data = await consentService.saveCookiePreferences(actorId(req), input);
    return success(res, data, "Cookie preferences saved.");
  } catch (error) { return respondError(res, error); }
}

export async function completeGoogleProfile(req, res, next) {
  try {
    const input = profileDetailsSchema.parse(req.body);
    const status = await consentService.updateContactDetails(actorId(req), {
      ...input,
      requirePhone: true,
      skip: false
    }, "google_onboarding");
    return success(res, { status }, "Profile details saved.");
  } catch (error) { return respondError(res, error); }
}

export async function skipGoogleProfile(req, res, next) {
  try {
    const status = await consentService.updateContactDetails(actorId(req), { skip: true }, "google_onboarding");
    return success(res, { status }, "Profile setup skipped.");
  } catch (error) { next(error); }
}

export async function updateProfileDetails(req, res, next) {
  try {
    const input = profileDetailsSchema.parse(req.body);
    const status = await consentService.updateContactDetails(actorId(req), input, "profile_settings");
    return success(res, { status }, "Contact details updated.");
  } catch (error) { return respondError(res, error); }
}

export async function updateMarketingConsent(req, res, next) {
  try {
    const input = marketingConsentSchema.parse(req.body);
    const result = await consentService.updateMarketingEmailConsent(actorId(req), input.enabled);
    return success(res, result, "Email update preference saved.");
  } catch (error) { return respondError(res, error); }
}
