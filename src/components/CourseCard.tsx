import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, CheckCircle2, Code2, Palette, BriefcaseBusiness, Database, BrainCircuit, GraduationCap, Sparkles, Users, Eye, Star, Share2 } from "lucide-react";
import type { Course } from "@/types";
import { countAllLessons, getAllLessonsFlat } from "@/lib/courseUtils";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CourseActionButton from "@/components/CourseActionButton";
import { getCourseActionState, USER_INTENTS, type CourseActionState } from "@/lib/intents";
import { routes } from "@/lib/routes";
import { getCourseNavTargets } from "@/lib/courseNav";
import { getCourseCardDescription } from "@/lib/courseCardDescription";
import { shareCourseLink } from "@/lib/shareCourse";
import { useCourseState } from "@/lib/useCourseState";

export type CourseCardVariant = "catalog" | "enrolled" | "recommended" | "compact" | "horizontal";

interface CourseCardProps {
  course: Course;
  variant?: CourseCardVariant;
  reason?: string;
  progressPercentage?: number;
  completedLessons?: number;
  totalLessons?: number;
  showActions?: boolean;
  initiallySaved?: boolean;
  initiallyEnrolled?: boolean;
  initiallyCompleted?: boolean;
  onSavedChange?: (courseId: string, saved: boolean) => void;
}

type EnrollmentState = "not-enrolled" | "active" | "completed";

function formatCompactCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function normalizeCourseId(value: unknown): string {
  const record = value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
  const candidate = record?.course ?? record?.courseId ?? record?.course_id ?? value;
  const candidateRecord = candidate !== null && typeof candidate === "object"
    ? candidate as Record<string, unknown>
    : undefined;
  const id = candidateRecord?._id ?? candidateRecord?.id ?? candidateRecord?.$oid ?? candidate;
  return id == null ? "" : String(id).toLowerCase();
}

function levelClass(level?: string): string {
  if (level === "Beginner") return "bfs-course-chip bfs-course-chip--beginner bfs-course-card__level";
  if (level === "Intermediate") return "bfs-course-chip bfs-course-chip--intermediate bfs-course-card__level";
  if (level === "Advanced") return "bfs-course-chip bfs-course-chip--advanced bfs-course-card__level";
  return "bfs-course-chip bfs-course-card__level";
}

function courseLessonCount(course: Course): number | null {
  if (Array.isArray(course.modules) && course.modules.length > 0) return countAllLessons(course.modules);
  return Number.isFinite(course.lesson_count) ? Number(course.lesson_count) : null;
}

export default function CourseCard({
  course,
  variant = "catalog",
  reason,
  progressPercentage,
  initiallySaved = false,
  initiallyEnrolled = false,
  initiallyCompleted = false,
  onSavedChange,
}: CourseCardProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const lessonCount = courseLessonCount(course);
  const cardMetadata = course.cardMetadata;
  const videoCount = Number.isFinite(cardMetadata?.videoCount) ? Number(cardMetadata?.videoCount) : 0;
  const creatorName = typeof cardMetadata?.creatorName === "string" ? String(cardMetadata?.creatorName).trim() : "";
  const qualityScore = Number.isFinite(cardMetadata?.qualityScore) ? Number(cardMetadata?.qualityScore) : null;
  const viewCount = Number.isFinite(cardMetadata?.viewCount) ? Number(cardMetadata?.viewCount) : 0;
  const learnerCount = course.enrollment_count ?? course.enrollmentCount;
  const enrolledLearners = Number.isFinite(learnerCount) ? Number(learnerCount) : 0;
  const typeTag = cardMetadata?.typeTag || (videoCount === 1 ? "Single video" : videoCount > 1 ? "Playlist" : course.generation?.mode === "ai" ? "AI roadmap" : "Course");
  const isFree = course.pricing?.mode !== "paid";
  const [saved, setSaved] = useState(initiallySaved);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrollmentState, setEnrollmentState] = useState<EnrollmentState>(
    initiallyCompleted ? "completed" : initiallyEnrolled ? "active" : "not-enrolled",
  );
  const [progress, setProgress] = useState(Math.max(0, Math.min(100, progressPercentage ?? 0)));
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [undoSavedTo, setUndoSavedTo] = useState<boolean | null>(null);
  const [courseStateRetry, setCourseStateRetry] = useState(0);

  useEffect(() => {
    if (undoSavedTo === null) return;
    const timeout = window.setTimeout(() => {
      setUndoSavedTo(null);
      setActionNotice("");
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [undoSavedTo]);

  const courseState = useCourseState(String(course.id), course, Boolean(session?.user?.id), courseStateRetry);

  useEffect(() => {
    let active = true;
    setSaved(initiallySaved);
    if (!session?.user?.id) {
      setEnrollmentState(initiallyCompleted ? "completed" : initiallyEnrolled ? "active" : "not-enrolled");
      return () => { active = false; };
    }
    apiFetch("/api/saved-courses")
      .then((data) => {
        if (!active) return;
        const ids = new Set<string>((data.savedCourses ?? []).map(normalizeCourseId).filter(Boolean));
        setSaved(ids.has(String(course.id).toLowerCase()));
      })
      .catch(() => {
        if (active) setActionError("Saved status is temporarily unavailable.");
      });
    return () => { active = false; };
  }, [course.id, initiallyCompleted, initiallyEnrolled, initiallySaved, session?.user?.id]);

  useEffect(() => {
    if (courseState.loading) return;
    setEnrollmentState(courseState.isCompleted ? "completed" : courseState.isEnrolled ? "active" : "not-enrolled");
    setProgress(courseState.progressPct);
    setNextLessonId(courseState.nextLessonId);
    if (courseState.error) setActionError(courseState.error);
  }, [courseState.loading, courseState.isCompleted, courseState.isEnrolled, courseState.progressPct, courseState.nextLessonId, courseState.error, lessonCount]);

  const paid = course.pricing?.mode === "paid";
  const actionState: CourseActionState = useMemo(() => getCourseActionState({
    enrolled: enrollmentState !== "not-enrolled",
    completed: enrollmentState === "completed",
    progressPercentage: progress,
    paid,
  }), [enrollmentState, paid, progress]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setUndoSavedTo(null);
    if (!session) {
      navigate(routes.login(), { state: { from: { pathname: routes.course(course.id) } } });
      return;
    }
    const previous = saved;
    const next = !previous;
    setSaved(next);
    setSaving(true);
    setActionError("");
    setActionNotice("");
    try {
      if (next) {
        await apiFetch("/api/saved-courses", { method: "POST", body: JSON.stringify({ courseId: course.id }) });
      } else {
        await apiFetch("/api/saved-courses/" + course.id, { method: "DELETE" });
      }
      onSavedChange?.(course.id, next);
      setUndoSavedTo(previous);
      setActionNotice(next ? "Saved for later." : "Removed from Saved.");
    } catch (error) {
      setSaved(previous);
      setActionError(error instanceof Error ? error.message : "Unable to update your saved courses. Check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }, [course.id, navigate, onSavedChange, saved, saving, session]);

  const handleShare = useCallback(async () => {
    const result = await shareCourseLink({ courseId: String(course.id), title: course.title, text: "Explore " + course.title + " on BuddyForStudy" });
    setShareNotice(result === "shared" ? "Course shared." : result === "copied" ? "Course link copied." : "Unable to share this course.");
    if (result !== "failed") window.setTimeout(() => setShareNotice(""), 2500);
  }, [course.id, course.title]);

  const handleUndoSave = useCallback(async () => {
    if (undoSavedTo === null || saving || !session) return;
    const current = saved;
    const target = undoSavedTo;
    setSaved(target);
    setSaving(true);
    setActionError("");
    setActionNotice("");
    try {
      if (target) {
        await apiFetch("/api/saved-courses", { method: "POST", body: JSON.stringify({ courseId: course.id }) });
      } else {
        await apiFetch("/api/saved-courses/" + course.id, { method: "DELETE" });
      }
      onSavedChange?.(course.id, target);
      setUndoSavedTo(null);
      setActionNotice(target ? "Course restored to Saved." : "Removed from Saved.");
    } catch (error) {
      setSaved(current);
      setActionError(error instanceof Error ? error.message : "Couldn't undo that change. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [course.id, onSavedChange, saved, saving, session, undoSavedTo]);

  const handlePrimaryAction = async () => {
    if (actionLoading || courseState.loading || courseState.error) return;
    setUndoSavedTo(null);
    setActionError("");
    setActionNotice("");
    if (!session && enrollmentState === "not-enrolled") {
      navigate(routes.login(), { state: { from: { pathname: routes.course(course.id) } } });
      return;
    }
    if (actionState === "not-enrolled-paid") {
      navigate(routes.course(course.id));
      return;
    }
    if (actionState === "not-enrolled-free") {
      setActionLoading(true);
      try {
        const data = await apiFetch("/api/enrollments/" + course.id, { method: "POST" });
        setEnrollmentState(String(data.enrollment?.status ?? "active").toLowerCase() === "completed" ? "completed" : "active");
        setProgress(0);
        setActionNotice("Enrolled in " + course.title + ".");
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Enrollment failed. Check your connection and retry.");
      } finally {
        setActionLoading(false);
      }
      return;
    }
    if (actionState === "completed") {
      navigate(routes.learn(course.id));
      return;
    }
    navigate(routes.learn(course.id, nextLessonId));
  };

  const displayOutcome = getCourseCardDescription(course);
  const coverCategory = (course.category || "").toLowerCase();
  const coverPalette = /data|analytics|sql|database/.test(coverCategory) ? "data"
    : /design|ui|ux|art/.test(coverCategory) ? "design"
      : /business|finance|marketing/.test(coverCategory) ? "business"
        : /ai|machine|python|program/.test(coverCategory) ? "technology"
          : "learning";
  const coverWords = course.title.trim().split(/\s+/).slice(0, 2).join(" ") || "Keep learning";
  const displayCategory = /^ai\s+course\s+search$/i.test(course.category || "")
    ? "AI and machine learning"
    : course.category;
  const CoverIcon = /data|analytics|sql|database/.test(coverCategory) ? Database
    : /design|ui|ux|art/.test(coverCategory) ? Palette
      : /business|finance|marketing/.test(coverCategory) ? BriefcaseBusiness
        : /ai|machine|python/.test(coverCategory) ? BrainCircuit
          : /program|software|web|code/.test(coverCategory) ? Code2 : GraduationCap;
  const compact = variant === "compact";
  const horizontal = variant === "horizontal";
  const navTargets = getCourseNavTargets({
    courseId: String(course.id),
    isEnrolled: enrollmentState !== "not-enrolled",
    isCompleted: enrollmentState === "completed",
    isPaid: paid,
    progressPct: progress,
    nextLessonId,
    hasRoadmap: getAllLessonsFlat(course.modules).length > 0,
    hasPreview: getAllLessonsFlat(course.modules).some((lesson: { isPreview?: boolean; is_preview?: boolean }) => lesson.isPreview === true || lesson.is_preview === true),
    isPublished: course.is_published !== false,
  });
  const rootClass = [
    "bfs-course-card",
    compact ? "bfs-course-card__compact" : "",
    horizontal ? "bfs-course-card__horizontal" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={rootClass} data-variant={variant}>
      <Link
        to={navTargets.cardHref}
        className="bfs-course-card__stretch-link"
        aria-label={"Open course details for " + course.title}
        tabIndex={0}
      >
        <span className="bfs-sr-only">{enrollmentState === "not-enrolled" ? "Open course details for " : "Continue learning "}{course.title}</span>
      </Link>

      <div className={"bfs-course-card__media" + (course.generation?.mode === "ai" ? " bfs-course-card__media--generated" : "")}>
        <Link to={routes.course(course.id)} className="bfs-course-card__media-link" aria-label={"View course details for " + course.title} tabIndex={-1}>
        {course.generation?.mode !== "ai" && course.thumbnail && !thumbnailFailed ? (
          <img src={course.thumbnail} alt="" loading="lazy" onError={() => setThumbnailFailed(true)} />
        ) : (
          <div className={"bfs-course-card__fallback bfs-course-card__fallback--" + coverPalette} aria-label={course.title}><CoverIcon className="bfs-course-card__fallback-icon" size={40} aria-hidden="true" /></div>
        )}
        </Link>
        {course.level && <span className={levelClass(course.level)}>{course.level}</span>}
        <button
          type="button"
          className="bfs-course-card__save"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label={saved ? USER_INTENTS.saved.ariaLabel : USER_INTENTS.save.ariaLabel}
          aria-pressed={saved}
          title={saving ? "Updating saved courses" : saved ? USER_INTENTS.saved.label : USER_INTENTS.save.label}
        >
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void handleShare()} className="bfs-course-card__media-share" aria-label={"Share " + course.title} title="Share course">
          <Share2 size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="bfs-course-card__body">
        <div className="bfs-course-card__type-meta">
          <span className="bfs-course-chip">{typeTag}</span>
          <span>{course.duration || "Self-paced"}</span>
          {videoCount > 0
            ? <span>{videoCount} {videoCount === 1 ? "video" : "videos"}</span>
            : lessonCount !== null && lessonCount > 0
              ? <span>{lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}</span>
              : null}
        </div>
        <h3 className="bfs-course-card__title" title={course.title}><Link to={routes.course(course.id)} className="bfs-course-card__detail-link">{course.title}</Link></h3>
        {creatorName && <p className="bfs-course-card__creator" title={creatorName}>{creatorName}</p>}
        {variant === "recommended" && reason && !/explore youtube discovery|youtube discovery|ai-selected|ordered after prerequisites/i.test(reason)
          && <p className="bfs-course-card__reason" title={reason}><Sparkles size={14} aria-hidden="true" /><span><strong>Why picked:</strong> {reason}{course.level ? " · " + course.level + "-friendly" : ""}</span></p>}
        {displayOutcome && <Link to={routes.course(course.id)} className="bfs-course-card__outcome bfs-course-card__detail-link" title={displayOutcome} aria-label={"View course details and learning outcomes for " + course.title}>{displayOutcome}</Link>}
        <Link
          to={routes.course(course.id) + "?tab=reviews#reviews"}
          className="bfs-course-card__rating bfs-course-card__rating-link"
          aria-label={Number(course.ratingCount) > 0 && Number(course.ratingAverage) > 0
            ? "View course reviews: " + Number(course.ratingAverage).toFixed(1) + " out of 5 from " + course.ratingCount + " ratings"
            : "View course reviews. No ratings yet."}
          title="View reviews and ratings"
        >
          <Star size={14} fill={Number(course.ratingCount) > 0 ? "currentColor" : "none"} aria-hidden="true" />
          {Number(course.ratingCount) > 0 && Number(course.ratingAverage) > 0
            ? <>
                <strong>{Number(course.ratingAverage).toFixed(1)}</strong>
                <span>({new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(course.ratingCount))} {Number(course.ratingCount) === 1 ? "rating" : "ratings"}) · View reviews</span>
              </>
            : <span>No ratings yet · Be the first to review</span>}
        </Link>
        {(qualityScore !== null || viewCount > 0 || enrolledLearners > 0) && <div className="bfs-course-card__social-proof" aria-label="Course quality and learner activity">
          {qualityScore !== null && <span className="bfs-course-card__quality" title="BuddyForStudy curation score"><Sparkles size={14} aria-hidden="true" /> {Math.round(qualityScore)}/100 quality</span>}
          {viewCount > 0 && <span title="Combined views for selected YouTube videos"><Eye size={14} aria-hidden="true" /> {formatCompactCount(viewCount)} views</span>}
          {enrolledLearners > 0 && <span title="BuddyForStudy learners enrolled"><Users size={14} aria-hidden="true" /> {formatCompactCount(enrolledLearners)} learners</span>}
        </div>}

      </div>

      {actionError && <div className="bfs-course-card__error" role="alert"><span>{actionError}</span>{courseState.error && <button type="button" className="bfs-course-card__undo" onClick={() => { setActionError(""); setCourseStateRetry((value) => value + 1); }} disabled={courseState.loading}>{USER_INTENTS.retry.label}</button>}</div>}
      {actionNotice && <div className="bfs-course-card__status" role="status">{actionNotice}{undoSavedTo !== null && <button type="button" className="bfs-course-card__undo" onClick={() => void handleUndoSave()} disabled={saving}>{USER_INTENTS.undo.label}</button>}</div>}
      {shareNotice && <div className="bfs-course-card__status" role="status">{shareNotice}</div>}
      <div className="bfs-course-card__action-row">
        <span className={"bfs-course-card__price" + (isFree ? " bfs-course-card__price--free" : "")}>
          {isFree ? "Free" : course.pricing ? new Intl.NumberFormat("en-IN", { style: "currency", currency: course.pricing.currency || "INR", maximumFractionDigits: 0 }).format(Number(course.pricing.saleEnabled && course.pricing.salePrice != null ? course.pricing.salePrice : course.pricing.price)) : ""}
          {!isFree && course.pricing?.saleEnabled && course.pricing.compareAtPrice && course.pricing.compareAtPrice > Number(course.pricing.salePrice ?? course.pricing.price) && <del>{new Intl.NumberFormat("en-IN", { style: "currency", currency: course.pricing.currency || "INR", maximumFractionDigits: 0 }).format(course.pricing.compareAtPrice)}</del>}
        </span>
        <CourseActionButton
          state={actionState}
          onClick={() => void handlePrimaryAction()}
          loading={actionLoading}
          disabled={courseState.loading || Boolean(courseState.error)}
          disabledReason={courseState.loading
            ? "Checking enrollment and progress"
            : courseState.error
              ? "Course status is unavailable. Retry when connected."
              : actionState === "not-enrolled-paid"
                ? "Open course details to review payment options"
                : undefined}
          className="bfs-course-action--outline"
        />
        {actionState === "completed" && <span className="bfs-course-chip bfs-course-chip--completed"><CheckCircle2 size={12} aria-hidden="true" /> Completed</span>}

      </div>
    </article>
  );
}


/**
 * Loading placeholder for all CourseCard variants.
 * Usage: {loading ? <CourseCardSkeleton variant="catalog" /> : <CourseCard course={course} />}
 */
export function CourseCardSkeleton({ variant = "catalog" }: { variant?: CourseCardVariant }) {
  return (
    <article className={"bfs-course-card bfs-course-card--skeleton" + (variant === "horizontal" ? " bfs-course-card__horizontal" : variant === "compact" ? " bfs-course-card__compact" : "")} data-variant={variant} aria-hidden="true">
      <div className="bfs-course-card__skeleton-cover" />
      <div className="bfs-course-card__skeleton-body">
        <span className="bfs-course-card__skeleton-line bfs-course-card__skeleton-line--short" />
        <span className="bfs-course-card__skeleton-line bfs-course-card__skeleton-line--title" />
        <span className="bfs-course-card__skeleton-line" />
        <span className="bfs-course-card__skeleton-line bfs-course-card__skeleton-line--meta" />
        <span className="bfs-course-card__skeleton-button" />
      </div>
    </article>
  );
}

/**
 * Usage example (inside a page wrapped by the app's Router and AuthProvider):
 * <CourseCard
 *   course={course}
 *   variant="recommended"
 *   reason="Because you're learning JavaScript"
 *   initiallySaved={savedCourseIds.has(course.id)}
 *   onSavedChange={(courseId, saved) => updateSavedCourseIds(courseId, saved)}
 * />
 */
