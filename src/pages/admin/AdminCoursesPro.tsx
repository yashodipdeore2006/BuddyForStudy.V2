import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCcw, Save, Video } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type TutorialEditor = {
  lessonId: string;
  url: string;
  saving: boolean;
  error: string;
  success: string;
};

function youtubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      id = parsed.searchParams.get("v") || "";
      if (!id) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1] || "";
      }
    }
    return id ? `https://www.youtube.com/embed/${id}` : "";
  } catch {
    return "";
  }
}

export default function AdminCoursesPro() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [courseDetails, setCourseDetails] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [editors, setEditors] = useState<Record<string, TutorialEditor>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/courses");
      setCourses(data.courses || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(c: any, patch: any) {
    await adminFetch(`/api/admin/courses/${c._id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function openEditor(courseId: string) {
    if (openCourseId === courseId) {
      setOpenCourseId(null);
      return;
    }

    setOpenCourseId(courseId);
    if (courseDetails[courseId]) return;

    setDetailLoading((current) => ({ ...current, [courseId]: true }));
    try {
      const data = await adminFetch(`/api/admin/courses/${courseId}`);
      setCourseDetails((current) => ({ ...current, [courseId]: data.course }));
    } finally {
      setDetailLoading((current) => ({ ...current, [courseId]: false }));
    }
  }

  function setVideoUrl(lessonId: string, url: string) {
    setEditors((current) => ({
      ...current,
      [lessonId]: {
        lessonId,
        url,
        saving: false,
        error: "",
        success: "",
      },
    }));
  }

  async function updateTutorialResource(
    courseId: string,
    target: { lessonId?: string; moduleId?: string; editorKey: string }
  ) {
    const editor = editors[target.editorKey];
    if (!editor?.url.trim()) return;

    setEditors((current) => ({
      ...current,
      [target.editorKey]: { ...current[target.editorKey], saving: true, error: "", success: "" },
    }));

    try {
      const data = await adminFetch(`/api/admin/courses/${courseId}/tutorial`, {
        method: "PUT",
        body: JSON.stringify({
          ...(target.lessonId ? { lessonId: target.lessonId } : { moduleId: target.moduleId }),
          resourceUrl: editor.url.trim(),
        }),
      });

      setCourseDetails((current) => ({
        ...current,
        [courseId]: data.course,
      }));

      setEditors((current) => ({
        ...current,
        [target.editorKey]: {
          ...current[target.editorKey],
          url: data.lesson?.video?.url || editor.url,
          saving: false,
          error: "",
          success: data.mode === "playlist" ? "Playlist imported as tutorial lessons" : target.lessonId ? "Video updated" : "Tutorial video added",
        },
      }));
    } catch (error) {
      setEditors((current) => ({
        ...current,
        [target.editorKey]: {
          ...current[target.editorKey],
          saving: false,
          success: "",
          error: error instanceof Error ? error.message : "Unable to update video",
        },
      }));
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Course Commerce Control</h1>
          <p className="mt-2 text-slate-500">Publish, feature, price, and update course content.</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <RefreshCcw className="mx-auto animate-spin text-slate-400" />
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            No courses found.
          </div>
        ) : (
          courses.map((course) => {
            const open = openCourseId === course._id;
            const detail = courseDetails[course._id];

            return (
              <div key={course._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-slate-950">{course.title}</h2>
                      <p className="text-sm text-slate-500">{course.category} · {course.level}</p>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={course.isPublished} onChange={(e) => save(course, { isPublished: e.target.checked })} />
                      Published
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={course.featured} onChange={(e) => save(course, { featured: e.target.checked })} />
                      Featured
                    </label>

                    <select
                      className="input-field w-auto"
                      value={course.pricing?.mode || "free"}
                      onChange={(e) => save(course, { pricing: { ...course.pricing, mode: e.target.value } })}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </select>

                    {course.pricing?.mode === "paid" && (
                      <input
                        className="input-field w-32"
                        type="number"
                        min="0"
                        value={course.pricing?.price || 0}
                        onChange={(e) => setCourses((items) => items.map((item) => item._id === course._id
                          ? { ...item, pricing: { ...item.pricing, price: Number(e.target.value) } }
                          : item))}
                      />
                    )}

                    <button className="btn-primary" onClick={() => save(course, { pricing: course.pricing })}>
                      <Save className="h-4 w-4" />
                      Save
                    </button>

                    <button
                      type="button"
                      onClick={() => void openEditor(course._id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Video className="h-4 w-4" />
                      Edit Tutorials
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-slate-200 bg-slate-50 p-5">
                    {detailLoading[course._id] ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading course curriculum...
                      </div>
                    ) : !detail ? (
                      <p className="py-8 text-center text-sm text-red-600">Unable to load course curriculum.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Curriculum editor</p>
                            <h3 className="mt-1 text-xl font-extrabold text-slate-950">Replace tutorial videos</h3>
                          </div>
                          <p className="text-xs text-slate-500">Paste a YouTube video URL for the tutorial you want to replace.</p>
                        </div>

                        {detail.modules?.map((module: any, moduleIndex: number) => (
                          <div key={module._id || moduleIndex} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                              <BookOpen className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-sm font-bold text-slate-900">Module {module.order || moduleIndex + 1}</p>
                                <p className="text-sm text-slate-600">{module.title}</p>
                              </div>
                            </div>

                            <div className="divide-y divide-slate-100">
                              {(module.lessons || []).map((lesson: any, lessonIndex: number) => {
                                const currentVideo = lesson.tutorial?.videos?.[0];
                                const editor = editors[lesson._id] || {
                                  lessonId: lesson._id,
                                  url: currentVideo?.url || "",
                                  saving: false,
                                  error: "",
                                  success: "",
                                };

                                return (
                                  <div key={lesson._id || lessonIndex} className="p-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">{lesson.type}</p>
                                        <p className="mt-1 font-semibold text-slate-900">{lesson.title}</p>

                                        {lesson.type === "tutorial" && currentVideo && (
                                          <a
                                            href={currentVideo.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate text-xs font-semibold text-blue-600 hover:text-blue-700"
                                          >
                                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{currentVideo.url}</span>
                                          </a>
                                        )}
                                      </div>

                                      {lesson.type === "tutorial" && (
                                        <div className="w-full lg:max-w-xl">
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <input
                                              value={editor.url}
                                              onChange={(e) => setVideoUrl(lesson._id, e.target.value)}
                                              placeholder="YouTube video or playlist URL"
                                              className="input-field flex-1"
                                              type="url"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => void updateTutorialVideo(course._id, { lessonId: lesson._id, editorKey: lesson._id })}
                                              disabled={editor.saving || !editor.url.trim()}
                                              className="btn-primary justify-center whitespace-nowrap"
                                            >
                                              {editor.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                                              {currentVideo ? "Replace Resource" : "Add Resource"}
                                            </button>
                                          </div>
                                          {editor.success && <p className="mt-1.5 text-xs font-semibold text-green-600">{editor.success}</p>}
                                          {editor.error && <p className="mt-1.5 text-xs font-semibold text-red-600">{editor.error}</p>}
                                          {youtubeEmbedUrl(editor.url) && (
                                            <p className="mt-1 text-xs text-slate-400">Valid YouTube video link detected.</p>
                                          )}
                                        </div>
                                      )}

                                      {lesson.type !== "tutorial" && (
                                        <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700">
                                          Project lesson — no video replacement
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {!(module.lessons || []).some((lesson: any) => lesson.type === "tutorial" && lesson.tutorial?.videos?.length) && (
                                (() => {
                                  const editorKey = `module:${module._id || module.order}`;
                                  const editor = editors[editorKey] || {
                                    lessonId: "",
                                    url: "",
                                    saving: false,
                                    error: "",
                                    success: "",
                                  };

                                  return (
                                    <div className="bg-blue-50/50 p-4">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-blue-600">No tutorial resource</p>
                                          <p className="mt-1 font-semibold text-slate-900">Add a YouTube video or playlist to this module</p>
                                          <p className="mt-1 text-xs leading-5 text-slate-500">
                                            A video creates one tutorial lesson. A playlist imports its videos as ordered tutorial lessons.
                                          </p>
                                        </div>

                                        <div className="w-full lg:max-w-xl">
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <input
                                              value={editor.url}
                                              onChange={(e) => setVideoUrl(editorKey, e.target.value)}
                                              placeholder="https://www.youtube.com/watch?v=..."
                                              className="input-field flex-1"
                                              type="url"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => void updateTutorialVideo(course._id, { moduleId: String(module._id), editorKey })}
                                              disabled={editor.saving || !editor.url.trim()}
                                              className="btn-primary justify-center whitespace-nowrap"
                                            >
                                              {editor.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                                              Add Video
                                            </button>
                                          </div>
                                          {editor.success && <p className="mt-1.5 text-xs font-semibold text-green-600">{editor.success}</p>}
                                          {editor.error && <p className="mt-1.5 text-xs font-semibold text-red-600">{editor.error}</p>}
                                          {youtubeEmbedUrl(editor.url) && (
                                            <p className="mt-1 text-xs text-slate-400">Valid YouTube video link detected.</p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
