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
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizPassed, setQuizPassed] = useState(false);

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
    if (currentLesson?.lesson.type !== "quiz" || !courseId || !lessonId) {
      setQuizData(null);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizPassed(false);
      return;
    }

    async function loadQuiz() {
      setQuizLoading(true);
      setQuizData(null);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizPassed(isLessonCompleted(progress?.completed_lessons || [], lessonId));

      try {
        const data = await apiFetch("/api/ai/quiz", {
          method: "POST",
          body: JSON.stringify({ courseId, lessonId }),
        });
        setQuizData(data.quiz);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load this quiz.");
      } finally {
        setQuizLoading(false);
      }
    }

    void loadQuiz();
  }, [currentLesson?.lesson.type, courseId, lessonId, progress?.completed_lessons]);

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

  const handleQuizSubmit = async () => {
    if (!courseId || !lessonId || !quizData?.questions?.length) return;

    const questions = quizData.questions || [];
    const correct = questions.filter(
      (question: any) => quizAnswers[question.id] === question.correctOptionId
    ).length;
    const score = Math.round((correct / questions.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);

    const passed = score >= Number(quizData.passingScore || currentLesson?.lesson.quiz?.passingScore || 70);
    setQuizPassed(passed);

    if (!passed || currentCompleted) return;

    setCompleting(true);
    setError("");
    try {
      const data = await apiFetch(`/api/progress/${courseId}/items/${lessonId}/complete`, { method: "POST" });
      setProgress(mapProgress(data.progress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quiz passed, but progress could not be saved.");
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
        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          {error || "Course Not Found"}
        </h1>
        <Link to={`/courses/${courseId}`} className="btn-primary mt-6">
          View Course
        </Link>
      </div>
    );
  }

  const completedLessons = progress?.completed_lessons || [];
  const currentCompleted = lessonId
    ? isLessonCompleted(completedLessons, lessonId)
    : false;
  const navigation = lessonId
    ? getNavigationLessons(course.modules, lessonId)
    : { prev: null, next: null };
  const progressPct = progress?.percentage || 0;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-full items-center gap-3 px-4 sm:gap-4">
          <button
            className="inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open course content"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Link
            to={`/courses/${courseId}`}
            className="hidden items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900 sm:flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Course Details
          </Link>

          <div className="min-w-0 flex-1 sm:border-l sm:border-slate-200 sm:pl-4">
            <p className="truncate text-sm font-extrabold text-slate-900">{course.title}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="whitespace-nowrap text-[10px] font-medium text-slate-400">
                {progress?.completed_count || 0}/{allLessons.length} lessons
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 sm:w-32">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[10px] font-extrabold text-slate-500">{progressPct}%</span>
            </div>
          </div>

          {currentLesson && currentLesson.lesson.type !== "quiz" && (
            <button
              onClick={handleComplete}
              disabled={completing || currentCompleted}
              className={classNames(
                "inline-flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:text-sm",
                currentCompleted
                  ? "bg-green-50 text-green-700"
                  : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              )}
            >
              {completing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {currentCompleted ? "Completed" : "Mark complete"}
              </span>
            </button>
          )}

          <Link
            to="/dashboard"
            className="hidden rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold transition hover:bg-slate-50 sm:block"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 bg-slate-50">
          <div className="mx-auto max-w-5xl">
            {currentLesson ? (
              <>
                {currentLesson.lesson.type === "quiz" && (
                  <section className="border-b border-slate-200 bg-white px-5 py-6 sm:px-8 lg:px-10">
                    <div className="mx-auto max-w-4xl">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-600">
                            {currentLesson.lesson.quiz?.scope === "module" ? "Module assessment" : "Lesson quiz"}
                          </p>
                          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                            {currentLesson.lesson.title}
                          </h1>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {currentLesson.lesson.description}
                          </p>
                        </div>
                        <span className="inline-flex w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                          {currentLesson.lesson.quiz?.questionCount || 0} questions
                        </span>
                      </div>

                      {quizLoading ? (
                        <div className="mt-8 flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-10">
                          <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                            Building your quiz with Gemini...
                          </div>
                        </div>
                      ) : quizData?.questions?.length ? (
                        <div className="mt-8 space-y-5">
                          {quizData.questions.map((question: any, questionIndex: number) => (
                            <article key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                              <div className="flex items-start gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                                  {questionIndex + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold leading-6 text-slate-900">{question.question}</p>
                                  {question.topic && (
                                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">
                                      {question.topic}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-2">
                                {(question.options || []).map((option: any) => {
                                  const selected = quizAnswers[question.id] === option.id;
                                  const correctOption = question.correctOptionId === option.id;
                                  const showResult = quizSubmitted;
                                  const tone = showResult
                                    ? correctOption
                                      ? "border-green-200 bg-green-50 text-green-800"
                                      : selected
                                        ? "border-red-200 bg-red-50 text-red-800"
                                        : "border-slate-200 bg-white text-slate-600"
                                    : selected
                                      ? "border-blue-300 bg-blue-50 text-blue-800"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50";

                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      disabled={quizSubmitted}
                                      onClick={() =>
                                        setQuizAnswers((current) => ({
                                          ...current,
                                          [question.id]: option.id,
                                        }))
                                      }
                                      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${tone}`}
                                    >
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-current/20 text-[11px]">
                                        {option.id}
                                      </span>
                                      <span>{option.text}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {quizSubmitted && (
                                <div className="mt-4 rounded-xl bg-white p-4">
                                  <p className="text-sm font-bold text-slate-900">
                                    {quizAnswers[question.id] === question.correctOptionId ? "Correct" : "Review this one"}
                                  </p>
                                  {question.explanation && (
                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                      {question.explanation}
                                    </p>
                                  )}
                                </div>
                              )}
                            </article>
                          ))}

                          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                Passing score: {quizData.passingScore || currentLesson.lesson.quiz?.passingScore || 70}%
                              </p>
                              {quizSubmitted && (
                                <p className={`mt-1 text-sm font-semibold ${quizPassed ? "text-green-600" : "text-red-600"}`}>
                                  Your score: {quizScore}%
                                </p>
                              )}
                            </div>

                            {!quizSubmitted ? (
                              <button
                                type="button"
                                onClick={() => void handleQuizSubmit()}
                                disabled={
                                  quizLoading ||
                                  Object.keys(quizAnswers).length !== quizData.questions.length ||
                                  completing
                                }
                                className="btn-primary justify-center"
                              >
                                Submit Quiz
                              </button>
                            ) : quizPassed ? (
                              <button
                                type="button"
                                onClick={() => navigation.next && handleNavigate(navigation.next.id)}
                                className="btn-primary justify-center"
                                disabled={completing}
                              >
                                {completing ? "Saving..." : navigation.next ? "Continue" : "Finish Course"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuizSubmitted(false);
                                  setQuizScore(null);
                                  setQuizPassed(false);
                                  setQuizAnswers({});
                                }}
                                className="btn-primary justify-center"
                              >
                                Try Again
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
                          This quiz could not be generated. Try opening the lesson again.
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {currentLesson.lesson.type === "tutorial" && (
                  <div className="bg-black">
                    {currentLesson.lesson.tutorial?.videos?.length ? (
                      currentLesson.lesson.tutorial.videos.map((video: any) => (
                        <div key={video.videoId || video.url}>
                          {video.videoId ? (
                            <div className="aspect-video w-full">
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
                            <div className="flex aspect-video items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-300">
                              This video does not provide an embeddable video ID.
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="flex aspect-video items-center justify-center px-6 text-sm text-slate-300">
                        No video is available for this lesson.
                      </div>
                    )}
                  </div>
                )}

                <section className="border-b border-slate-200 bg-white px-5 py-6 sm:px-8 lg:px-10">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-400">{currentLesson.module.title}</p>
                      <h1 className="mt-1 max-w-4xl text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                        {currentLesson.lesson.title}
                      </h1>
                      {currentLesson.lesson.tutorial?.videos?.[0]?.channelTitle && (
                        <p className="mt-2 text-sm text-slate-500">
                          {currentLesson.lesson.tutorial.videos[0].channelTitle}
                        </p>
                      )}
                    </div>

                    <span
                      className={classNames(
                        "inline-flex w-fit flex-shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold",
                        currentLesson.lesson.type === "project"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {currentLesson.lesson.type === "project" ? (
                        <ListChecks className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {currentLesson.lesson.type}
                    </span>
                  </div>

                  <div className="mt-6 flex gap-6 border-b border-slate-200">
                    <span className="border-b-2 border-blue-600 pb-3 text-sm font-bold text-blue-600">
                      Lesson
                    </span>
                    <span className="pb-3 text-sm font-semibold text-slate-400">
                      Progress {progressPct}%
                    </span>
                  </div>

                  <div className="py-5">
                    {currentLesson.lesson.type === "tutorial" && (
                      <div className="space-y-4">
                        {(currentLesson.lesson.description ||
                          currentLesson.lesson.tutorial?.content) && (
                          <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-slate-900 transition hover:bg-slate-100 marker:hidden">
                              <span>Description & lesson notes</span>
                              <span className="text-xs font-semibold text-slate-400 group-open:text-blue-600">
                                Click to expand
                              </span>
                            </summary>

                            <div className="border-t border-slate-200 bg-white px-5 py-5">
                              {currentLesson.lesson.description && (
                                <div className="mb-5">
                                  <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
                                    Lesson description
                                  </p>
                                  <p className="mt-2 text-sm leading-7 text-slate-600">
                                    {currentLesson.lesson.description}
                                  </p>
                                </div>
                              )}

                              {currentLesson.lesson.tutorial?.content && (
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
                                    Tutorial notes
                                  </p>
                                  <div className="prose mt-2 max-w-none whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                    {currentLesson.lesson.tutorial.content}
                                  </div>
                                </div>
                              )}
                            </div>
                          </details>
                        )}

                        {currentLesson.lesson.tutorial?.resources?.length ? (
                          <details className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-slate-900 transition hover:bg-slate-100 marker:hidden">
                              <span>Resources</span>
                              <span className="text-xs font-semibold text-slate-400">
                                {currentLesson.lesson.tutorial.resources.length} item{currentLesson.lesson.tutorial.resources.length === 1 ? "" : "s"}
                              </span>
                            </summary>
                            <div className="border-t border-slate-200 bg-white px-5 py-4">
                              <div className="space-y-3">
                                {currentLesson.lesson.tutorial.resources.map((resource) => (
                                  <a
                                    key={resource.url || resource.title}
                                    href={resource.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block rounded-xl border border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600 transition hover:border-blue-100 hover:bg-blue-50"
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
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <h2 className="font-extrabold text-slate-900">Project</h2>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                          {currentLesson.lesson.project?.description}
                        </p>

                        <h3 className="mt-6 font-bold text-slate-900">Objectives</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                          {(currentLesson.lesson.project?.objectives || []).map((item: string) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>

                        <h3 className="mt-6 font-bold text-slate-900">Requirements</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                          {(currentLesson.lesson.project?.requirements || []).map((item: string) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>

                        <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                          {currentLesson.lesson.project?.instructions}
                        </p>

                        <div className="mt-6 rounded-xl bg-green-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-[.14em] text-green-700">
                            Expected outcome
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-green-900">
                            {currentLesson.lesson.project?.expectedOutcome}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
                    <button
                      disabled={!navigation.prev}
                      onClick={() => navigation.prev && handleNavigate(navigation.prev.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>

                    <button
                      disabled={!navigation.next}
                      onClick={() => navigation.next && handleNavigate(navigation.next.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center px-6 text-center text-slate-500">
                This course has no lessons yet.
              </div>
            )}
          </div>
        </main>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={classNames(
            "fixed inset-y-0 right-0 z-50 flex h-screen w-[min(90vw,380px)] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform",
            sidebarOpen ? "translate-x-0" : "translate-x-full",
            "lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] lg:translate-x-0 lg:shadow-none"
          )}
        >
          <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[.18em] text-blue-600">
                  Course content
                </p>
                <h2 className="mt-1 line-clamp-2 text-sm font-extrabold text-slate-900">
                  {course.title}
                </h2>
              </div>

              <button
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close course content"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-400">
                {progress?.completed_count || 0} of {allLessons.length} lessons
              </span>
              <span className="font-extrabold text-blue-600">{progressPct}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {course.modules.map((module, index) => (
              <div key={module.id} className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">
                    Module {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-extrabold leading-5 text-slate-900">
                    {module.title}
                  </p>
                </div>

                {module.lessons.map((lesson) => {
                  const done = isLessonCompleted(completedLessons, lesson.id);
                  const active = lesson.id === lessonId;

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleNavigate(lesson.id)}
                      className={classNames(
                        "flex w-full items-start gap-3 border-t border-slate-100 px-4 py-3 text-left transition",
                        active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <span className="mt-0.5 flex-shrink-0">
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300" />
                        )}
                      </span>

                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        {lesson.type === "project" ? (
                          <ListChecks className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block line-clamp-2 text-xs font-semibold leading-5">
                          {lesson.title}
                        </span>
                      </span>

                      {active && (
                        <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {error && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
