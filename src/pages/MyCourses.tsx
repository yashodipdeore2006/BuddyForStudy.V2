import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bookmark, CheckCircle2, Clock3, GraduationCap, Info, Map,
  MoreHorizontal, Play, RotateCcw, Search, Trash2, X,
} from "lucide-react";
import type { Course, Enrollment } from "@/types";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";
import { getAllLessonsFlat } from "@/lib/courseUtils";
import { useCourseState } from "@/lib/useCourseState";

type LearningTab = "in-progress" | "not-started" | "completed";
type SortMode = "recent" | "progress" | "title";
type CourseStatus = { progressPct: number; completedLessons: number; totalLessons: number; nextLessonId: string | null; status: LearningTab; loading: boolean };

function mapCourse(raw: any): Course {
  return {
    id: String(raw?._id ?? raw?.id ?? ""),
    title: String(raw?.title ?? "Untitled course"),
    slug: String(raw?.slug ?? ""),
    description: String(raw?.description ?? ""),
    category: String(raw?.category ?? ""),
    level: raw?.level ?? "Beginner",
    duration: String(raw?.duration ?? ""),
    thumbnail: raw?.thumbnail ?? null,
    learning_outcomes: raw?.learningOutcomes ?? raw?.learning_outcomes ?? [],
    modules: Array.isArray(raw?.modules) ? raw.modules : [],
    is_published: raw?.isPublished ?? raw?.is_published ?? true,
    pricing: raw?.pricing,
    created_by: raw?.createdBy ?? raw?.created_by ?? null,
    created_at: raw?.createdAt ?? raw?.created_at ?? "",
    updated_at: raw?.updatedAt ?? raw?.updated_at ?? "",
    lesson_count: raw?.lessonCount ?? raw?.lesson_count,
  };
}

function mapEnrollment(raw: any): Enrollment & { course: Course } {
  const course = mapCourse(raw?.course ?? {});
  return {
    id: String(raw?._id ?? raw?.id ?? ""),
    user_id: String(raw?.user?._id ?? raw?.user ?? raw?.user_id ?? ""),
    course_id: String(raw?.course?._id ?? raw?.courseId ?? raw?.course_id ?? course.id),
    status: String(raw?.status ?? "active").toLowerCase() as Enrollment["status"],
    enrolled_at: raw?.enrolledAt ?? raw?.enrolled_at ?? "",
    created_at: raw?.createdAt ?? raw?.created_at ?? "",
    updated_at: raw?.updatedAt ?? raw?.updated_at ?? "",
    course,
  };
}

function getInitialStatus(enrollment: Enrollment): LearningTab {
  return enrollment.status === "completed" ? "completed" : "in-progress";
}

function CourseLearningCard({
  enrollment,
  saved,
  onSavedChange,
  onUnenroll,
  onStateChange,
}: {
  enrollment: Enrollment & { course: Course };
  saved: boolean;
  onSavedChange: (courseId: string, nextSaved: boolean) => void;
  onUnenroll: (enrollment: Enrollment & { course: Course }) => void;
  onStateChange: (courseId: string, status: CourseStatus) => void;
}) {
  const course = enrollment.course;
  const state = useCourseState(course.id, course, true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const lessons = getAllLessonsFlat(course.modules);
  const hasRoadmap = state.hasRoadmap || lessons.length > 0;
  const status: LearningTab = enrollment.status === "completed" || state.isCompleted
    ? "completed"
    : state.progressPct > 0 ? "in-progress" : "not-started";
  const primaryLabel = status === "completed" ? "Review" : status === "in-progress" ? "Continue" : "Start";
  const PrimaryIcon = status === "completed" ? RotateCcw : Play;

  useEffect(() => {
    onStateChange(course.id, {
      progressPct: state.progressPct,
      completedLessons: state.completedLessons,
      totalLessons: state.totalLessons || lessons.length,
      nextLessonId: state.nextLessonId,
      status,
      loading: state.loading,
    });
  }, [course.id, state.progressPct, state.completedLessons, state.totalLessons, state.nextLessonId, state.loading, status, lessons.length, onStateChange]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      if (saved) {
        await apiFetch("/api/saved-courses/" + encodeURIComponent(course.id), { method: "DELETE" });
      } else {
        await apiFetch("/api/saved-courses", { method: "POST", body: JSON.stringify({ courseId: course.id }) });
      }
      onSavedChange(course.id, !saved);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't update Saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const learnHref = routes.learn(course.id, status === "completed" ? null : state.nextLessonId);
  const progress = Math.min(100, Math.max(0, state.progressPct));
  const category = /^ai\s+course\s+search$/i.test(course.category) ? "AI and machine learning" : course.category;

  return (
    <article className="bfs-course-card" data-course-status={status}>
      <div className="bfs-course-card__media">
        <Link to={learnHref} aria-label={`Open ${course.title}`} className="block h-full w-full">
          {course.thumbnail
            ? <img src={course.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <div className="bfs-course-card__fallback bfs-course-card__fallback--learning" aria-hidden="true"><GraduationCap className="bfs-course-card__fallback-icon" size={40} /><span className="bfs-course-card__fallback-title">{course.title.split(/\s+/).slice(0, 2).join(" ")}</span></div>}
        </Link>
        <span className={`bfs-course-chip ${status === "completed" ? "bfs-course-chip--completed" : "bfs-course-chip--beginner"}`}>
          {status === "completed" ? "Completed" : status === "in-progress" ? "In progress" : "Not started"}
        </span>
        <button type="button" className="bfs-course-card__save" onClick={() => void handleSave()} disabled={saving} aria-label={saved ? "Remove from saved courses" : "Save course"} aria-pressed={saved} title={saved ? "Saved" : "Save"}>
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>
      <div className="bfs-course-card__body">
        <div className="bfs-course-card__meta">
          {category && <span>{category}</span>}
          {course.level && <span>{course.level}</span>}
        </div>
        <h2 className="bfs-course-card__title" title={course.title}><Link to={learnHref}>{course.title}</Link></h2>
        {course.description && <p className="bfs-course-card__outcome">{course.description}</p>}
        <div className="bfs-course-card__meta" aria-label="Course duration and lesson count">
          <span><Clock3 size={14} aria-hidden="true" /> {course.duration || "Self-paced"}</span>
          {state.totalLessons > 0 && <span>{state.totalLessons} {state.totalLessons === 1 ? "lesson" : "lessons"}</span>}
        </div>
        <div className="mt-3" aria-label="Course progress">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{state.completedLessons} of {state.totalLessons || lessons.length} lessons</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="bfs-course-card__progress" role="progressbar" aria-label={`${course.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <div className={status === "completed" ? "bfs-course-card__progress-fill bfs-course-card__progress-fill--completed" : "bfs-course-card__progress-fill"} style={{ width: `${progress}%` }} />
          </div>
        </div>
        {state.error && <p className="mt-2 text-sm" role="status">Progress may be out of date. <button type="button" className="underline" onClick={() => window.location.reload()}>Refresh</button></p>}
        {saveError && <p className="mt-2 text-sm" role="alert">{saveError}</p>}
        <div className="bfs-course-card__action-row">
          <Link to={learnHref} className="bfs-course-action-button" aria-label={`${primaryLabel} ${course.title}`}>
            <PrimaryIcon size={16} aria-hidden="true" />{primaryLabel}
          </Link>
          <details className="relative" open={menuOpen} onToggle={(event) => setMenuOpen((event.currentTarget as HTMLDetailsElement).open)}>
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" aria-label={`Course actions for ${course.title}`} title="Course actions">
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div className="absolute bottom-full right-0 z-20 mb-2 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {hasRoadmap && <Link onClick={() => setMenuOpen(false)} to={routes.roadmap(course.id)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Map className="h-4 w-4" aria-hidden="true" />Roadmap</Link>}
              <Link onClick={() => setMenuOpen(false)} to={routes.course(course.id)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Info className="h-4 w-4" aria-hidden="true" />Course info</Link>
              <button type="button" onClick={() => { setMenuOpen(false); onUnenroll(enrollment); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" />Unenroll</button>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export default function MyCourses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: LearningTab = rawTab === "not-started" || rawTab === "completed" ? rawTab : "in-progress";
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [courseStates, setCourseStates] = useState<Record<string, CourseStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [pendingUnenroll, setPendingUnenroll] = useState<(Enrollment & { course: Course }) | null>(null);
  const [unenrolling, setUnenrolling] = useState(false);
  const [actionError, setActionError] = useState("");
  const [undoEnrollment, setUndoEnrollment] = useState<(Enrollment & { course: Course }) | null>(null);
  const [notice, setNotice] = useState("");
  const [showToast, setShowToast] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [enrollmentResult, savedResult] = await Promise.allSettled([
      apiFetch("/api/enrollments"),
      apiFetch("/api/saved-courses"),
    ]);
    if (enrollmentResult.status === "fulfilled") {
      const all = (enrollmentResult.value.enrollments ?? [])
        .map(mapEnrollment)
        .filter((item: Enrollment & { course: Course }) => item.course.id && item.course.title);
      setEnrollments(all);
    } else {
      setLoadError(enrollmentResult.reason instanceof Error ? enrollmentResult.reason.message : "Couldn't load your courses.");
    }
    if (savedResult.status === "fulfilled") {
      const ids = (savedResult.value.savedCourses ?? []).map((item: any) => {
        const course = item?.course ?? item?.courseId ?? item?.course_id ?? item;
        return String(course?._id ?? course?.id ?? course).toLowerCase();
      }).filter(Boolean);
      setSavedIds(new Set(ids));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!showToast) return;
    const timeout = window.setTimeout(() => setShowToast(false), 6000);
    return () => window.clearTimeout(timeout);
  }, [showToast, notice, undoEnrollment]);

  const updateCourseState = useCallback((courseId: string, state: CourseStatus) => {
    setCourseStates((previous) => {
      const current = previous[courseId];
      if (current && current.progressPct === state.progressPct && current.completedLessons === state.completedLessons && current.totalLessons === state.totalLessons && current.nextLessonId === state.nextLessonId && current.status === state.status && current.loading === state.loading) return previous;
      return { ...previous, [courseId]: state };
    });
  }, []);

  const setTab = (tab: LearningTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "in-progress") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const statusFor = (item: Enrollment & { course: Course }): LearningTab => {
    if (item.status === "completed") return "completed";
    return courseStates[item.course.id]?.status ?? getInitialStatus(item);
  };

  const tabCounts = useMemo(() => ({
    "in-progress": enrollments.filter((item) => statusFor(item) === "in-progress").length,
    "not-started": enrollments.filter((item) => statusFor(item) === "not-started").length,
    completed: enrollments.filter((item) => statusFor(item) === "completed").length,
  }), [enrollments, courseStates]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const items = enrollments.filter((item) => {
      if (statusFor(item) !== activeTab) return false;
      if (!normalizedQuery) return true;
      return [item.course.title, item.course.category, item.course.description].some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedQuery));
    });
    return items.sort((a, b) => {
      if (sort === "title") return a.course.title.localeCompare(b.course.title);
      if (sort === "progress") return (courseStates[b.course.id]?.progressPct ?? 0) - (courseStates[a.course.id]?.progressPct ?? 0);
      return new Date(b.updated_at || b.enrolled_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.enrolled_at || a.created_at || 0).getTime();
    });
  }, [enrollments, activeTab, query, sort, courseStates]);

  const activeEnrollment = useMemo(() => enrollments
    .filter((item) => statusFor(item) === "in-progress")
    .sort((a, b) => new Date(b.updated_at || b.enrolled_at || 0).getTime() - new Date(a.updated_at || a.enrolled_at || 0).getTime())[0], [enrollments, courseStates]);

  const handleUnenroll = async () => {
    if (!pendingUnenroll || unenrolling) return;
    setUnenrolling(true);
    setActionError("");
    try {
      await apiFetch("/api/enrollments/" + encodeURIComponent(pendingUnenroll.course.id), { method: "DELETE" });
      const removed = pendingUnenroll;
      setEnrollments((previous) => previous.filter((item) => item.course.id !== removed.course.id));
      setPendingUnenroll(null);
      setUndoEnrollment(removed);
      setNotice(`Unenrolled from ${removed.course.title}.`);
      setShowToast(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't unenroll from this course. Please try again.");
    } finally {
      setUnenrolling(false);
    }
  };

  const undoUnenroll = async () => {
    if (!undoEnrollment) return;
    try {
      await apiFetch("/api/enrollments/" + encodeURIComponent(undoEnrollment.course.id), { method: "POST" });
      setEnrollments((previous) => previous.some((item) => item.course.id === undoEnrollment.course.id) ? previous : [...previous, undoEnrollment]);
      setNotice(`Enrollment restored for ${undoEnrollment.course.title}.`);
      setUndoEnrollment(null);
      setShowToast(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't restore the enrollment. You can enroll again from Explore.");
      setUndoEnrollment(null);
      setShowToast(true);
    }
  };

  const totalCompleted = tabCounts.completed;
  const showTools = enrollments.length >= 6;

  return (
    <main className="bfs-shell py-8 sm:py-10">
      <PageHeader title="My learning" subtitle={`${enrollments.length} ${enrollments.length === 1 ? "course" : "courses"} · ${totalCompleted} completed`} />

      {activeEnrollment && !loading && (
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" aria-label="Continue where you left off">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted)]">Continue where you left off</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">{activeEnrollment.course.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{courseStates[activeEnrollment.course.id]?.completedLessons ?? 0} of {courseStates[activeEnrollment.course.id]?.totalLessons ?? getAllLessonsFlat(activeEnrollment.course.modules).length} lessons completed</p>
            </div>
            <Link to={routes.learn(activeEnrollment.course.id, courseStates[activeEnrollment.course.id]?.nextLessonId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-medium text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <Play size={16} aria-hidden="true" />Continue
            </Link>
          </div>
        </section>
      )}

      <div className="mt-6 border-b border-[var(--border)]">
        <nav className="flex gap-5 overflow-x-auto" aria-label="Course status">
          {([
            ["in-progress", "In progress"],
            ["not-started", "Not started"],
            ["completed", "Completed"],
          ] as const).map(([tab, label]) => (
            <button key={tab} type="button" onClick={() => setTab(tab)} aria-current={activeTab === tab ? "page" : undefined} className={`relative min-h-11 whitespace-nowrap border-b-2 px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${activeTab === tab ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`}>
              {label} <span className="ml-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs">{tabCounts[tab]}</span>
            </button>
          ))}
        </nav>
      </div>

      {showTools && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex min-h-10 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
            <span className="sr-only">Search your courses</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your courses" className="min-h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] pl-9 pr-3 text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--muted)]">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="min-h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <option value="recent">Recently active</option>
              <option value="progress">Progress</option>
              <option value="title">A to Z</option>
            </select>
          </label>
        </div>
      )}

      <section className="mt-6" aria-live="polite">
        {loading ? (
          <div className="bfs-course-grid" aria-label="Loading your courses">
            {Array.from({ length: 3 }, (_, index) => <article key={index} className="bfs-course-card animate-pulse" aria-hidden="true"><div className="aspect-video bg-[var(--surface-2)]" /><div className="space-y-3 p-4"><div className="h-4 w-1/3 rounded bg-[var(--surface-2)]" /><div className="h-5 w-4/5 rounded bg-[var(--surface-2)]" /><div className="h-10 rounded bg-[var(--surface-2)]" /></div></article>)}
          </div>
        ) : loadError ? (
          <EmptyState icon={<GraduationCap className="h-8 w-8" />} title="Couldn't load your courses" description={loadError} action={<button type="button" className="btn-primary" onClick={() => void loadData()}>Retry</button>} />
        ) : filtered.length === 0 ? (
          enrollments.length === 0 ? (
            <EmptyState icon={<GraduationCap className="h-8 w-8" />} title="No courses yet" description="Your enrolled courses will appear here. Explore the catalog to find your next skill." action={<Link to={routes.explore()} className="btn-primary">Explore</Link>} />
          ) : query.trim() ? (
            <EmptyState icon={<Search className="h-8 w-8" />} title="No courses match your search" description="Try another title or category, or clear your search." action={<button type="button" className="btn-primary" onClick={() => setQuery("")}>Clear filters</button>} />
          ) : (
            <EmptyState icon={<GraduationCap className="h-8 w-8" />} title={activeTab === "in-progress" ? "Nothing in progress" : activeTab === "not-started" ? "No courses waiting to start" : "No completed courses yet"} description={activeTab === "completed" ? "Finish a course and it will appear here." : "Choose a course from another tab, or explore something new."} action={activeTab !== "completed" ? <Link to={routes.explore()} className="btn-primary">Explore</Link> : undefined} />
          )
        ) : (
          <div className="bfs-course-grid">
            {filtered.map((enrollment) => <CourseLearningCard key={enrollment.id} enrollment={enrollment} saved={savedIds.has(enrollment.course.id.toLowerCase())} onSavedChange={(courseId, nextSaved) => setSavedIds((previous) => { const next = new Set(previous); if (nextSaved) next.add(courseId.toLowerCase()); else next.delete(courseId.toLowerCase()); return next; })} onUnenroll={setPendingUnenroll} onStateChange={updateCourseState} />)}
          </div>
        )}
      </section>

      {actionError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{actionError}</p>}

      {pendingUnenroll && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !unenrolling) setPendingUnenroll(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="unenroll-title" className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="unenroll-title" className="text-lg font-semibold text-[var(--text)]">Unenroll from this course?</h2><p className="mt-2 text-sm text-[var(--muted)]">You can enroll again later. Your learning history may remain saved.</p></div>
              <button type="button" className="rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" aria-label="Close dialog" onClick={() => setPendingUnenroll(null)} disabled={unenrolling}><X size={18} /></button>
            </div>
            <p className="mt-3 font-medium text-[var(--text)]">{pendingUnenroll.course.title}</p>
            <div className="mt-5 flex justify-end gap-3"><button type="button" className="min-h-10 rounded-lg border border-[var(--border)] px-4" onClick={() => setPendingUnenroll(null)} disabled={unenrolling}>Cancel</button><button type="button" className="min-h-10 rounded-lg bg-red-600 px-4 font-medium text-white disabled:opacity-60" onClick={() => void handleUnenroll()} disabled={unenrolling}>{unenrolling ? "Unenrolling…" : "Unenroll"}</button></div>
          </section>
        </div>
      )}

      {showToast && notice && <div className="fixed bottom-5 left-1/2 z-[90] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-[var(--text)] px-4 py-3 text-sm text-[var(--surface)] shadow-lg" role="status">{notice}{undoEnrollment && <button type="button" className="font-semibold underline" onClick={() => void undoUnenroll()}>Undo</button>}</div>}
    </main>
  );
}
