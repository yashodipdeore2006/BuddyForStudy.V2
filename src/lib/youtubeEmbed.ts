/**
 * Builds the most minimal privacy-enhanced YouTube embed URL we can request.
 *
 * Important: YouTube ignores/deprecated several old branding parameters and
 * still controls its title/channel overlay, logo, and end-screen suggestions.
 * Those elements cannot reliably be removed from a standard YouTube iframe.
 */
export function getYouTubeEmbedUrl(videoId: string, options: { autoplay?: boolean } = {}) {
  const id = String(videoId || "").trim();
  if (!id) return "";

  const params = new URLSearchParams({
    autoplay: options.autoplay ? "1" : "0",
    controls: "1",
    disablekb: "0",
    fs: "1",
    enablejsapi: "1",
    iv_load_policy: "3",
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
    showinfo: "0",
  });

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
}
