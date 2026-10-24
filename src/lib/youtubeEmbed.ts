/**
 * Builds the standard privacy-enhanced YouTube embed URL used by every
 * in-platform player. YouTube controls which branding and end-screen content
 * can be hidden; rel=0 limits related videos to the same channel, but cannot
 * remove all YouTube UI or end-screen recommendations.
 */
export function getYouTubeEmbedUrl(videoId: string, options: { autoplay?: boolean } = {}) {
  const id = String(videoId || "").trim();
  if (!id) return "";

  const params = new URLSearchParams({
    autoplay: options.autoplay ? "1" : "0",
    controls: "1",
    disablekb: "0",
    fs: "1",
    iv_load_policy: "3",
    rel: "0",
    playsinline: "1",
  });

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
}
