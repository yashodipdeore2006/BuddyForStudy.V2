import { z } from "zod";
import { SiteSettings } from "../models/SiteSettings.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { PUBLIC_SOCIAL_PLATFORMS, toPublicSocialLinks } from "../utils/publicSocialLinks.js";
import {
  DEFAULT_SITE_SETTINGS,
  SITE_FOOTER_GROUPS,
  SITE_SETTINGS_KEY,
  SITE_SOCIAL_LINK_FIELDS,
  normalizeHttpsUrl,
  normalizeSiteHref,
  normalizeSiteLogoUrl,
  toPublicSiteSettings,
} from "../utils/siteSettings.js";

const footerLinkSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(50),
  href: z.string().trim().min(1).max(500),
  group: z.enum(SITE_FOOTER_GROUPS),
}).strict();

const socialLinksSchema = z.object(Object.fromEntries(SITE_SOCIAL_LINK_FIELDS.map((field) => [
  field, z.string().trim().max(500),
]))).strict();

const siteSettingsSchema = z.object({
  brand: z.object({
    siteName: z.string().trim().min(1).max(80),
    tagline: z.string().trim().max(160),
    description: z.string().trim().max(320),
    logoUrl: z.string().trim().max(1000),
  }).strict(),
  contact: z.object({
    supportEmail: z.union([z.string().trim().email().max(254), z.literal("")]),
    supportPhone: z.string().trim().max(40).regex(/^[+0-9().\s-]*$/),
    officeAddress: z.string().trim().max(240),
    businessHours: z.string().trim().max(160),
  }).strict(),
  socialLinks: socialLinksSchema,
  footerLinks: z.array(footerLinkSchema).max(30),
}).strict();

function actorId(req) {
  return req.user?.userId || req.user?.user?._id || null;
}

function validatePublicUrls(value) {
  const logoUrl = value.brand.logoUrl ? normalizeSiteLogoUrl(value.brand.logoUrl) : "";
  if (value.brand.logoUrl && !logoUrl) {
    return { valid: false, message: "Logo URL must be a same-site path or a valid HTTPS URL." };
  }

  const socialLinks = {};
  for (const field of SITE_SOCIAL_LINK_FIELDS) {
    const raw = value.socialLinks[field];
    const normalized = normalizeHttpsUrl(raw, 500);
    if (raw && !normalized) {
      return { valid: false, message: "Social links must use valid HTTPS URLs, or be left empty." };
    }
    socialLinks[field] = normalized;
  }

  const footerLinks = [];
  const seenIds = new Set();
  for (const link of value.footerLinks) {
    if (seenIds.has(link.id)) {
      return { valid: false, message: "Footer link IDs must be unique." };
    }
    seenIds.add(link.id);
    const href = normalizeSiteHref(link.href, 500);
    if (!href) {
      return { valid: false, message: "Footer links must use internal site paths or valid HTTPS URLs." };
    }
    footerLinks.push({ ...link, href });
  }

  return {
    valid: true,
    value: {
      ...value,
      brand: { ...value.brand, logoUrl: logoUrl || DEFAULT_SITE_SETTINGS.brand.logoUrl },
      contact: {
        ...value.contact,
        supportEmail: value.contact.supportEmail.trim().toLowerCase(),
      },
      socialLinks,
      footerLinks,
    },
  };
}

export async function getPublicSiteSettings(_req, res, next) {
  try {
    const record = await SiteSettings.findOne({ key: SITE_SETTINGS_KEY }).lean();
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, { settings: toPublicSiteSettings(record || DEFAULT_SITE_SETTINGS) });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminSiteSettings(_req, res, next) {
  try {
    const record = await SiteSettings.findOne({ key: SITE_SETTINGS_KEY }).lean();
    const settings = toPublicSiteSettings(record || DEFAULT_SITE_SETTINGS);
    if (!record) {
      const legacyLinks = await PlatformSetting.find({
        key: { $in: PUBLIC_SOCIAL_PLATFORMS.map((platform) => platform.settingKey) },
        isPublic: true,
      }).select("key value isPublic").lean();
      settings.socialLinks = { ...settings.socialLinks, ...toPublicSocialLinks(legacyLinks) };
    }
    return success(res, {
      settings,
      updatedAt: record?.updatedAt || null,
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateAdminSiteSettings(req, res, next) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) {
      return failure(res, "A reason between 10 and 500 characters is required to update site settings.", 400);
    }

    const parsed = siteSettingsSchema.safeParse(req.body?.settings);
    if (!parsed.success) {
      return failure(res, "Site settings contain invalid fields.", 400, parsed.error.flatten().fieldErrors);
    }

    const validated = validatePublicUrls(parsed.data);
    if (!validated.valid) return failure(res, validated.message, 400);

    const current = await SiteSettings.findOne({ key: SITE_SETTINGS_KEY }).lean();
    const before = toPublicSiteSettings(current || DEFAULT_SITE_SETTINGS);
    const setting = await SiteSettings.findOneAndUpdate(
      { key: SITE_SETTINGS_KEY },
      {
        $set: {
          ...validated.value,
          updatedBy: actorId(req),
        },
        $setOnInsert: { key: SITE_SETTINGS_KEY },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );

    // Keep the legacy Social links panel in Platform settings synchronized
    // while existing administrators transition to the global site settings page.
    const legacySocialSync = await Promise.allSettled(PUBLIC_SOCIAL_PLATFORMS.map((platform) =>
      PlatformSetting.findOneAndUpdate(
        { key: platform.settingKey },
        {
          $set: {
            value: validated.value.socialLinks[platform.id],
            description: "Official BuddyForStudy " + platform.label + " profile URL. An empty value hides the link.",
            isPublic: true,
            updatedBy: actorId(req),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    ));
    const legacySocialSyncFailures = legacySocialSync.flatMap((result, index) =>
      result.status === "rejected" ? [PUBLIC_SOCIAL_PLATFORMS[index].id] : []
    );
    const legacySocialSyncPending = legacySocialSyncFailures.length > 0;
    if (legacySocialSyncPending) {
      console.error("[site-settings] legacy social-link mirror sync failed", {
        platforms: legacySocialSyncFailures,
      });
    }

    const after = toPublicSiteSettings(setting);
    const auditResult = await recordAuditEvent({
      actor: actorId(req),
      action: "site_settings.updated",
      targetType: "SiteSettings",
      targetId: String(setting._id),
      reason,
      before,
      after,
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500),
    });

    return success(res, {
      settings: after,
      updatedAt: setting.updatedAt,
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued,
      legacySocialSyncPending,
    }, legacySocialSyncPending
      ? "Site settings saved, but one or more legacy social-link mirrors need a retry."
      : auditResult.recorded
        ? "Site settings saved."
        : auditResult.queued
          ? "Site settings saved; the audit event is queued for retry."
          : "Site settings saved, but the audit event could not be recorded or queued. Notify a Super Admin.");
  } catch (error) {
    return next(error);
  }
}
