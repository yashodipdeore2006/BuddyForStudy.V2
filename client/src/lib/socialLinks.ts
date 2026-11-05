export const PUBLIC_SOCIAL_PLATFORMS = [
  { id: "instagram", settingKey: "social_instagram_url", label: "Instagram", envUrl: import.meta.env.VITE_PUBLIC_SOCIAL_INSTAGRAM || "" },
  { id: "linkedin", settingKey: "social_linkedin_url", label: "LinkedIn", envUrl: import.meta.env.VITE_PUBLIC_SOCIAL_LINKEDIN || "" },
  { id: "youtube", settingKey: "social_youtube_url", label: "YouTube", envUrl: import.meta.env.VITE_PUBLIC_SOCIAL_YOUTUBE || "" },
  { id: "x", settingKey: "social_x_url", label: "X", envUrl: import.meta.env.VITE_PUBLIC_SOCIAL_X || "" },
  { id: "facebook", settingKey: "social_facebook_url", label: "Facebook", envUrl: import.meta.env.VITE_PUBLIC_SOCIAL_FACEBOOK || "" },
  { id: "github", settingKey: "social_github_url", label: "GitHub", envUrl: import.meta.env.VITE_PUBLIC_SOCIAL_GITHUB || "" }
] as const;

export type SocialPlatformId = (typeof PUBLIC_SOCIAL_PLATFORMS)[number]["id"];
export type PublicSocialLinks = Partial<Record<SocialPlatformId, string>>;

export const DEFAULT_PUBLIC_SOCIAL_LINKS = Object.fromEntries(
  PUBLIC_SOCIAL_PLATFORMS.map((platform) => [platform.id, platform.envUrl])
) as Record<SocialPlatformId, string>;

export function normalizeHttpsSocialUrl(value: string): string | null {
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
