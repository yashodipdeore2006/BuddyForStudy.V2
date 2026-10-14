const ALLOWED_ANNOUNCEMENT_CHANNELS = new Set(["in_app", "email"]);

export function parseAnnouncementChannels(value) {
  const requested = Array.isArray(value) ? value : [value || "in_app"];
  if (requested.length === 0 || requested.some((channel) => !ALLOWED_ANNOUNCEMENT_CHANNELS.has(channel))) {
    return null;
  }
  return [...new Set(requested)];
}
