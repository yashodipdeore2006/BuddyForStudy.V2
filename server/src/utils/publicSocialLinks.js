export const PUBLIC_SOCIAL_PLATFORMS = Object.freeze([
  { id: "instagram", settingKey: "social_instagram_url", label: "Instagram" },
  { id: "linkedin", settingKey: "social_linkedin_url", label: "LinkedIn" },
  { id: "youtube", settingKey: "social_youtube_url", label: "YouTube" },
  { id: "x", settingKey: "social_x_url", label: "X" },
  { id: "facebook", settingKey: "social_facebook_url", label: "Facebook" },
  { id: "github", settingKey: "social_github_url", label: "GitHub" }
]);

const socialSettingKeys = new Set(PUBLIC_SOCIAL_PLATFORMS.map((platform) => platform.settingKey));

export function isPublicSocialSettingKey(key) {
  return socialSettingKeys.has(String(key || ""));
}

// Empty values intentionally disable a platform link. Any configured link must
// use HTTPS and must not contain embedded credentials.
export function normalizePublicSocialUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 500) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateSocialSettingValue(key, value) {
  if (!isPublicSocialSettingKey(key)) return { isSocialSetting: false, valid: true, value };
  const normalized = normalizePublicSocialUrl(value);
  if (normalized === null) {
    return {
      isSocialSetting: true,
      valid: false,
      message: "Social media links must be valid HTTPS URLs, or left empty to hide the link."
    };
  }
  return { isSocialSetting: true, valid: true, value: normalized };
}

export function toPublicSocialLinks(settings) {
  const links = {};
  const byKey = new Map((Array.isArray(settings) ? settings : []).map((setting) => [setting.key, setting]));

  for (const platform of PUBLIC_SOCIAL_PLATFORMS) {
    const setting = byKey.get(platform.settingKey);
    if (!setting || setting.isPublic !== true) continue;
    // Only return known social-link fields. Bad persisted values fail closed.
    links[platform.id] = normalizePublicSocialUrl(setting.value) ?? "";
  }

  return links;
}
