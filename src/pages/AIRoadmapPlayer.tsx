import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, ListVideo, Loader2, Menu, NotebookPen, Play, Search, CheckSquare, FileText, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function AIRoadmapPlayer() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [tab, setTab] = useState<"overview" | "summary">("overview");
  const [tool, setTool] = useState<"notes" | "transcript" | "todo">("notes");
  const [note, setNote] = useState("");
  const [todo, setTodo] = useState("");

  useEffect(() => {
    if (!roadmapId) return;
    apiFetch(`/api/roadmaps/${roadmapId}`)
      .then((data) => setRoadmap(data.roadmap))
      .catch((err) => setError(err.message || "Unable to load course"))
      .finally(() => setLoading(false));
  }, [roadmapId]);

  const lessons = useMemo(() => {
    return (roadmap?.course?.modules || []).flatMap((module: any, moduleIndex: number) =>
      (module.lessons || []).map((lesson: any, lessonIndex: number) => ({
        ...lesson,
        moduleIndex,
        lessonIndex,
        moduleTitle: module.title,
        lessonNumber: lessonIndex + 1
      }))
    );
  }, [roadmap]);

  useEffect(() => {
    if (!selectedLessonId && lessons.length) {
      setSelectedLessonId(roadmap?.lastLessonId || lessons[0].id);
    }
  }, [lessons, roadmap?.lastLessonId, selectedLessonId]);

  const selected = lessons.find((lesson: any) => String(lesson.id || lesson._id) === String(selectedLessonId)) || lessons[0];
  const selectedId = selected ? String(selected.id || selected._id) : "";
  const completed = useMemo(() => new Set(roadmap?.completedLessonIds || []), [roadmap]);
  const completedCount = lessons.filter((lesson: any) => completed.has(String(lesson.id || lesson._id))).length;
  const percentage = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;

  useEffect(() => {
    if (!roadmapId || !selectedId) return;
    const key = `buddy-notes:${roadmapId}:${selectedId}`;
    setNote(localStorage.getItem(key) || "");
    setTodo(localStorage.getItem(`${key}:todo`) || "");
  }, [roadmapId, selectedId]);

  function selectLesson(id: string) {
    setSelectedLessonId(id);
  }

  async function completeLesson() {
    if (!roadmapId || !selectedId || completed.has(selectedId)) return;
    try {
      const data = await apiFetch(`/api/roadmaps/${roadmapId}/lessons/${encodeURIComponent(selectedId)}/complete`, { method: "POST" });
      setRoadmap(data.roadmap);
    } catch (err: any) {
      setError(err.message || "Unable to save progress");
    }
  }

  function saveNote(value: string) {
    setNote(value);
    if (roadmapId && selectedId) localStorage.setItem(`buddy-notes:${roadmapId}:${selectedId}`, value);
  }

  function saveTodo(value: string) {
    setTodo(value);
    if (roadmapId && selectedId) localStorage.setItem(`buddy-notes:${roadmapId}:${selectedId}:todo`, value);
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (error && !roadmap) return <div className="flex min-h-screen items-center justify-center text-red-600">{error}</div>;

  const video = selected?.tutorial?.videos?.[0];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white">
        <div className="flex h-full items-center gap-4 px-4">
          <Link to="/courses" className="flex items-center gap-2 text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Courses</span></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{roadmap?.course?.title}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] text-slate-400">{completedCount}/{lessons.length} learning items</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{ width: `${percentage}%` }} /></div>
              <span className="text-[11px] font-semibold text-slate-500">{percentage}%</span>
            </div>
          </div>
          <Link to="/dashboard" className="hidden rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold sm:block">Dashboard</Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[270px_minmax(0,1fr)_300px]">
        <aside className="hidden overflow-y-auto border-r border-slate-200 bg-white lg:block">
          <div className="sticky top-0 border-b border-slate-200 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Course content</p>
            <p className="mt-1 text-sm font-medium">{lessons.length} lessons</p>
          </div>
          <div className="p-2">
            {lessons.map((lesson: any, index: number) => {
              const id = String(lesson.id || lesson._id);
              const done = completed.has(id);
              const active = id === selectedId;
              return (
                <button key={id} onClick={() => selectLesson(id)} className={`w-full rounded-lg px-3 py-3 text-left transition ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <div className="flex gap-3">
                    {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" /> : <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-400">{index + 1}</span>}
                    <div className="min-w-0">
                      <p className={`text-xs font-medium leading-5 ${active ? "text-blue-700" : "text-slate-700"}`}>{lesson.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{done ? "Completed" : "0% viewed"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 bg-slate-50">
          <div className="mx-auto max-w-4xl">
            {selected ? (
              <>
                <div className="bg-black">
                  {video?.videoId ? (
                    <div className="aspect-video">
                      <iframe className="h-full w-full" src={video.embedUrl || `https://www.youtube.com/embed/${video.videoId}`} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                    </div>
                  ) : <div className="flex aspect-video items-center justify-center text-white">No video available for this lesson.</div>}
                </div>
                <div className="bg-white px-5 py-5 sm:px-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">{selected.moduleTitle}</p>
                      <h1 className="mt-1 text-2xl font-serif text-slate-900">{selected.title}</h1>
                      <p className="mt-2 text-sm text-slate-500">{video?.channelTitle || roadmap?.course?.title}</p>
                    </div>
                    <button onClick={completeLesson} disabled={completed.has(selectedId)} className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${completed.has(selectedId) ? "bg-green-50 text-green-700" : "bg-blue-600 text-white"}`}>
                      {completed.has(selectedId) ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      {completed.has(selectedId) ? "Completed" : "Mark complete"}
                    </button>
                  </div>
                  <div className="mt-5 flex gap-6 border-b border-slate-200">
                    <button onClick={() => setTab("overview")} className={`border-b-2 pb-3 text-sm font-semibold ${tab === "overview" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"}`}>Overview</button>
                    <button onClick={() => setTab("summary")} className={`border-b-2 pb-3 text-sm font-semibold ${tab === "summary" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"}`}>Summary</button>
                  </div>
                  <div className="py-6 text-sm leading-7 text-slate-600">
                    {tab === "overview" ? <p className="whitespace-pre-line">{selected.description || selected.tutorial?.content || "Work through this lesson and mark it complete when you understand the material."}</p> : <p>Use the lesson video, take notes, and complete the lesson before moving to the next item.</p>}
                    {video?.url && <a href={video.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-600"><ExternalLink className="h-3.5 w-3.5" />Open original YouTube video</a>}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </main>

        <aside className="hidden border-l border-slate-200 bg-white xl:block">
          <div className="flex border-b border-slate-200">
            {[
              ["notes", NotebookPen, "Notes"],
              ["transcript", FileText, "Transcript"],
              ["todo", CheckSquare, "To-do"]
            ].map(([id, Icon, label]: any) => (
              <button key={id} onClick={() => setTool(id)} className={`flex flex-1 flex-col items-center gap-1 py-4 text-[11px] font-semibold ${tool === id ? "bg-blue-50 text-blue-600" : "text-slate-400"}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <div className="p-5">
            {tool === "notes" && <>
              <p className="text-xs font-semibold text-slate-400">CURRENT VIDEO</p>
              <textarea value={note} onChange={(e) => saveNote(e.target.value)} placeholder="What do you want to remember for this lesson?" className="mt-4 min-h-48 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-400" />
              <p className="mt-2 text-[11px] text-slate-400">Notes are saved automatically for this lesson.</p>
            </>}
            {tool === "transcript" && <>
              <p className="text-xs font-semibold text-slate-400">TRANSCRIPT</p>
              <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">{selected?.description || "Transcript is not available for this video through the current YouTube integration."}</div>
            </>}
            {tool === "todo" && <>
              <p className="text-xs font-semibold text-slate-400">NEXT ACTION</p>
              <textarea value={todo} onChange={(e) => saveTodo(e.target.value)} placeholder="Write one action to complete after this lesson..." className="mt-4 min-h-36 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-400" />
            </>}
          </div>
        </aside>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-20 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg lg:hidden">
        {lessons.map((lesson: any, index: number) => {
          const id = String(lesson.id || lesson._id);
          return <button key={id} onClick={() => selectLesson(id)} className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs ${id === selectedId ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{index + 1}</button>;
        })}
      </div>

      {error && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white">{error}</div>}
    </div>
  );
}
