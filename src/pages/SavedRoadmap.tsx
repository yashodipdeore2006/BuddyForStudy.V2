import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, Circle, GraduationCap, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";

type RoadmapLesson = { lessonId: string; title: string; type?: string; moduleTitle?: string; order?: number };
type RoadmapModule = { title?: string; description?: string; lessons?: Array<{ id?: string; lessonId?: string; title?: string; type?: string; order?: number; tutorial?: { videos?: Array<{ url?: string; title?: string }> } }> };
type SavedRoadmap = {
  _id?: string; id?: string; query?: string; canonicalTopic?: string; level?: string; status?: string;
  course?: { title?: string; description?: string; modules?: RoadmapModule[] };
  lessons?: RoadmapLesson[]; completedLessonIds?: string[];
  progress?: { completedCount?: number; totalLessons?: number; percentage?: number };
};

export default function SavedRoadmap() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const [roadmap, setRoadmap] = useState<SavedRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      .catch((err) => { if (current) setError(err instanceof Error ? err.message : "Unable to load this roadmap."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [roadmapId]);

  if (loading) return <main className="mx-auto flex min-h-[55vh] max-w-4xl items-center justify-center px-5" aria-live="polite"><LoaderCircle className="h-7 w-7 animate-spin" aria-label="Loading roadmap" /></main>;

  if (error || !roadmap) return <main className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center px-5 py-12 text-center">
    <BookOpen className="h-10 w-10 text-slate-400" aria-hidden="true" />
    <h1 className="mt-4 text-2xl font-bold text-slate-950">Roadmap unavailable</h1>
    <p className="mt-2 text-sm text-slate-600">{error || "This roadmap may have been removed."}</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3"><Link to={routes.myLearning()} className="btn-primary">Back to My learning</Link><Link to={routes.explore()} className="rounded-lg border border-slate-300 px-4 py-2 font-medium">Explore courses</Link></div>
  </main>;

  const modules = roadmap.course?.modules ?? [];
  const completed = new Set(roadmap.completedLessonIds ?? []);
  const total = roadmap.progress?.totalLessons ?? roadmap.lessons?.length ?? modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0);
  const done = roadmap.progress?.completedCount ?? completed.size;
  const percent = roadmap.progress?.percentage ?? (total ? Math.round(done / total * 100) : 0);

  return <main className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
    <Link to={routes.explore()} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft size={16} aria-hidden="true" />Back to Explore</Link>
    <header className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex items-start gap-4"><div className="rounded-2xl bg-violet-50 p-3 text-violet-700"><GraduationCap size={28} aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Saved learning roadmap</p><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{roadmap.course?.title || roadmap.canonicalTopic || roadmap.query || "Learning roadmap"}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{roadmap.course?.description || "Follow these lessons in order and track your progress."}</p><p className="mt-3 text-sm text-slate-500">{roadmap.level || "Self-paced"} · {done} of {total} lessons completed</p></div></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Roadmap progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: percent + "%" }} /></div>
    </header>
    <section className="mt-7 space-y-4" aria-label="Roadmap modules">
      {modules.length ? modules.map((module, moduleIndex) => <article key={moduleIndex} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-slate-950">{module.title || `Module ${moduleIndex + 1}`}</h2>{module.description && <p className="mt-1 text-sm text-slate-600">{module.description}</p>}<ol className="mt-4 space-y-2">{(module.lessons ?? []).map((lesson, lessonIndex) => {const id = String(lesson.id ?? lesson.lessonId ?? "");const isDone = id ? completed.has(id) : false;const video = lesson.tutorial?.videos?.[0]?.url;return <li key={id || lessonIndex} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><span className={isDone ? "mt-0.5 text-emerald-600" : "mt-0.5 text-slate-400"}>{isDone ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}</span><div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{lesson.title || `Lesson ${lessonIndex + 1}`}</p><p className="mt-1 text-xs text-slate-500">{lesson.type || "Lesson"}{isDone ? " · Completed" : ""}</p></div>{video && <a href={video} target="_blank" rel="noreferrer" className="text-sm font-semibold text-violet-700 underline">Open resource</a>}</li>;})}</ol></article>) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center"><p className="font-semibold text-slate-900">No modules are available yet</p><p className="mt-2 text-sm text-slate-600">This roadmap was saved, but its module list is empty.</p></div>}
    </section>
  </main>;
}
