import type { CourseThumbnailProps, ThumbnailVariant } from "@/components/CourseThumbnail";

type ThumbnailCourse = {
  id?: string;
  title: string;
  domain?: string | null;
  category?: string | null;
  tags?: unknown;
  learning_outcomes?: unknown;
  modules?: unknown;
  level?: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function collectSkills(course: ThumbnailCourse): string[] {
  const candidates: string[] = [];
  if (Array.isArray(course.tags)) candidates.push(...course.tags.map(asText));
  if (Array.isArray(course.modules)) {
    for (const module of course.modules) {
      if (!module || typeof module !== "object") continue;
      candidates.push(asText((module as Record<string, unknown>).title));
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
  const context = [title, domain, asText(course.category), ...(Array.isArray(course.tags) ? course.tags.map(asText) : [])]
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
    title,
    domain,
    skills: collectSkills(course),
    level: asText(course.level) || "Beginner",
    variant,
    accentHex,
    surfaceHex: "#0F172A",
  };
}
