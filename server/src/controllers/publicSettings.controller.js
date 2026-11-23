import { PlatformSetting } from "../models/PlatformSetting.js";
import { PUBLIC_SOCIAL_PLATFORMS, toPublicSocialLinks } from "../utils/publicSocialLinks.js";
import { success } from "../utils/response.js";
import { SiteSettings } from "../models/SiteSettings.js";
import { SITE_SETTINGS_KEY, SITE_SOCIAL_LINK_FIELDS, normalizeHttpsUrl } from "../utils/siteSettings.js";

export async function getPublicSocialLinks(_req, res, next) {
  try {
    const siteSettings = await SiteSettings.findOne({ key: SITE_SETTINGS_KEY }).select("socialLinks").lean();
    if (siteSettings) {
      const links = Object.fromEntries(SITE_SOCIAL_LINK_FIELDS.map((field) => [
        field,
        normalizeHttpsUrl(siteSettings.socialLinks?.[field] || "", 500),
      ]));
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return success(res, { links });
    }

    // Backward-compatible fallback for installations that have only the older
    // PlatformSetting social-link records and have not saved global site settings.
    const keys = PUBLIC_SOCIAL_PLATFORMS.map((platform) => platform.settingKey);
    const settings = await PlatformSetting.find({ key: { $in: keys }, isPublic: true })
      .select("key value isPublic")
      .lean();
    res.set("Cache-Control", "no-store");
    return success(res, { links: toPublicSocialLinks(settings) });
  } catch (error) {
    next(error);
  }
}
