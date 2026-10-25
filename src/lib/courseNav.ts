import { routes } from "./routes";

export type CourseNavInput = {
  courseId: string;
  isEnrolled: boolean;
  isCompleted: boolean;
  isPaid: boolean;
  priceLabel?: string;
  progressPct: number;
  nextLessonId?: string | null;
  hasRoadmap: boolean;
  hasPreview: boolean;
  isPublished: boolean;
};

export type NavAction =
  | { kind: "link"; label: string; href: string; icon: string }
  | { kind: "action"; label: string; action: "enroll" | "unenroll" | "save"; icon: string };

export type CourseNavTargets = {
  cardHref: string;
  status: "not-enrolled" | "not-started" | "in-progress" | "completed";
  primary: NavAction;
  overflow: NavAction[];
};

function normalizeOptionalLessonId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "undefined" || normalized.toLowerCase() === "null") return null;
  return normalized;
}

export function getCourseNavTargets(input: CourseNavInput): CourseNavTargets {
  const courseId = String(input.courseId ?? "").trim();
  if (!courseId || courseId === "undefined" || courseId === "null") {
    throw new Error("getCourseNavTargets requires a valid courseId.");
  }
  const nextLessonId = normalizeOptionalLessonId(input.nextLessonId);
  const progressPct = Number.isFinite(input.progressPct)
    ? Math.min(100, Math.max(0, input.progressPct))
    : 0;

  if (!input.isEnrolled) {
    const href = routes.course(courseId);
    return {
      cardHref: href,
      status: "not-enrolled",
      primary: input.isPaid
        ? { kind: "link", label: "Enroll", href, icon: "Plus" }
        : { kind: "action", label: "Enroll free", action: "enroll", icon: "Plus" },
      overflow: [],
    };
  }

  const isCompleted = input.isCompleted || progressPct >= 100;
  const status: CourseNavTargets["status"] = isCompleted
    ? "completed"
    : progressPct > 0
      ? "in-progress"
      : "not-started";
  const href = routes.learn(courseId, isCompleted ? null : nextLessonId);
  const label = status === "completed" ? "Review" : status === "in-progress" ? "Continue" : "Start";
  const icon = status === "completed" ? "RotateCcw" : "Play";
  const overflow: NavAction[] = [];
  if (input.hasRoadmap) overflow.push({ kind: "link", label: "Roadmap", href: routes.roadmap(courseId), icon: "Map" });
  overflow.push({ kind: "link", label: "Course info", href: routes.course(courseId), icon: "Info" });
  overflow.push({ kind: "action", label: "Unenroll", action: "unenroll", icon: "Trash2" });

  return { cardHref: href, status, primary: { kind: "link", label, href, icon }, overflow };
}
