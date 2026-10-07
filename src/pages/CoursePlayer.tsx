import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Course, Progress } from "@/types";
import { getAllLessonsFlat, findLessonById, isLessonCompleted, getNavigationLessons } from "@/lib/courseUtils";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Play, ListChecks, Menu, X, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { classNames } from "@/lib/utils";

function mapCourse(raw: any): Course {
  return {
    id: String(raw._id ?? raw.id),
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    category: raw.category,
    level: raw.level,
    duration: String(raw.duration ?? ""),
    thumbnail: raw.thumbnail ?? null,
    learning_outcomes: raw.learningOutcomes ?? [],
    modules: (raw.modules ?? []).map((module: any) => ({
      ...module,
      id: String(module._id ?? module.id),
      lessons: (module.lessons ?? []).map((lesson: any) => ({
        ...lesson,
        id: String(lesson._id ?? lesson.id),
      })),
    })),
    is_published: raw.isPublished ?? true,
    pricing: raw.pricing,
    created_by: raw.createdBy ?? null,
    created_at: raw.createdAt ?? "",
    updated_at: raw.updatedAt ?? "",
  };
}

function mapProgress(raw: any): Progress {
  return {
    id: String(raw._id ?? raw.id),
    user_id: String(raw.user ?? raw.user_id),
    course_id: String(raw.course ?? raw.course_id),
    completed_lessons: (raw.completedLessons ?? []).map((item: any) => ({
      lessonId: String(item.lessonId),
      type: item.type,
      completedAt: item.completedAt,
    })),
    completed_count: raw.completedCount ?? 0,
    total_lessons: raw.totalLessons ?? 0,
    percentage: raw.percentage ?? 0,
    last_lesson_id: raw.lastLessonId ? String(raw.lastLessonId) : null,
    last_accessed_at: raw.lastAccessedAt ?? null,
    created_at: raw.createdAt ?? "",
    updated_at: raw.updatedAt ?? "",
  };
}

export default function CoursePlayer() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId) {
      setError("Invalid course");
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [courseData, progressData] = await Promise.all([
          apiFetch(`/api/courses/${courseId}/learn`),
          apiFetch(`/api/progress/${courseId}`),
        ]);
        setCourse(mapCourse(courseData.course));
        setProgress(mapProgress(progressData.progress));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load this course.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [courseId]);

  const allLessons = useMemo(() => course ? getAllLessonsFlat(course.modules) : [], [course]);
  const currentLesson = useMemo(
    () => course && lessonId ? findLessonById(course.modules, lessonId) : null,
    [course, lessonId]
  );

  useEffect(() => {
    if (!course || lessonId || allLessons.length === 0) return;
    const targetId =
      progress?.last_lesson_id ||
      allLessons.find((item) => !isLessonCompleted(progress?.completed_lessons || [], item.id))?.id ||
      allLessons[0].id;
    navigate(`/learn/${courseId}/${targetId}`, { replace: true });
  }, [course, lessonId, allLessons, progress, navigate, courseId]);

  const handleNavigate = (id: string) => {
    navigate(`/learn/${courseId}/${id}`);
    setSidebarOpen(false);
  };

  const handleComplete = async () => {
    if (!courseId || !lessonId || !currentLesson || isLessonCompleted(progress?.completed_lessons || [], lessonId)) return;
    setCompleting(true);
    setError("");
    try {
      const data = await apiFetch(`/api/progress/${courseId}/items/${lessonId}/complete`, { method: "POST" });
      setProgress(mapProgress(data.progress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark lesson complete.");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>;
  }

  if (error || !course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{error || "Course Not Found"}</h1>
        <Link to={`/courses/${courseId}`} className="btn-primary mt-6">View Course</Link>
      </div>
    );
  }

  const completedLessons = progress?.completed_lessons || [];
  const currentCompleted = lessonId ? isLessonCompleted(completedLessons, lessonId) : false;
  const navigation = lessonId ? getNavigationLessons(course.modules, lessonId) : { prev: null, next: null };
  const progressPct = progress?.percentage || 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className={classNames(
        "order-2 fixed inset-y-0 right-0 z-50 flex h-screen w-80 transform flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform lg:sticky lg:top-0 lg:translate-x-0 lg:shadow-none",
        sidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <Link to={`/courses/${courseId}`} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ArrowLeft className="h-4 w-4" />Course Details
          </Link>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close course menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="line-clamp-2 text-sm font-bold text-slate-900">{course.title}</h2>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{progress?.completed_count || 0} of {allLessons.length} lessons</span>
            <span className="font-medium text-blue-600">{progressPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {course.modules.map((module, index) => (
            <div key={module.id} className="border-b border-slate-100">
              <div className="bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Module {index + 1}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{module.title}</p>
              </div>
              {module.lessons.map((lesson) => {
                const done = isLessonCompleted(completedLessons, lesson.id);
                return (
                  <button key={lesson.id} onClick={() => handleNavigate(lesson.id)} className={classNames(
                    "flex w-full items-center gap-3 px-4 py-3 text-left text-sm",
                    lesson.id === lessonId ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-50"
                  )}>
                    {done ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" /> : <Circle className="h-4 w-4 flex-shrink-0 text-slate-300" />}
                    {lesson.type === "project" ? <ListChecks className="h-3.5 w-3.5 text-slate-400" /> : <Play className="h-3.5 w-3.5 text-slate-400" />}
                    <span className="line-clamp-1 flex-1">{lesson.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="order-1 min-w-0 flex-1">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open course menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 px-3">
            <p className="truncate text-sm font-semibold text-slate-900">{currentLesson?.lesson.title || "Course Player"}</p>
            <p className="text-xs text-slate-500">{currentLesson?.module.title}</p>
          </div>
          {currentLesson && (
            <button onClick={handleComplete} disabled={completing || currentCompleted} className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
              currentCompleted ? "bg-green-50 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700"
            )}>
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {currentCompleted ? "Completed" : "Mark Complete"}
            </button>
          )}
        </div>

        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {currentLesson ? (
            <>
              <div className="flex items-center gap-2">
                <span className={classNames("badge", currentLesson.lesson.type === "project" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700")}>
                  {currentLesson.lesson.type === "project" ? <ListChecks className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {currentLesson.lesson.type}
                </span>
              </div>

              <h1 className="mt-3 text-3xl font-bold text-slate-900">{currentLesson.lesson.title}</h1>

              {currentLesson.lesson.type === "tutorial" && (
                <div className="mt-8 space-y-5">
                  {currentLesson.lesson.tutorial?.videos?.length ? (
                    <section className="space-y-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Lesson video</p>
                        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">Watch the tutorial</h2>
                      </div>

                      {currentLesson.lesson.tutorial.videos.map((video: any) => (
                        <div key={video.videoId || video.url} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(13,18,32,.08)]">
                          {video.videoId ? (
                            <div className="aspect-video w-full bg-slate-950">
                              <iframe
                                title={video.title || "Course video"}
                                src={`https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?rel=0&playsinline=1`}
                                className="h-full w-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                referrerPolicy="strict-origin-when-cross-origin"
                              />
                            </div>
                          ) : (
                            <div className="p-5 text-sm text-amber-700">
                              This video does not provide an embeddable video ID.
                            </div>
                          )}

                          <div className="border-t border-slate-100 p-4 sm:p-5">
                            <p className="font-semibold text-slate-900">{video.title}</p>
                            {video.channelTitle && <p className="mt-1 text-xs text-slate-500">{video.channelTitle}</p>}
                            <p className="mt-2 text-xs text-slate-400">
                              This video is played inside BuddyForStudy.
                            </p>
                          </div>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  {(currentLesson.lesson.description || currentLesson.lesson.tutorial?.content) && (
                    <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-slate-900 transition hover:bg-slate-50 marker:hidden">
                        <span className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            <Play className="h-4 w-4 transition-transform group-open:rotate-90" />
                          </span>
                          <span>Description & lesson notes</span>
                        </span>
                        <span className="text-xs font-semibold text-slate-400 group-open:text-blue-600">Click to expand</span>
                      </summary>

                      <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
                        {currentLesson.lesson.description && (
                          <div className="mb-5">
                            <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Lesson description</p>
                            <p className="mt-2 text-sm leading-7 text-slate-600">{currentLesson.lesson.description}</p>
                          </div>
                        )}

                        {currentLesson.lesson.tutorial?.content && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Tutorial notes</p>
                            <div className="prose mt-2 max-w-none whitespace-pre-wrap text-sm leading-7 text-slate-700">
                              {currentLesson.lesson.tutorial.content}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {currentLesson.lesson.tutorial?.resources?.length ? (
                    <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-slate-900 transition hover:bg-slate-50 marker:hidden">
                        <span>Resources</span>
                        <span className="text-xs font-semibold text-slate-400">
                          {currentLesson.lesson.tutorial.resources.length} item{currentLesson.lesson.tutorial.resources.length === 1 ? "" : "s"}
                        </span>
                      </summary>

                      <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                        <div className="space-y-3">
                          {currentLesson.lesson.tutorial.resources.map((resource) => (
                            <a
                              key={resource.url || resource.title}
                              href={resource.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-xl border border-slate-100 px-4 py-3 text-sm font-medium text-blue-600 transition hover:border-blue-100 hover:bg-blue-50"
                            >
                              {resource.title || resource.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              )}

              {currentLesson.lesson.type === "project" && (
                <div className="mt-8 space-y-4">
                  <div className="rounded-xl bg-white p-5">
                    <h2 className="font-semibold">Project</h2>
                    <p className="mt-2 whitespace-pre-wrap text-slate-700">{currentLesson.lesson.project?.description}</p>
                    <h3 className="mt-5 font-semibold">Objectives</h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{(currentLesson.lesson.project?.objectives || []).map((item: string) => <li key={item}>{item}</li>)}</ul>
                    <h3 className="mt-5 font-semibold">Requirements</h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{(currentLesson.lesson.project?.requirements || []).map((item: string) => <li key={item}>{item}</li>)}</ul>
                    <p className="mt-5 whitespace-pre-wrap text-slate-700">{currentLesson.lesson.project?.instructions}</p>
                    <p className="mt-5 font-medium text-slate-800">{currentLesson.lesson.project?.expectedOutcome}</p>
                  </div>
                </div>
              )}

              <div className="mt-10 flex items-center justify-between gap-3 border-t border-slate-200 pt-6">
                <button disabled={!navigation.prev} onClick={() => navigation.prev && handleNavigate(navigation.prev.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />Previous
                </button>
                <button disabled={!navigation.next} onClick={() => navigation.next && handleNavigate(navigation.next.id)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  Next<ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500">This course has no lessons yet.</div>
          )}
        </div>
      </main>
    </div>
  );
}
