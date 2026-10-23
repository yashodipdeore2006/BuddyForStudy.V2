import { PlatformSetting } from "../models/PlatformSetting.js";
import { PUBLIC_SOCIAL_PLATFORMS, toPublicSocialLinks } from "../utils/publicSocialLinks.js";
import { success } from "../utils/response.js";

export async function getPublicSocialLinks(_req, res, next) {
  try {
    const keys = PUBLIC_SOCIAL_PLATFORMS.map((platform) => platform.settingKey);
    const settings = await PlatformSetting.find({ key: { $in: keys }, isPublic: true })
      .select("key value isPublic")
      .lean();
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, { links: toPublicSocialLinks(settings) });
  } catch (error) {
    next(error);
  }
}
