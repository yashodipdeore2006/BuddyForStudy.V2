import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, FileText, Github, Link as LinkIcon, Loader2, Plus, RefreshCcw, Save, Trash2, Video } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminPagination } from "@/components/admin/AdminUI";

type TutorialEditor = {
  lessonId: string;
  sourceType: "video" | "playlist";
  title?: string;
  url: string;
  saving: boolean;
  error: string;
  success: string;
};

type ModuleForm = {
  title: string;
  description: string;
  saving: boolean;
  error: string;
};

type ResourceForm = {
  title: string;
  url: string;
  type: "link" | "document" | "repository" | "article";
  saving: boolean;
  error: string;
};

type LearningItemForm = {
  title: string;
  type: "tutorial" | "project" | "quiz";
  saving: boolean;
  error: string;
};

type CourseMetaForm = {
  title: string;
  description: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  duration: string;
  thumbnail: string;
  learningOutcomes: string;
  saving: boolean;
  error: string;
};

function isYouTubePlaylistUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "youtube.com" || host === "m.youtube.com") && Boolean(parsed.searchParams.get("list"));
  } catch {
    return false;
  }
}

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

type RoadmapStage = {
  id?: string;
  title?: string;
  emoji?: string;
  skills?: string[] | string;
  outcome?: string;
  lessonIds?: string[];
  hours?: number;
};

type CourseResource = {
  _id: string;
  title?: string;
  url?: string;
  type?: ResourceForm["type"];
};

type CourseVideo = { url?: string; title?: string; videoId?: string; duration?: string };

type CourseLesson = {
  _id: string;
  title?: string;
  type: LearningItemForm["type"];
  tutorial?: { videos?: CourseVideo[]; [key: string]: unknown };
};

type CourseModule = {
  _id: string;
  title?: string;
  description?: string;
  order?: number;
  lessons?: CourseLesson[];
  resources?: CourseResource[];
};

type AdminCourseRecord = {
  _id: string;
  title?: string;
  slug?: string;
  description?: string;
  category?: string;
  level?: CourseMetaForm["level"];
  duration?: string | number;
  thumbnail?: string | null;
  learningOutcomes?: string[];
  isPublished?: boolean;
  enrollmentEnabled?: boolean;
  certificateEnabled?: boolean;
  featured?: boolean;
  pricing?: { mode?: string; price?: number; currency?: string };
  roadmap?: { stages?: RoadmapStage[]; [key: string]: unknown };
  modules?: CourseModule[];
};

type CourseReadinessCheck = { key: string; label: string; fix?: string };
type CourseReadiness = {
  ready?: boolean;
  error?: string;
  failedChecks?: CourseReadinessCheck[];
  passedCount?: number;
  totalChecks?: number;
};

export default function AdminCoursesPro() {
  const [courses, setCourses] = useState<AdminCourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [courseDetails, setCourseDetails] = useState<Record<string, AdminCourseRecord>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [editors, setEditors] = useState<Record<string, TutorialEditor>>({});
  const [moduleForms, setModuleForms] = useState<Record<string, ModuleForm>>({});
  const [newModuleForms, setNewModuleForms] = useState<Record<string, ModuleForm>>({});
  const [resourceForms, setResourceForms] = useState<Record<string, ResourceForm>>({});
  const [courseMetaForms, setCourseMetaForms] = useState<Record<string, CourseMetaForm>>({});
  const [roadmapDrafts, setRoadmapDrafts] = useState<Record<string, RoadmapStage[]>>({});
  const [roadmapSaving, setRoadmapSaving] = useState<Record<string, boolean>>({});
  const [roadmapMessages, setRoadmapMessages] = useState<Record<string, string>>({});
  const [learningItemForms, setLearningItemForms] = useState<Record<string, LearningItemForm>>({});
  const [courseQuery, setCourseQuery] = useState("");
  const [readinessResults, setReadinessResults] = useState<Record<string, CourseReadiness>>({});
  const [readinessLoading, setReadinessLoading] = useState<Record<string, boolean>>({});
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const canManageCourses = permissions.includes("courses.manage");
  const canPublishCourses = permissions.includes("courses.publish");

  const load = useCallback(async (query = courseQuery, selectedPage = page, selectedLimit = limit) => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(selectedPage), limit: String(selectedLimit) });
      if (query.trim()) params.set("q", query.trim());
      const data = await adminFetch("/api/admin/courses?" + params.toString());
      setCourses(data.courses || []);
      setTotal(Number(data.total || 0));
      setPages(Math.max(1, Number(data.pages || 1)));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load courses.");
    } finally {
      setLoading(false);
    }
  }, [courseQuery, page, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void adminFetch("/api/admin/access")
      .then((data) => {
        if (!cancelled) setPermissions(Array.isArray(data.access?.permissions) ? data.access.permissions : []);
      })
      .catch(() => { if (!cancelled) setPermissions([]); })
      .finally(() => { if (!cancelled) setPermissionsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function checkReadiness(courseId: string) {
    setReadinessLoading(current => ({ ...current, [courseId]: true }));
    try {
      const data = await adminFetch("/api/admin/courses/" + courseId + "/readiness");
      setReadinessResults(current => ({ ...current, [courseId]: data.readiness }));
    } catch (error) {
      setReadinessResults(current => ({ ...current, [courseId]: { error: error instanceof Error ? error.message : "Unable to check readiness" } }));
    } finally { setReadinessLoading(current => ({ ...current, [courseId]: false })); }
  }
  async function save(c: AdminCourseRecord, patch: Record<string, unknown>) {
    setLoadError("");
    try {
      await adminFetch(`/api/admin/courses/${c._id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to save course controls.");
    }
  }

  async function publishCourse(c: AdminCourseRecord) {
    setReadinessLoading(current => ({ ...current, [c._id]: true }));
    try {
      const check = await adminFetch("/api/admin/courses/" + c._id + "/readiness");
      setReadinessResults(current => ({ ...current, [c._id]: check.readiness }));
      if (!check.readiness?.ready) return;
      await adminFetch("/api/admin/courses/" + c._id + "/publish", {
        method: "POST",
        body: JSON.stringify({ reason: "Admin published after readiness preflight" }),
      });
      await load();
    } catch (error) {
      const readiness = error && typeof error === "object" && "readiness" in error ? error.readiness as CourseReadiness : undefined;
      if (readiness) setReadinessResults(current => ({ ...current, [c._id]: readiness }));
      else setReadinessResults(current => ({ ...current, [c._id]: { error: error instanceof Error ? error.message : "Unable to publish course" } }));
    } finally {
      setReadinessLoading(current => ({ ...current, [c._id]: false }));
    }
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
      setRoadmapDrafts((current) => ({ ...current, [courseId]: Array.isArray(data.course?.roadmap?.stages) ? data.course.roadmap.stages : [] }));
    } finally {
      setDetailLoading((current) => ({ ...current, [courseId]: false }));
    }
  }

  function setVideoUrl(editorKey: string, url: string) {
    setEditors((current) => ({
      ...current,
      [editorKey]: {
        ...(current[editorKey] || {}),
        lessonId: current[editorKey]?.lessonId || "",
        sourceType: current[editorKey]?.sourceType || (isYouTubePlaylistUrl(url) ? "playlist" : "video"),
        url,
        saving: false,
        error: "",
        success: "",
      },
    }));
  }

  function courseMeta(course: AdminCourseRecord): CourseMetaForm {
    return courseMetaForms[course._id] || {
      title: course.title || "",
      description: course.description || "",
      category: course.category || "",
      level: course.level || "Beginner",
      duration: course.duration || "",
      thumbnail: course.thumbnail || "",
      learningOutcomes: Array.isArray(course.learningOutcomes) ? course.learningOutcomes.join("\n") : "",
      saving: false,
      error: "",
    };
  }

  async function saveCourseMeta(courseId: string, course: AdminCourseRecord) {
    const form = courseMeta(course);
    const missingFields = [
      !form.title.trim() && "title",
      !form.description.trim() && "description",
      !form.category.trim() && "category",
      !form.duration.trim() && "duration",
    ].filter(Boolean);
    if (missingFields.length) {
      setCourseMetaForms((current) => ({
        ...current,
        [courseId]: {
          ...form,
          saving: false,
          error: "Complete the required course fields: " + missingFields.join(", ") + ".",
        },
      }));
      return;
    }

    setCourseMetaForms((current) => ({ ...current, [courseId]: { ...form, saving: true, error: "" } }));
    try {
      const data = await adminFetch("/api/admin/courses/" + courseId, {
        method: "PUT",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          level: form.level,
          duration: form.duration.trim(),
          thumbnail: form.thumbnail.trim(),
          learningOutcomes: form.learningOutcomes.split("\n").map((item) => item.trim()).filter(Boolean),
          reason: "Admin course metadata update",
        }),
      });
      patchDetail(courseId, data.course);
      await load();
      setCourseMetaForms((current) => ({ ...current, [courseId]: { ...form, saving: false, error: "" } }));
    } catch (error) {
      setCourseMetaForms((current) => ({
        ...current,
        [courseId]: {
          ...form,
          saving: false,
          error: error instanceof Error ? error.message : "Unable to save course metadata",
        },
      }));
    }
  }

  function patchRoadmapStage(courseId: string, stageIndex: number, patch: Record<string, unknown>) {
    setRoadmapDrafts((current) => ({
      ...current,
      [courseId]: (current[courseId] || []).map((stage, index) => index === stageIndex ? { ...stage, ...patch } : stage),
    }));
  }

  async function saveRoadmap(courseId: string) {
    const stages = roadmapDrafts[courseId] || [];
    setRoadmapSaving((current) => ({ ...current, [courseId]: true }));
    setRoadmapMessages((current) => ({ ...current, [courseId]: "" }));
    try {
      const data = await adminFetch("/api/admin/courses/" + courseId + "/roadmap", { method: "PUT", body: JSON.stringify({ stages: stages.map((stage, index) => ({ ...stage, order: index + 1, skills: String(Array.isArray(stage.skills) ? stage.skills.join(", ") : stage.skills || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 3) })) }) });
      setRoadmapDrafts((current) => ({ ...current, [courseId]: data.roadmap?.stages || stages }));
      setRoadmapMessages((current) => ({ ...current, [courseId]: "Roadmap saved." }));
      const detail = courseDetails[courseId];
      if (detail) patchDetail(courseId, { ...detail, roadmap: data.roadmap });
    } catch (error) { setRoadmapMessages((current) => ({ ...current, [courseId]: error instanceof Error ? error.message : "Unable to save roadmap." })); }
    finally { setRoadmapSaving((current) => ({ ...current, [courseId]: false })); }
  }

  async function regenerateRoadmap(courseId: string) {
    setRoadmapSaving((current) => ({ ...current, [courseId]: true }));
    setRoadmapMessages((current) => ({ ...current, [courseId]: "" }));
    try {
      const data = await adminFetch("/api/admin/courses/" + courseId + "/roadmap/regenerate", { method: "POST", body: JSON.stringify({}) });
      setRoadmapDrafts((current) => ({ ...current, [courseId]: data.roadmap?.stages || [] }));
      const detail = courseDetails[courseId];
      if (detail) patchDetail(courseId, { ...detail, roadmap: data.roadmap });
      setRoadmapMessages((current) => ({ ...current, [courseId]: "Roadmap regenerated. AI metadata is used when configured; review and save any edits." }));
    } catch (error) { setRoadmapMessages((current) => ({ ...current, [courseId]: error instanceof Error ? error.message : "Unable to regenerate roadmap." })); }
    finally { setRoadmapSaving((current) => ({ ...current, [courseId]: false })); }
  }

  function patchDetail(courseId: string, course: AdminCourseRecord) {
    setCourseDetails((current) => ({ ...current, [courseId]: course }));
  }

  function moduleForm(module: CourseModule): ModuleForm {
    return moduleForms[module._id] || {
      title: module.title || "",
      description: module.description || "",
      saving: false,
      error: "",
    };
  }

  function newModuleForm(courseId: string): ModuleForm {
    return newModuleForms[courseId] || {
      title: "",
      description: "",
      saving: false,
      error: "",
    };
  }

  function resourceForm(moduleId: string): ResourceForm {
    return resourceForms[moduleId] || {
      title: "",
      url: "",
      type: "link",
      saving: false,
      error: "",
    };
  }

  function learningItemForm(moduleId: string): LearningItemForm {
    return learningItemForms[moduleId] || {
      title: "",
      type: "tutorial",
      saving: false,
      error: "",
    };
  }

  async function addLearningItem(courseId: string, module: CourseModule) {
    const form = learningItemForm(module._id);
    if (!form.title.trim()) return;

    setLearningItemForms((current) => ({
      ...current,
      [module._id]: { ...form, saving: true, error: "" },
    }));

    try {
      const data = await adminFetch(
        `/api/admin/courses/${courseId}/modules/${module._id}/lessons`,
        {
          method: "POST",
          body: JSON.stringify({ title: form.title.trim(), type: form.type }),
        }
      );
      patchDetail(courseId, data.course);
      setLearningItemForms((current) => ({
        ...current,
        [module._id]: { title: "", type: form.type, saving: false, error: "" },
      }));
    } catch (error) {
      setLearningItemForms((current) => ({
        ...current,
        [module._id]: {
          ...form,
          saving: false,
          error: error instanceof Error ? error.message : "Unable to add learning item",
        },
      }));
    }
  }

  async function addModule(courseId: string) {
    const form = newModuleForm(courseId);
    if (!form.title.trim()) return;

    setNewModuleForms((current) => ({
      ...current,
      [courseId]: { ...form, saving: true, error: "" },
    }));

    try {
      const data = await adminFetch(`/api/admin/courses/${courseId}/modules`, {
        method: "POST",
        body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() }),
      });
      patchDetail(courseId, data.course);
      setNewModuleForms((current) => ({
        ...current,
        [courseId]: { title: "", description: "", saving: false, error: "" },
      }));
    } catch (error) {
      setNewModuleForms((current) => ({
        ...current,
        [courseId]: {
          ...form,
          saving: false,
          error: error instanceof Error ? error.message : "Unable to add module",
        },
      }));
    }
  }

  async function updateModule(courseId: string, module: CourseModule) {
    const form = moduleForm(module);
    if (!form.title.trim()) return;

    setModuleForms((current) => ({
      ...current,
      [module._id]: { ...form, saving: true, error: "" },
    }));

    try {
      const data = await adminFetch(`/api/admin/courses/${courseId}/modules/${module._id}`, {
        method: "PUT",
        body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() }),
      });
      patchDetail(courseId, data.course);
      setModuleForms((current) => ({
        ...current,
        [module._id]: { ...form, saving: false, error: "" },
      }));
    } catch (error) {
      setModuleForms((current) => ({
        ...current,
        [module._id]: {
          ...form,
          saving: false,
          error: error instanceof Error ? error.message : "Unable to update module",
        },
      }));
    }
  }

  async function deleteModule(courseId: string, module: CourseModule) {
    if (!window.confirm(`Remove module "${module.title}" and all its lessons/resources?`)) return;

    try {
      const data = await adminFetch(`/api/admin/courses/${courseId}/modules/${module._id}`, {
        method: "DELETE",
      });
      patchDetail(courseId, data.course);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to remove module");
    }
  }

  async function addVideoToModule(courseId: string, module: CourseModule) {
    const key = `add-video:${module._id}`;
    const editor = editors[key];
    if (!editor?.url.trim()) return;

    setEditors((current) => ({
      ...current,
      [key]: { ...editor, saving: true, error: "", success: "" },
    }));

    try {
      const data = await adminFetch(
        `/api/admin/courses/${courseId}/modules/${module._id}/videos`,
        {
          method: "POST",
          body: JSON.stringify({
            resourceUrl: editor.url.trim(),
            title: editor.title?.trim() || "",
          }),
        }
      );
      patchDetail(courseId, data.course);
      setEditors((current) => ({
        ...current,
        [key]: {
          ...editor,
          url: "",
          title: "",
          saving: false,
          error: "",
          success: data.mode === "playlist"
            ? `Added ${data.addedCount} playlist videos`
            : "Video added to module",
        },
      }));
    } catch (error) {
      setEditors((current) => ({
        ...current,
        [key]: {
          ...editor,
          saving: false,
          error: error instanceof Error ? error.message : "Unable to add video",
          success: "",
        },
      }));
    }
  }

  async function deleteLesson(courseId: string, module: CourseModule, lesson: CourseLesson) {
    if (!window.confirm(`Remove "${lesson.title}" from "${module.title}"?`)) return;
    try {
      const data = await adminFetch(
        `/api/admin/courses/${courseId}/modules/${module._id}/lessons/${lesson._id}`,
        { method: "DELETE" }
      );
      patchDetail(courseId, data.course);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to remove learning item");
    }
  }

  async function addModuleResource(courseId: string, module: CourseModule) {
    const form = resourceForm(module._id);
    if (!form.title.trim() || !form.url.trim()) return;

    setResourceForms((current) => ({
      ...current,
      [module._id]: { ...form, saving: true, error: "" },
    }));

    try {
      const data = await adminFetch(
        `/api/admin/courses/${courseId}/modules/${module._id}/resources`,
        {
          method: "POST",
          body: JSON.stringify({ title: form.title.trim(), url: form.url.trim(), type: form.type }),
        }
      );
      patchDetail(courseId, data.course);
      setResourceForms((current) => ({
        ...current,
        [module._id]: { title: "", url: "", type: form.type, saving: false, error: "" },
      }));
    } catch (error) {
      setResourceForms((current) => ({
        ...current,
        [module._id]: {
          ...form,
          saving: false,
          error: error instanceof Error ? error.message : "Unable to add resource",
        },
      }));
    }
  }

  async function deleteModuleResource(courseId: string, module: CourseModule, resource: CourseResource) {
    if (!window.confirm(`Remove module resource "${resource.title}"?`)) return;
    try {
      const data = await adminFetch(
        `/api/admin/courses/${courseId}/modules/${module._id}/resources/${resource._id}`,
        { method: "DELETE" }
      );
      patchDetail(courseId, data.course);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to remove resource");
    }
  }

  async function updateTutorialVideo(
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
      <AdminPageHeader
        title={openCourseId ? (courses.find((item) => item._id === openCourseId)?.title || "Course editor") : "Course management"}
        description={openCourseId
          ? "Edit course information and maintain its curriculum in one focused workspace."
          : "Find a course, review publishing readiness, and open one course at a time to edit its curriculum."}
        actions={openCourseId ? (
          <button type="button" className="btn-secondary" onClick={() => setOpenCourseId(null)}>
            <ChevronRight className="h-4 w-4 rotate-180" /> Back to course catalogue
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => { setPage(1); void load(courseQuery, 1, limit); }} disabled={loading}>
            <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh courses
          </button>
        )}
      />

      {!permissionsLoading && !canManageCourses && <div role="status" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Read-only catalog access. Course editing, pricing, enrollment controls and curriculum changes are hidden because your role does not have course-management permission.</div>}
      {loadError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}
      {!openCourseId && <div className="card mt-6 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            aria-label="Search courses by title or category"
            className="input-field flex-1"
            value={courseQuery}
            maxLength={100}
            onChange={(e) => setCourseQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Search courses by title or category"
          />
          <button type="button" className="btn-primary" onClick={() => { setPage(1); void load(courseQuery, 1, limit); }} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            Search courses
          </button>
          <button type="button" aria-label="Clear course search" className="btn-secondary" onClick={() => { setCourseQuery(""); void load(""); }}>
            Clear
          </button>
        </div>
      </div>}

      <div className="mt-6 space-y-4">
        {loading ? (
          <div role="status" aria-live="polite" aria-label="Loading courses" className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <RefreshCcw className="mx-auto animate-spin text-slate-400" /><span className="sr-only">Loading courses</span>
          </div>
        ) : courses.length === 0 ? (
          <div role="status" aria-live="polite" className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            No courses found.
          </div>
        ) : (
          courses.filter((course) => !openCourseId || course._id === openCourseId).map((course) => {
            const open = openCourseId === course._id;
            const detail = courseDetails[course._id];
            const newModuleFormValue = newModuleForm(course._id);

            return (
              <div key={course._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-5">
                  {readinessResults[course._id] && <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {readinessResults[course._id].error ? <p role="alert" className="text-sm text-red-700">{readinessResults[course._id].error}</p> : <>
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{readinessResults[course._id].ready ? "Ready for publishing review" : "Publishing checklist needs attention"}</p><span className="text-xs text-slate-500">{readinessResults[course._id].passedCount}/{readinessResults[course._id].totalChecks} checks passed</span></div>
                      {readinessResults[course._id].failedChecks.length > 0 && <div className="mt-3 space-y-2">{readinessResults[course._id].failedChecks.map((check: CourseReadinessCheck) => <div key={check.key} className="rounded-lg border border-amber-200 bg-white p-3"><p className="flex items-start gap-2 text-sm font-semibold text-slate-900"><span className="mt-0.5 text-amber-600">!</span><span>{check.label}</span></p><p className="mt-1 pl-5 text-sm leading-5 text-slate-600">{check.fix || "Review this requirement and complete the missing information."}</p><p className="mt-2 pl-5 text-xs font-semibold text-blue-700">Where to fix: {["quizContent","tutorialContent","projectContent","moduleTitles","lessonTitles","lessonTypes","modules","lessons"].includes(check.key) ? "Manage Curriculum" : "Course details / pricing controls"}</p></div>)}</div>}
                    </>}
                  </div>}
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-slate-950">{course.title}</h2>
                      <p className="text-sm text-slate-500">{course.category} · {course.level}</p>
                    </div>

                    <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => void checkReadiness(course._id)} disabled={Boolean(readinessLoading[course._id])}>
                      {readinessLoading[course._id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {readinessLoading[course._id] ? "Checking…" : "Readiness"}
                    </button>
                    {canManageCourses && canPublishCourses ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" aria-label={"Publish " + course.title} checked={course.isPublished} disabled={Boolean(readinessLoading[course._id])} onChange={(e) => e.target.checked ? void publishCourse(course) : void save(course, { isPublished: false })} />
                        Published
                      </label>
                    ) : <span className="text-sm text-slate-500">{course.isPublished ? "Published" : "Draft"}</span>}

                    {canManageCourses && <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" aria-label={`Feature ${course.title}`} checked={course.featured} onChange={(e) => save(course, { featured: e.target.checked })} />
                      Featured
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" aria-label={`Enable enrollment for ${course.title}`} checked={course.enrollmentEnabled !== false} onChange={(e) => save(course, { enrollmentEnabled: e.target.checked })} />
                      Enrollment enabled
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" aria-label={`Enable certificates for ${course.title}`} checked={course.certificateEnabled !== false} onChange={(e) => save(course, { certificateEnabled: e.target.checked })} />
                      Certificates enabled
                    </label>

                    <select
                      aria-label={`Pricing mode for ${course.title}`}
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
                      Manage Curriculum
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    </>}
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
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Course information</p>
                              <h3 className="mt-1 text-lg font-extrabold text-slate-950">Edit course metadata</h3>
                            </div>
                            <p className="text-xs text-slate-400">Changes are audited and reflected on learner-facing course pages.</p>
                          </div>
                          {(() => {
                            const meta = courseMeta(detail);
                            const patch = (next: Partial<CourseMetaForm>) => setCourseMetaForms((current) => ({
                              ...current,
                              [detail._id]: { ...meta, ...next, error: "" },
                            }));
                            return (
                              <>
                                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                  <input className="input-field" placeholder="Course title" value={meta.title} onChange={(e) => patch({ title: e.target.value })} />
                                  <input className="input-field" placeholder="Category" value={meta.category} onChange={(e) => patch({ category: e.target.value })} />
                                  <select className="input-field" value={meta.level} onChange={(e) => patch({ level: e.target.value as CourseMetaForm["level"] })}>
                                    <option value="Beginner">Beginner</option>
                                    <option value="Intermediate">Intermediate</option>
                                    <option value="Advanced">Advanced</option>
                                  </select>
                                  <input className="input-field" placeholder="Duration" value={meta.duration} onChange={(e) => patch({ duration: e.target.value })} />
                                  <input className="input-field lg:col-span-2" placeholder="Thumbnail URL" value={meta.thumbnail} onChange={(e) => patch({ thumbnail: e.target.value })} />
                                  <textarea className="input-field lg:col-span-2 min-h-24" placeholder="Description" value={meta.description} onChange={(e) => patch({ description: e.target.value })} />
                                  <textarea className="input-field lg:col-span-2 min-h-24" placeholder="Learning outcomes — one per line" value={meta.learningOutcomes} onChange={(e) => patch({ learningOutcomes: e.target.value })} />
                                </div>
                                {meta.error && <p className="mt-2 text-xs font-semibold text-red-600">{meta.error}</p>}
                                <button type="button" className="btn-primary mt-4" onClick={() => void saveCourseMeta(detail._id, detail)} disabled={meta.saving}>
                                  {meta.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  Save course information
                                </button>
                              </>
                            );
                          })()}
                        </div>

                        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Journey roadmap</p><h3 className="mt-1 text-lg font-bold text-slate-950">Milestones for learners</h3><p className="mt-1 text-xs text-slate-600">Edit the short journey stages shown on the course detail page. Every lesson must belong to one stage.</p></div>
                            <button type="button" className="btn-secondary" onClick={() => void regenerateRoadmap(course._id)} disabled={Boolean(roadmapSaving[course._id])}>{roadmapSaving[course._id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}Regenerate with AI</button>
                          </div>
                          {(roadmapDrafts[course._id] || detail.roadmap?.stages || []).length === 0 ? <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">Roadmap stages will be generated when this course has lessons.</p> : <div className="mt-4 space-y-3">
                            {(roadmapDrafts[course._id] || detail.roadmap?.stages || []).map((stage: RoadmapStage, stageIndex: number) => <div key={stage.id || stageIndex} className="grid gap-3 rounded-xl border border-violet-100 bg-white p-3">
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]"><label className="text-xs font-semibold text-slate-600">Stage {stageIndex + 1} title<input className="input-field mt-1" maxLength={100} value={stage.title || ""} onChange={(event) => patchRoadmapStage(course._id, stageIndex, { title: event.target.value })} /></label><label className="text-xs font-semibold text-slate-600">Emoji<input className="input-field mt-1" maxLength={12} value={stage.emoji || ""} onChange={(event) => patchRoadmapStage(course._id, stageIndex, { emoji: event.target.value })} /></label></div>
                              <label className="text-xs font-semibold text-slate-600">Skills (comma-separated)<input className="input-field mt-1" value={Array.isArray(stage.skills) ? stage.skills.join(", ") : stage.skills || ""} onChange={(event) => patchRoadmapStage(course._id, stageIndex, { skills: event.target.value })} placeholder="Skill one, Skill two, Skill three" /></label>
                              <label className="text-xs font-semibold text-slate-600">Outcome<textarea className="input-field mt-1 min-h-20" maxLength={1000} value={stage.outcome || ""} onChange={(event) => patchRoadmapStage(course._id, stageIndex, { outcome: event.target.value })} placeholder="What the learner will be able to build or do" /></label>
                              <p className="text-xs text-slate-500">{(stage.lessonIds || []).length} assigned lessons · {Number(stage.hours || 0)} h</p>
                            </div>)}
                          </div>}
                          {roadmapMessages[course._id] && <p role="status" className="mt-3 text-sm text-slate-700">{roadmapMessages[course._id]}</p>}
                          <button type="button" className="btn-primary mt-4" onClick={() => void saveRoadmap(course._id)} disabled={Boolean(roadmapSaving[course._id]) || !(roadmapDrafts[course._id] || detail.roadmap?.stages || []).length}>{roadmapSaving[course._id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save roadmap</button>
                        </section>

                        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Add module</p>
                          <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1.4fr_auto]">
                            <input
                              className="input-field"
                              placeholder="Module title"
                              value={newModuleFormValue.title}
                              onChange={(e) => setNewModuleForms((current) => ({
                                ...current,
                                [course._id]: { ...newModuleFormValue, title: e.target.value, error: "" },
                              }))}
                            />
                            <input
                              className="input-field"
                              placeholder="Short module description"
                              value={newModuleFormValue.description}
                              onChange={(e) => setNewModuleForms((current) => ({
                                ...current,
                                [course._id]: { ...newModuleFormValue, description: e.target.value, error: "" },
                              }))}
                            />
                            <button
                              type="button"
                              className="btn-primary justify-center"
                              onClick={() => void addModule(course._id)}
                              disabled={newModuleFormValue.saving || !newModuleFormValue.title.trim()}
                            >
                              {newModuleFormValue.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              Add Module
                            </button>
                          </div>
                          {newModuleFormValue.error && <p className="mt-2 text-xs font-semibold text-red-600">{newModuleFormValue.error}</p>}
                        </div>

                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Curriculum editor</p>
                            <h3 className="mt-1 text-xl font-extrabold text-slate-950">Manage every learning resource</h3>
                          </div>
                          <p className="text-xs text-slate-500">Add or remove modules, tutorial videos/playlists, and module resources.</p>
                        </div>

                        {detail.modules?.map((module: CourseModule, moduleIndex: number) => (
                          <div key={module._id || moduleIndex} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-4 py-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                                <BookOpen className="mt-1 h-4 w-4 shrink-0 text-blue-600" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold uppercase tracking-[.12em] text-blue-600">Module {module.order || moduleIndex + 1}</p>
                                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                                    <input
                                      className="input-field"
                                      value={moduleForm(module).title}
                                      onChange={(e) => setModuleForms((current) => ({
                                        ...current,
                                        [module._id]: { ...moduleForm(module), title: e.target.value },
                                      }))}
                                    />
                                    <input
                                      className="input-field"
                                      value={moduleForm(module).description}
                                      onChange={(e) => setModuleForms((current) => ({
                                        ...current,
                                        [module._id]: { ...moduleForm(module), description: e.target.value },
                                      }))}
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void updateModule(course._id, module)}
                                    disabled={moduleForm(module).saving || !moduleForm(module).title.trim()}
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {moduleForm(module).saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Save Module
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteModule(course._id, module)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Remove Module
                                  </button>
                                </div>
                              </div>
                              {moduleForm(module).error && <p className="mt-2 text-xs font-semibold text-red-600">{moduleForm(module).error}</p>}
                            </div>

                            <div className="border-b border-slate-100 bg-blue-50/50 p-4">
                              <div className="flex items-center gap-2">
                                <Plus className="h-4 w-4 text-blue-600" />
                                <div>
                                  <p className="text-sm font-bold text-slate-900">Add video or playlist</p>
                                  <p className="text-xs text-slate-500">A video becomes one lesson. A playlist imports each video as its own lesson.</p>
                                </div>
                              </div>
                              {(() => {
                                const addKey = `add-video:${module._id}`;
                                const addEditor = editors[addKey] || {
                                  sourceType: "video",
                                  url: "",
                                  title: "",
                                  saving: false,
                                  error: "",
                                  success: "",
                                };
                                return (
                                  <div className="mt-3 grid gap-2 lg:grid-cols-[140px_1fr_1fr_auto]">
                                    <select
                                      className="input-field"
                                      value={addEditor.sourceType}
                                      onChange={(e) => setEditors((current) => ({
                                        ...current,
                                        [addKey]: { ...addEditor, sourceType: e.target.value as "video" | "playlist" },
                                      }))}
                                    >
                                      <option value="video">Single Video</option>
                                      <option value="playlist">Playlist</option>
                                    </select>
                                    <input
                                      className="input-field"
                                      placeholder={addEditor.sourceType === "playlist" ? "YouTube playlist URL" : "YouTube video URL"}
                                      value={addEditor.url}
                                      onChange={(e) => setVideoUrl(addKey, e.target.value)}
                                      type="url"
                                    />
                                    <input
                                      className="input-field"
                                      placeholder="Lesson title (video)"
                                      value={addEditor.title || ""}
                                      onChange={(e) => setEditors((current) => ({
                                        ...current,
                                        [addKey]: { ...addEditor, title: e.target.value },
                                      }))}
                                      disabled={addEditor.sourceType === "playlist"}
                                    />
                                    <button
                                      type="button"
                                      className="btn-primary justify-center whitespace-nowrap"
                                      onClick={() => void addVideoToModule(course._id, module)}
                                      disabled={addEditor.saving || !addEditor.url.trim()}
                                    >
                                      {addEditor.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                                      {addEditor.sourceType === "playlist" ? "Import Playlist" : "Add Video"}
                                    </button>
                                    {addEditor.success && <p className="lg:col-span-4 text-xs font-semibold text-green-600">{addEditor.success}</p>}
                                    {addEditor.error && <p className="lg:col-span-4 text-xs font-semibold text-red-600">{addEditor.error}</p>}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="divide-y divide-slate-100">
                              {(module.lessons || []).map((lesson: CourseLesson, lessonIndex: number) => {
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
                                              onClick={() => {
                                                const target = isYouTubePlaylistUrl(editor.url)
                                                  ? { moduleId: String(module._id), editorKey: lesson._id }
                                                  : { lessonId: lesson._id, editorKey: lesson._id };
                                                void updateTutorialVideo(course._id, target);
                                              }}
                                              disabled={editor.saving || !editor.url.trim()}
                                              className="btn-primary justify-center whitespace-nowrap"
                                            >
                                              {editor.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                                              {isYouTubePlaylistUrl(editor.url)
                                                ? "Import Playlist"
                                                : currentVideo
                                                  ? "Replace Video"
                                                  : "Add Video"}
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
                                        <button
                                          type="button"
                                          onClick={() => void deleteLesson(course._id, module, lesson)}
                                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {!(module.lessons || []).some((lesson: CourseLesson) => lesson.type === "tutorial" && lesson.tutorial?.videos?.length) && (
                                (() => {
                                  const editorKey = `module:${module._id || module.order}`;
                                  const editor = editors[editorKey] || {
                                    lessonId: "",
                                    sourceType: "video",
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
                                            <select
                                              value={editor.sourceType}
                                              onChange={(e) => setEditors((current) => ({
                                                ...current,
                                                [editorKey]: { ...current[editorKey], sourceType: e.target.value as "video" | "playlist" },
                                              }))}
                                              className="input-field w-full sm:w-36"
                                              disabled={editor.saving}
                                            >
                                              <option value="video">Single Video</option>
                                              <option value="playlist">Playlist</option>
                                            </select>
                                            <input
                                              value={editor.url}
                                              onChange={(e) => setVideoUrl(editorKey, e.target.value)}
                                              placeholder={editor.sourceType === "playlist"
                                                ? "https://www.youtube.com/playlist?list=..."
                                                : "https://www.youtube.com/watch?v=..."}
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
                                              {editor.sourceType === "playlist" ? "Import Playlist" : "Add Video"}
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

                            <div className="border-t border-slate-200 bg-slate-50 p-4">
                              <div className="flex items-center gap-2">
                                <Plus className="h-4 w-4 text-blue-600" />
                                <div>
                                  <p className="text-sm font-bold text-slate-900">Add learning item</p>
                                  <p className="text-xs text-slate-500">Add a tutorial placeholder, project, or quiz to this module.</p>
                                </div>
                              </div>
                              {(() => {
                                const form = learningItemForm(module._id);
                                return (
                                  <div className="mt-3 grid gap-2 lg:grid-cols-[150px_1fr_auto]">
                                    <select
                                      className="input-field"
                                      value={form.type}
                                      onChange={(e) => setLearningItemForms((current) => ({
                                        ...current,
                                        [module._id]: { ...form, type: e.target.value as LearningItemForm["type"] },
                                      }))}
                                    >
                                      <option value="tutorial">Tutorial</option>
                                      <option value="project">Project</option>
                                      <option value="quiz">Quiz</option>
                                    </select>
                                    <input
                                      className="input-field"
                                      placeholder="Learning item title"
                                      value={form.title}
                                      onChange={(e) => setLearningItemForms((current) => ({
                                        ...current,
                                        [module._id]: { ...form, title: e.target.value },
                                      }))}
                                    />
                                    <button
                                      type="button"
                                      className="btn-primary justify-center whitespace-nowrap"
                                      onClick={() => void addLearningItem(course._id, module)}
                                      disabled={form.saving || !form.title.trim()}
                                    >
                                      {form.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                      Add Item
                                    </button>
                                    {form.error && <p className="lg:col-span-3 text-xs font-semibold text-red-600">{form.error}</p>}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="border-t border-slate-200 bg-white p-4">
                              <div className="flex items-center gap-2">
                                <LinkIcon className="h-4 w-4 text-blue-600" />
                                <div>
                                  <p className="text-sm font-bold text-slate-900">Module resources</p>
                                  <p className="text-xs text-slate-500">Control documentation, repositories, articles, and links for this module.</p>
                                </div>
                              </div>

                              {(module.resources || []).length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {(module.resources || []).map((resource: CourseResource) => {
                                    const Icon =
                                      resource.type === "repository"
                                        ? Github
                                        : resource.type === "document"
                                          ? FileText
                                          : LinkIcon;
                                    return (
                                      <div key={resource._id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-bold text-slate-800">{resource.title}</p>
                                          <p className="truncate text-[11px] text-slate-500">{resource.url}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void deleteModuleResource(course._id, module, resource)}
                                          className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                          title="Remove resource"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {(() => {
                                const form = resourceForm(module._id);
                                return (
                                  <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1.4fr_150px_auto]">
                                    <input
                                      className="input-field"
                                      placeholder="Resource title"
                                      value={form.title}
                                      onChange={(e) => setResourceForms((current) => ({
                                        ...current,
                                        [module._id]: { ...form, title: e.target.value },
                                      }))}
                                    />
                                    <input
                                      className="input-field"
                                      placeholder="https://..."
                                      value={form.url}
                                      onChange={(e) => setResourceForms((current) => ({
                                        ...current,
                                        [module._id]: { ...form, url: e.target.value },
                                      }))}
                                      type="url"
                                    />
                                    <select
                                      className="input-field"
                                      value={form.type}
                                      onChange={(e) => setResourceForms((current) => ({
                                        ...current,
                                        [module._id]: { ...form, type: e.target.value as ResourceForm["type"] },
                                      }))}
                                    >
                                      <option value="link">Link</option>
                                      <option value="document">Document</option>
                                      <option value="repository">Repository</option>
                                      <option value="article">Article</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="btn-primary justify-center whitespace-nowrap"
                                      onClick={() => void addModuleResource(course._id, module)}
                                      disabled={form.saving || !form.title.trim() || !form.url.trim()}
                                    >
                                      {form.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                      Add Resource
                                    </button>
                                    {form.error && <p className="lg:col-span-4 text-xs font-semibold text-red-600">{form.error}</p>}
                                  </div>
                                );
                              })()}
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
        {!openCourseId && <div className="border-t border-slate-100 pt-3">
          <AdminPagination page={page} pages={pages} total={total} from={total ? (page - 1) * limit + 1 : 0} to={Math.min(page * limit, total)} limit={limit} loading={loading} onPageChange={(nextPage) => { setPage(nextPage); void load(courseQuery, nextPage, limit); }} onLimitChange={(nextLimit) => { setLimit(nextLimit); setPage(1); void load(courseQuery, 1, nextLimit); }} />
        </div>}

      </div>
    </div>
  );
}
