import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, Circle, GraduationCap, LoaderCircle, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";

type RoadmapLesson = { lessonId: string; title: string; type?: string; moduleTitle?: string; order?: number };
type RoadmapQuizQuestion = { question?: string; options?: string[]; answer?: number; explanation?: string };
type RoadmapModule = {
  title?: string;
  description?: string;
  lessons?: Array<{
    id?: string;
    _id?: string;
    lessonId?: string;
    title?: string;
    type?: string;
    order?: number;
    tutorial?: { videos?: Array<{ url?: string; title?: string }> };
  }>;
  quiz?: { title?: string; questions?: RoadmapQuizQuestion[] };
};
type RoadmapQuizAttempt = { moduleIndex: number; score: number; total: number; attemptedAt?: string };
type SavedRoadmap = {
  _id?: string;
  id?: string;
  query?: string;
  canonicalTopic?: string;
  level?: string;
  status?: string;
  course?: { title?: string; description?: string; modules?: RoadmapModule[] };
  lessons?: RoadmapLesson[];
  completedLessonIds?: string[];
  quizAttempts?: RoadmapQuizAttempt[];
  progress?: { completedCount?: number; totalLessons?: number; percentage?: number };
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function SavedRoadmap() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState<SavedRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, Record<number, number>>>({});

  useEffect(() => {
    let current = true;
    if (!roadmapId) {
      setError("This roadmap link is invalid.");
      setLoading(false);
      return () => { current = false; };
    }
    setLoading(true);
    setError("");
    apiFetch("/api/roadmaps/" + encodeURIComponent(roadmapId))
      .then((data) => { if (current) setRoadmap(data.roadmap ?? null); })
      .catch((err) => { if (current) setError(messageOf(err, "Unable to load this roadmap.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [roadmapId]);

  const modules = roadmap?.course?.modules ?? [];
  const allLessons = useMemo<RoadmapLesson[]>(() => {
    if (roadmap?.lessons?.length) return roadmap.lessons;
    return modules.flatMap((module) => (module.lessons ?? []).map((lesson, index) => ({
      lessonId: String(lesson.id ?? lesson.lessonId ?? lesson._id ?? ""),
      title: lesson.title || "Lesson " + (index + 1),
      type: lesson.type,
      moduleTitle: module.title,
      order: lesson.order ?? index + 1
    })).filter((lesson) => Boolean(lesson.lessonId)));
  }, [roadmap, modules]);
  const completed = useMemo(() => new Set(roadmap?.completedLessonIds ?? []), [roadmap?.completedLessonIds]);
  const total = roadmap?.progress?.totalLessons ?? allLessons.length;
  const done = roadmap?.progress?.completedCount ?? completed.size;
  const percent = roadmap?.progress?.percentage ?? (total ? Math.round(done / total * 100) : 0);
  const nextLesson = allLessons.find((lesson) => !completed.has(lesson.lessonId));

  if (loading) return <main className="mx-auto flex min-h-[55vh] max-w-4xl items-center justify-center px-5" aria-live="polite"><LoaderCircle className="h-7 w-7 animate-spin" aria-label="Loading roadmap" /></main>;

  if (error || !roadmap) return <main className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center px-5 py-12 text-center">
    <BookOpen className="h-10 w-10 text-slate-400" aria-hidden="true" />
    <h1 className="mt-4 text-2xl font-bold text-slate-950">Roadmap unavailable</h1>
    <p className="mt-2 text-sm text-slate-600">{error || "This roadmap may have been removed."}</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3"><Link to={routes.myLearning()} className="btn-primary">Back to My learning</Link><Link to={routes.explore()} className="rounded-lg border border-slate-300 px-4 py-2 font-medium">Explore courses</Link></div>
  </main>;

  async function completeLesson(lessonId: string) {
    if (!roadmapId || !lessonId || busyAction) return;
    setBusyAction("complete:" + lessonId);
    setActionError("");
    setActionNotice("");
    try {
      const data = await apiFetch("/api/roadmaps/" + encodeURIComponent(roadmapId) + "/lessons/" + encodeURIComponent(lessonId) + "/complete", { method: "POST" });
      if (!data.roadmap) throw new Error("The completed roadmap could not be refreshed.");
      setRoadmap(data.roadmap);
      setActionNotice("Lesson marked complete.");
    } catch (err) {
      setActionError(messageOf(err, "Unable to complete this roadmap lesson. Please retry."));
    } finally {
      setBusyAction("");
    }
  }

  async function generateQuiz(moduleIndex: number) {
    if (!roadmapId || busyAction) return;
    setBusyAction("quiz:" + moduleIndex);
    setActionError("");
    setActionNotice("");
    try {
      const data = await apiFetch("/api/roadmaps/" + encodeURIComponent(roadmapId) + "/quizzes/" + moduleIndex + "/generate", { method: "POST" });
      if (!data.roadmap) throw new Error("The roadmap quiz could not be refreshed.");
      const questions = data.roadmap.course?.modules?.[moduleIndex]?.quiz?.questions ?? [];
      if (!questions.length) throw new Error("No quiz questions are available yet. Please retry.");
      setRoadmap(data.roadmap);
      setActionNotice("Quiz ready. Answer every question before submitting.");
    } catch (err) {
      setActionError(messageOf(err, "Unable to generate this roadmap quiz. Please retry."));
    } finally {
      setBusyAction("");
    }
  }

  async function submitQuiz(moduleIndex: number) {
    if (!roadmapId || busyAction) return;
    const questions = roadmap.course?.modules?.[moduleIndex]?.quiz?.questions ?? [];
    const answers = quizAnswers[moduleIndex] ?? {};
    if (!questions.length) {
      setActionError("Generate the quiz before submitting answers.");
      return;
    }
    if (questions.some((_question, questionIndex) => !Number.isInteger(answers[questionIndex]))) {
      setActionError("Answer every quiz question before submitting.");
      return;
    }
    setBusyAction("submit:" + moduleIndex);
    setActionError("");
    setActionNotice("");
    try {
      const data = await apiFetch("/api/roadmaps/" + encodeURIComponent(roadmapId) + "/quizzes/" + moduleIndex + "/submit", {
        method: "POST",
        body: JSON.stringify({ answers: questions.map((_question, questionIndex) => answers[questionIndex]) })
      });
      if (!data.roadmap) throw new Error("The submitted quiz result could not be refreshed.");
      setRoadmap(data.roadmap);
      const attempts = (data.roadmap.quizAttempts ?? []).filter((attempt: RoadmapQuizAttempt) => attempt.moduleIndex === moduleIndex);
      const latest = attempts[attempts.length - 1];
      setActionNotice(latest ? "Quiz submitted: " + latest.score + " of " + latest.total + " correct." : "Quiz submitted.");
    } catch (err) {
      setActionError(messageOf(err, "Unable to submit this quiz. Your answers are still available; please retry."));
    } finally {
      setBusyAction("");
    }
  }

  async function deleteRoadmap() {
    if (!roadmapId || busyAction) return;
    setBusyAction("delete");
    setActionError("");
    setActionNotice("");
    try {
      await apiFetch("/api/roadmaps/" + encodeURIComponent(roadmapId), { method: "DELETE" });
      navigate(routes.myLearning());
    } catch (err) {
      setActionError(messageOf(err, "Unable to delete this roadmap. Please retry."));
      setConfirmDelete(false);
    } finally {
      setBusyAction("");
    }
  }

  function continueRoadmap() {
    if (!nextLesson) {
      setActionNotice("All roadmap lessons are complete. You can review the lessons or quizzes above.");
      return;
    }
    const target = document.getElementById("roadmap-lesson-" + encodeURIComponent(nextLesson.lessonId));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  return <main className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
    <Link to={routes.myLearning()} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft size={16} aria-hidden="true" />Back to My learning</Link>
    <header className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex items-start gap-4"><div className="rounded-2xl bg-violet-50 p-3 text-violet-700"><GraduationCap size={28} aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Saved learning roadmap</p><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{roadmap.course?.title || roadmap.canonicalTopic || roadmap.query || "Learning roadmap"}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{roadmap.course?.description || "Follow these lessons in order and track your progress."}</p><p className="mt-3 text-sm text-slate-500">{roadmap.level || "Self-paced"} · {done} of {total} lessons completed</p></div></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Roadmap progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: percent + "%" }} /></div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={continueRoadmap} className="btn-primary justify-center">{nextLesson ? "Continue: " + nextLesson.title : "Review roadmap"}</button>
        {!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={16} aria-hidden="true" />Delete roadmap</button> : <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3"><span className="text-sm font-medium text-rose-800">Delete this saved roadmap and its progress?</span><button type="button" disabled={Boolean(busyAction)} onClick={() => void deleteRoadmap()} className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyAction === "delete" ? "Deleting…" : "Confirm delete"}</button><button type="button" disabled={Boolean(busyAction)} onClick={() => setConfirmDelete(false)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50">Cancel</button></div>}
      </div>
      {actionError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}</p>}
      {actionNotice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{actionNotice}</p>}
    </header>
    <section className="mt-7 space-y-4" aria-label="Roadmap modules">
      {modules.length ? modules.map((module, moduleIndex) => {
        const moduleLessons = module.lessons ?? [];
        const quizQuestions = module.quiz?.questions ?? [];
        const latestAttempt = (roadmap.quizAttempts ?? []).filter((attempt) => attempt.moduleIndex === moduleIndex).slice(-1)[0];
        const answers = quizAnswers[moduleIndex] ?? {};
        const quizBusy = busyAction === "quiz:" + moduleIndex || busyAction === "submit:" + moduleIndex;
        return <article key={moduleIndex} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-950">{module.title || "Module " + (moduleIndex + 1)}</h2>
          {module.description && <p className="mt-1 text-sm text-slate-600">{module.description}</p>}
          <ol className="mt-4 space-y-2">
            {moduleLessons.map((lesson, lessonIndex) => {
              const id = String(lesson.id ?? lesson.lessonId ?? lesson._id ?? allLessons.find((item) => item.title === lesson.title && item.moduleTitle === module.title)?.lessonId ?? "");
              const isDone = id ? completed.has(id) : false;
              const video = lesson.tutorial?.videos?.[0]?.url;
              return <li id={id ? "roadmap-lesson-" + encodeURIComponent(id) : undefined} key={id || lessonIndex} tabIndex={-1} className="flex flex-wrap items-start gap-3 rounded-xl bg-slate-50 p-3 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <span className={isDone ? "mt-0.5 text-emerald-600" : "mt-0.5 text-slate-400"}>{isDone ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}</span>
                <div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{lesson.title || "Lesson " + (lessonIndex + 1)}</p><p className="mt-1 text-xs text-slate-500">{lesson.type || "Lesson"}{isDone ? " · Completed" : ""}</p></div>
                {video && <a href={video} target="_blank" rel="noreferrer" className="text-sm font-semibold text-violet-700 underline">Open resource</a>}
                {id && !isDone && <button type="button" disabled={Boolean(busyAction)} onClick={() => void completeLesson(id)} className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">{busyAction === "complete:" + id ? "Saving…" : "Mark complete"}</button>}
              </li>;
            })}
          </ol>
          <section className="mt-5 rounded-2xl border border-slate-200 p-4" aria-label={"Quiz for " + (module.title || "module")}>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{module.quiz?.title || "Module quiz"}</h3><p className="mt-1 text-xs text-slate-500">{latestAttempt ? "Latest score: " + latestAttempt.score + "/" + latestAttempt.total : "Test your understanding of this module."}</p></div>{!quizQuestions.length && <button type="button" disabled={Boolean(busyAction)} onClick={() => void generateQuiz(moduleIndex)} className="btn-primary justify-center disabled:opacity-50">{busyAction === "quiz:" + moduleIndex ? "Generating…" : "Generate quiz"}</button>}</div>
            {quizQuestions.length > 0 && <div className="mt-4 space-y-4">
              {quizQuestions.map((question, questionIndex) => <fieldset key={questionIndex} className="rounded-xl bg-slate-50 p-3"><legend className="px-1 text-sm font-medium text-slate-900">{question.question || "Question " + (questionIndex + 1)}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{(question.options ?? []).map((option, optionIndex) => <label key={optionIndex} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50"><input type="radio" name={"roadmap-" + moduleIndex + "-question-" + questionIndex} checked={answers[questionIndex] === optionIndex} onChange={() => setQuizAnswers((current) => ({ ...current, [moduleIndex]: { ...(current[moduleIndex] ?? {}), [questionIndex]: optionIndex } }))} disabled={Boolean(busyAction)} className="mt-0.5" />{option}</label>)}</div>{latestAttempt && question.answer !== undefined && <div className="mt-3 text-xs text-slate-600"><span className="font-semibold">Correct option:</span> {question.options?.[question.answer] || "Answer recorded"}{question.explanation && <p className="mt-1">{question.explanation}</p>}</div>}</fieldset>)}
              <button type="button" disabled={Boolean(busyAction) || quizQuestions.some((_question, questionIndex) => !Number.isInteger(answers[questionIndex]))} onClick={() => void submitQuiz(moduleIndex)} className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50">{busyAction === "submit:" + moduleIndex ? "Submitting…" : latestAttempt ? "Submit quiz again" : "Submit quiz"}</button>
            </div>}
            {quizBusy && <p role="status" className="mt-3 text-sm text-slate-500">{busyAction.startsWith("quiz:") ? "Preparing quiz…" : "Submitting quiz…"}</p>}
          </section>
        </article>;
      }) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center"><p className="font-semibold text-slate-900">No modules are available yet</p><p className="mt-2 text-sm text-slate-600">This roadmap was saved, but its module list is empty.</p></div>}
    </section>
  </main>;
}
