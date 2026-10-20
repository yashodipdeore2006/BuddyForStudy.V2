import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, BookOpen, Clock3, GraduationCap, RotateCcw } from "lucide-react";
import type { Course } from "@/types";
import { countAllLessons, getAllLessonsFlat } from "@/lib/courseUtils";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CourseActionButton from "@/components/CourseActionButton";
import { getCourseActionState, type CourseActionState } from "@/lib/intents";

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

function normalizeCourseId(value: any): string {
  const candidate = value?.course ?? value?.courseId ?? value?.course_id ?? value;
  const id = candidate && typeof candidate === "object"
    ? candidate._id ?? candidate.id ?? candidate.$oid
    : candidate;
  return id == null ? "" : String(id).toLowerCase();
}

function levelClass(level?: string): string {
  if (level === "Beginner") return "bfs-course-chip bfs-course-chip--beginner";
  if (level === "Intermediate") return "bfs-course-chip bfs-course-chip--intermediate";
  if (level === "Advanced") return "bfs-course-chip bfs-course-chip--advanced";
  return "bfs-course-chip";
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
  completedLessons: initialCompletedLessons,
  totalLessons: initialTotalLessons,
  initiallySaved = false,
  initiallyEnrolled = false,
  initiallyCompleted = false,
  onSavedChange,
}: CourseCardProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const lessonCount = courseLessonCount(course);
  const [saved, setSaved] = useState(initiallySaved);
  const [saving, setSaving] = useState(false);
  const [enrollmentState, setEnrollmentState] = useState<EnrollmentState>(
    initiallyCompleted ? "completed" : initiallyEnrolled ? "active" : "not-enrolled",
  );
  const [progress, setProgress] = useState(Math.max(0, Math.min(100, progressPercentage ?? 0)));
  const [completedLessons, setCompletedLessons] = useState(initialCompletedLessons ?? 0);
  const [totalLessons, setTotalLessons] = useState(initialTotalLessons ?? lessonCount ?? 0);
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [undoSaveValue, setUndoSaveValue] = useState<boolean | null>(null);

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
      .catch((error) => {
        if (active) setActionError(error instanceof Error ? "Saved status is temporarily unavailable." : "Saved status could not be loaded.");
      });

    apiFetch("/api/enrollments")
      .then(async (data) => {
        if (!active) return;
        const enrollment = (data.enrollments ?? []).find((item: any) => normalizeCourseId(item) === String(course.id).toLowerCase());
        if (!enrollment || !["active", "completed"].includes(String(enrollment.status).toLowerCase())) {
          setEnrollmentState("not-enrolled");
          return;
        }

        const completed = String(enrollment.status).toLowerCase() === "completed";
        setEnrollmentState(completed ? "completed" : "active");
        try {
          const response = await apiFetch("/api/progress/" + course.id);
          if (!active) return;
          const raw = response.progress ?? {};
          const rawCompleted = Array.isArray(raw.completedLessons) ? raw.completedLessons : Array.isArray(raw.completed_lessons) ? raw.completed_lessons : [];
          const completedIds = new Set(rawCompleted.map((item: any) => String(item.lessonId ?? item.lesson_id ?? "")));
          const nextLesson = getAllLessonsFlat(course.modules).find((lesson) => !completedIds.has(String(lesson.id)));
          const completedCount = Number(raw.completedCount ?? raw.completed_count ?? completedIds.size);
          const totalCount = Number(raw.totalLessons ?? raw.total_lessons ?? lessonCount ?? 0);
          const percentage = Math.max(0, Math.min(100, Number(raw.percentage ?? (totalCount ? completedCount / totalCount * 100 : 0))));
          setCompletedLessons(completedCount);
          setTotalLessons(totalCount);
          setProgress(percentage);
          setNextLessonId(nextLesson ? String(nextLesson.id) : null);
          if (completed || percentage >= 100) setEnrollmentState("completed");
        } catch (error) {
          if (active) setActionError(error instanceof Error ? "Course progress is temporarily unavailable." : "Course progress could not be loaded.");
        }
      })
      .catch((error) => {
        if (active) setActionError(error instanceof Error ? "Enrollment status is temporarily unavailable." : "Enrollment status could not be loaded.");
      });

    return () => { active = false; };
  }, [course.id, course.modules, initiallyCompleted, initiallyEnrolled, initiallySaved, lessonCount, session?.user?.id]);

  const paid = course.pricing?.mode === "paid";
  const actionState: CourseActionState = useMemo(() => getCourseActionState({
    enrolled: enrollmentState !== "not-enrolled",
    completed: enrollmentState === "completed",
    progressPercentage: progress,
    paid,
  }), [enrollmentState, paid, progress]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!session) {
      navigate("/login", { state: { from: { pathname: "/courses/" + course.id } } });
      return;
    }
    const previous = saved;
    const next = !previous;
    setSaved(next);
    setSaving(true);
    setActionError("");
    setActionNotice("");
    setUndoSaveValue(previous);
    try {
      if (next) {
        await apiFetch("/api/saved-courses", { method: "POST", body: JSON.stringify({ courseId: course.id }) });
      } else {
        await apiFetch("/api/saved-courses/" + course.id, { method: "DELETE" });
      }
      onSavedChange?.(course.id, next);
      setActionNotice(next ? "Saved for later." : "Removed from Saved.");
    } catch (error) {
      setSaved(previous);
      setUndoSaveValue(null);
      setActionError(error instanceof Error ? error.message : "Unable to update your saved courses. Check your connection and retry.");
    } finally {
      setSaving(false);
    }
  }, [course.id, navigate, onSavedChange, saved, saving, session]);

  const handleUndoSave = async () => {
    if (undoSaveValue === null || saving || !session) return;
    const target = undoSaveValue;
    setSaving(true);
    setActionError("");
    try {
      if (target) {
        await apiFetch("/api/saved-courses", { method: "POST", body: JSON.stringify({ courseId: course.id }) });
      } else {
        await apiFetch("/api/saved-courses/" + course.id, { method: "DELETE" });
      }
      setSaved(target);
      setUndoSaveValue(null);
      setActionNotice(target ? "Course restored to Saved." : "Course removed from Saved.");
      onSavedChange?.(course.id, target);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Undo failed. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (actionLoading) return;
    setActionError("");
    setActionNotice("");
    if (!session && enrollmentState === "not-enrolled") {
      navigate("/login", { state: { from: { pathname: "/courses/" + course.id } } });
      return;
    }
    if (actionState === "not-enrolled-paid") {
      navigate("/courses/" + course.id);
      return;
    }
    if (actionState === "not-enrolled-free") {
      setActionLoading(true);
      try {
        const data = await apiFetch("/api/enrollments/" + course.id, { method: "POST" });
        setEnrollmentState(String(data.enrollment?.status ?? "active").toLowerCase() === "completed" ? "completed" : "active");
        setProgress(0);
        setCompletedLessons(0);
        setActionNotice("Enrolled in " + course.title + ".");
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Enrollment failed. Check your connection and retry.");
      } finally {
        setActionLoading(false);
      }
      return;
    }
    if (actionState === "completed") {
      navigate("/courses/" + course.id);
      return;
    }
    navigate("/learn/" + course.id + (nextLessonId ? "/" + encodeURIComponent(nextLessonId) : ""));
  };

  const displayOutcome = course.description.trim();
  const compact = variant === "compact";
  const horizontal = variant === "horizontal";
  const rootClass = [
    "bfs-course-card",
    compact ? "bfs-course-card__compact" : "",
    horizontal ? "bfs-course-card__horizontal" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={rootClass} data-variant={variant}>
      <Link
        to={"/courses/" + course.id}
        className="bfs-course-card__stretch-link"
        aria-label={"Open course details for " + course.title}
        tabIndex={0}
      >
        <span className="bfs-sr-only">Open course details for {course.title}</span>
      </Link>

      <div className="bfs-course-card__media">
        {course.thumbnail ? (
          <img src={course.thumbnail} alt="" loading="lazy" onError={(event) => {
            const image = event.currentTarget;
            image.style.display = "none";
            image.parentElement?.classList.add("bfs-course-card__media--image-error");
          }} />
        ) : (
          <div className="bfs-course-card__fallback"><GraduationCap size={32} aria-hidden="true" /></div>
        )}
        <span className="bfs-sr-only">{course.level || "All levels"}</span>
        <button
          type="button"
          className="bfs-course-card__save"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label={saved ? "Saved" : "Save"}
          aria-pressed={saved}
          title={saving ? "Updating saved courses" : saved ? "Saved — remove from Saved" : "Save for later"}
        >
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        <span className={levelClass(course.level)}>{course.level || "All levels"}</span>
      </div>

      <div className="bfs-course-card__body">
        {variant === "recommended" && reason && <p className="bfs-course-card__reason">{reason}</p>}
        <div className="bfs-course-card__meta">
          {course.category && <span>{course.category}</span>}
          {paid && course.pricing && <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency: course.pricing.currency || "INR", maximumFractionDigits: 0 }).format(Number(course.pricing.saleEnabled && course.pricing.salePrice != null ? course.pricing.salePrice : course.pricing.price))}</span>}
        </div>
        <h3 className="bfs-course-card__title" title={course.title}>{course.title}</h3>
        {displayOutcome && <p className="bfs-course-card__outcome">{displayOutcome}</p>}
        <div className="bfs-course-card__meta">
          {lessonCount !== null && <span><BookOpen size={14} aria-hidden="true" /> {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}</span>}
          {course.duration && <span><Clock3 size={14} aria-hidden="true" /> {course.duration}</span>}
        </div>
        {enrollmentState !== "not-enrolled" && (
          <div className="bfs-course-card__progress">
            <div className="bfs-course-card__progress-label"><span>{enrollmentState === "completed" ? "Completed" : progress > 0 ? "In progress" : "Not started"}</span><span>{Math.round(progress)}%</span></div>
            <div className="bfs-course-card__progress-track" role="progressbar" aria-label={course.title + " progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div className="bfs-course-card__progress-fill" style={{ width: Math.round(progress) + "%" }} />
            </div>
            {totalLessons > 0 && <p className="bfs-course-card__meta">{completedLessons} of {totalLessons} lessons</p>}
          </div>
        )}
      </div>

      {actionError && <p className="bfs-course-card__error" role="alert">{actionError}</p>}
      {actionNotice && <div className="bfs-course-card__status" role="status">{actionNotice}</div>}
      {undoSaveValue !== null && actionNotice && (
        <button type="button" className="bfs-course-card__undo" onClick={() => void handleUndoSave()} disabled={saving}>Undo</button>
      )}
      <div className="bfs-course-card__action-row">
        <CourseActionButton
          state={actionState}
          onClick={() => void handlePrimaryAction()}
          loading={actionLoading}
          disabledReason={actionState === "not-enrolled-paid" ? "Open course details to review payment options" : undefined}
        />
        {actionState === "completed" && <span className="bfs-course-chip bfs-course-chip--beginner"><RotateCcw size={12} aria-hidden="true" /> Completed</span>}
      </div>
    </article>
  );
}
