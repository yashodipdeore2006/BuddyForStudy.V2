import type { CourseThumbnailProps, ThumbnailVariant } from "@/components/CourseThumbnail";

type ThumbnailRecord = Record<string, unknown>;
type ThumbnailCourse = {
  id?: string;
  title: string;
  domain?: string | null;
  category?: string | null;
  thumbnail?: unknown;
  cardMetadata?: unknown;
  tags?: unknown;
  learning_outcomes?: unknown;
  modules?: unknown;
  lessons?: unknown;
  generation?: unknown;
  level?: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): ThumbnailRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ThumbnailRecord
    : null;
}

function safeImageUrl(value: unknown): string | undefined {
  const candidate = asText(value);
  if (!candidate) return undefined;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function resolveYouTubeVideoId(resource: unknown): string {
  const record = asRecord(resource);
  if (!record) return "";
  const directId = asText(record.videoId);
  if (/^[a-zA-Z0-9_-]{11}$/.test(directId)) return directId;

  const rawUrl = asText(record.url);
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(hostname)) return "";
    const pathId = hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})(?:[/?]|$)/)?.[1];
    const candidate = String(url.searchParams.get("v") || pathId || "").trim();
    return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : "";
  } catch {
    return "";
  }
}

/** Resolve a video's original thumbnail; use YouTube's hosted artwork only when no thumbnail URL was stored. */
export function getYouTubeVideoThumbnailUrl(resource: unknown): string | undefined {
  const record = asRecord(resource);
  if (!record) return undefined;
  const providedThumbnail = safeImageUrl(record.thumbnail);
  if (providedThumbnail) return providedThumbnail;
  const videoId = resolveYouTubeVideoId(record);
  return videoId ? "https://i.ytimg.com/vi/" + encodeURIComponent(videoId) + "/hqdefault.jpg" : undefined;
}

function collectCourseVideos(course: ThumbnailCourse): ThumbnailRecord[] {
  const videos: ThumbnailRecord[] = [];
  const pushVideos = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const record = asRecord(item);
      if (record) videos.push(record);
    }
  };

  const modules = Array.isArray(course.modules) ? course.modules : [];
  for (const moduleValue of modules) {
    const module = asRecord(moduleValue);
    const lessons = Array.isArray(module?.lessons) ? module.lessons : [];
    for (const lessonValue of lessons) {
      const lesson = asRecord(lessonValue);
      const tutorial = asRecord(lesson?.tutorial);
      const project = asRecord(lesson?.project);
      pushVideos(tutorial?.videos);
      pushVideos(project?.videos);
    }
  }

  // YouTube playlist discovery returns its individual video records as lessons.
  const directLessons = Array.isArray(course.lessons) ? course.lessons : [];
  for (const lessonValue of directLessons) {
    const lesson = asRecord(lessonValue);
    if (lesson) videos.push(lesson);
  }

  const generation = asRecord(course.generation);
  const snapshot = asRecord(generation?.snapshot);
  const snapshotModules = Array.isArray(snapshot?.modules) ? snapshot.modules : [];
  for (const moduleValue of snapshotModules) {
    const module = asRecord(moduleValue);
    const resource = asRecord(module?.course);
    if (resource) videos.push(resource);
  }
  return videos;
}

function collectSkills(course: ThumbnailCourse): string[] {
  const candidates: string[] = [];
  if (Array.isArray(course.tags)) candidates.push(...course.tags.map(asText));
  if (Array.isArray(course.modules)) {
    for (const module of course.modules) {
      if (!module || typeof module !== "object") continue;
      candidates.push(asText((module as ThumbnailRecord).title));
    }
  }
  if (Array.isArray(course.learning_outcomes)) candidates.push(...course.learning_outcomes.map(asText));

  const seen = new Set<string>();
  return candidates
    .map((value) => value.replace(/\s+/g, " ").replace(/[.!?].*$/, "").trim())
    .filter((value) => value.length > 1 && value.length <= 28)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

export function getCourseThumbnailProps(course: ThumbnailCourse): CourseThumbnailProps {
  const title = asText(course.title) || "Learning path";
  const domain = asText(course.domain) || asText(course.category) || "Professional learning";
  const metadata = asRecord(course.cardMetadata);
  const videos = collectCourseVideos(course);
  const previewVideoId = asText(metadata?.previewVideoId);
  const primaryVideo = previewVideoId
    ? videos.find((video) => resolveYouTubeVideoId(video) === previewVideoId)
    : undefined;

  // The editor-selected course cover always wins over a video poster.
  const courseImage = safeImageUrl(course.thumbnail);
  const metadataPreviewImage = safeImageUrl(metadata?.previewThumbnailUrl);
  const primaryVideoImage = primaryVideo ? getYouTubeVideoThumbnailUrl(primaryVideo) : undefined;
  const previewVideoFallback = previewVideoId
    ? getYouTubeVideoThumbnailUrl({ videoId: previewVideoId })
    : undefined;
  const firstAvailableVideoImage = videos.map(getYouTubeVideoThumbnailUrl).find(Boolean);
  const imageUrl = courseImage || metadataPreviewImage || primaryVideoImage || previewVideoFallback || firstAvailableVideoImage;

  const moduleTitles = Array.isArray(course.modules)
    ? course.modules.map((module) => module && typeof module === "object" ? asText((module as ThumbnailRecord).title) : "")
    : [];
  const outcomes = Array.isArray(course.learning_outcomes) ? course.learning_outcomes.map(asText) : [];
  const context = [title, domain, asText(course.category), ...(Array.isArray(course.tags) ? course.tags.map(asText) : []), ...moduleTitles, ...outcomes]
    .join(" ")
    .toLowerCase();

  let variant: ThumbnailVariant = "kinetic-mesh";
  if (/artificial intelligence|\bai\b|machine learning|deep learning|data pipeline|system design/.test(context)) {
    variant = "node-circuit";
  } else if (/data science|analytics|product management|career roadmap/.test(context)) {
    variant = "bento-tile";
  } else if (/full.?stack|web development|cloud|database|architecture|infrastructure/.test(context)) {
    variant = "isometric-stack";
  } else if (/python|c\+\+|javascript|typescript|programming|linux|\bcli\b|backend|node\.js|java/.test(context)) {
    variant = "terminal-matrix";
  }

  let accentHex = "#4F46E5";
  if (/artificial intelligence|\bai\b|machine learning|deep learning/.test(context)) {
    accentHex = "#6D28D9";
  } else if (/data science|analytics|data pipeline|product management|career roadmap/.test(context)) {
    accentHex = "#0F766E";
  } else if (/cloud|linux|devops|infrastructure/.test(context)) {
    accentHex = "#475569";
  } else if (/full.?stack|web development|software|backend|programming|javascript|typescript|python|c\+\+|node\.js|java/.test(context)) {
    accentHex = "#4F46E5";
  }

  return {
    identity: asText(course.id) || title,
    imageUrl,
    title,
    domain,
    skills: collectSkills(course),
    level: asText(course.level) || "Beginner",
    variant,
    accentHex,
    surfaceHex: "#0F172A",
  };
}
