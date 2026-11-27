import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { routes } from "@/lib/routes";
import CourseRoadmapExperience from "@/components/CourseRoadmapExperience";
import { buildCourseRoadmapDocument } from "@/lib/courseRoadmap.js";

type RawCourse = Record<string, unknown> & {
  _id?: string;
  id?: string;
  title?: string;
  modules?: Array<{
    _id?: string;
    id?: string;
    title?: string;
    order?: number;
    lessons?: Array<{ _id?: string; id?: string; title?: string; type?: string; order?: number; durationSeconds?: number }>;
  }>;
};

type RawJourneyProgress = {
  completedLessonIds?: string[];
  percent?: number;
  stageProgress?: number[];
  position?: number;
  lastActivityAt?: string | null;
  paceHoursPerDay?: number;
};

type RawJourney = {
  courseId?: string;
  title?: string;
  totalHours?: number;
  stages?: Array<{
    id?: string;
    order?: number;
    title?: string;
    hours?: number;
    lessonIds?: string[];
    skills?: string[];
    outcome?: string;
    emoji?: string;
  }>;
  progress?: RawJourneyProgress | null;
};

type RawProgressResponse = {
  progress?: {
    completedLessons?: Array<{ lessonId?: string }>;
  };
};

export default function CourseRoadmap() {
  const { courseId = "" } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [course, setCourse] = useState<RawCourse | null>(null);
  const [journey, setJourney] = useState<RawJourney | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [savingProgress, setSavingProgress] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [roadmapNotice, setRoadmapNotice] = useState("");

  useEffect(() => {
    if (authLoading || !courseId) return;
    let active = true;
    setLoading(true);
    setCourse(null);
    setJourney(null);
    setCompletedIds(new Set());
    setLoadError("");
    setRoadmapNotice("");

    Promise.allSettled([
      apiFetch<{ course?: RawCourse }>("/api/courses/" + encodeURIComponent(courseId)),
      apiFetch<{ roadmap?: RawJourney }>("/api/courses/" + encodeURIComponent(courseId) + "/roadmap")
    ]).then(([courseResult, journeyResult]) => {
      if (!active) return;
      if (courseResult.status !== "fulfilled" || !courseResult.value?.course) {
        setLoadError("This course is not available or may no longer be published.");
        return;
      }

      const loadedCourse = courseResult.value.course;
      setCourse(loadedCourse);

      if (journeyResult.status === "fulfilled" && journeyResult.value?.roadmap) {
        const loadedJourney = journeyResult.value.roadmap;
        setJourney(loadedJourney);
        setCompletedIds(new Set((loadedJourney.progress?.completedLessonIds || []).map(String).filter(Boolean)));
      } else {
        setJourney({
          courseId,
          title: String(loadedCourse.title || "Course roadmap"),
          totalHours: 0,
          stages: [],
          progress: null
        });
        setRoadmapNotice("The saved phase outline is unavailable. Showing milestones from the published course modules.");
      }
    }).catch(() => {
      if (active) setLoadError("Unable to load this course roadmap. Check your connection and retry.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [courseId, authLoading, session?.user.id]);

  const enrolled = Boolean(journey?.progress);
  const roadmapDocument = useMemo(() => {
    if (!course || !journey) return null;
    return buildCourseRoadmapDocument({
      course,
      roadmap: journey,
      completedIds: [...completedIds],
      enrolled
    });
  }, [course, journey, completedIds, enrolled]);

  const firstIncompleteNode = roadmapDocument?.nodes.find((node) => node.status !== "completed") || null;

  const continueToLesson = (lessonId: string) => {
    if (!enrolled) {
      navigate(routes.course(courseId));
      return;
    }
    navigate(routes.learn(courseId, lessonId));
  };

  const updateLessonCompletion = async (lessonId: string, completed: boolean) => {
    if (!enrolled || savingProgress) {
      throw new Error("Enroll in this course to track lesson progress.");
    }
    setSavingProgress(true);
    try {
      const response = await apiFetch<RawProgressResponse>(
        "/api/progress/" + encodeURIComponent(courseId) + "/items/" + encodeURIComponent(lessonId) + "/complete",
        { method: completed ? "POST" : "DELETE" }
      );
      const serverIds = response.progress?.completedLessons
        ?.map((item) => String(item.lessonId || ""))
        .filter(Boolean);
      if (serverIds) {
        setCompletedIds(new Set(serverIds));
      } else {
        setCompletedIds((current) => {
          const next = new Set(current);
          if (completed) next.add(lessonId);
          else next.delete(lessonId);
          return next;
        });
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unable to update learning progress.");
    } finally {
      setSavingProgress(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="bfs-course-roadmap-page mx-auto min-h-[65vh] max-w-[1180px] px-4 py-8 sm:px-6" role="status" aria-label="Loading course roadmap">
        <div className="mb-6 h-9 w-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-48 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
        </div>
        <div className="mt-8 h-[620px] animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" />
      </main>
    );
  }

  if (loadError || !course || !journey || !roadmapDocument) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 py-12 text-center">
        <AlertCircle className="h-9 w-9 text-rose-500" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-slate-950 dark:text-white">Roadmap unavailable</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{loadError || "This course does not have a roadmap yet."}</p>
        <button type="button" className="btn-primary mt-5" onClick={() => navigate(routes.course(courseId))}>Back to course</button>
      </main>
    );
  }

  return (
    <main className="bfs-course-roadmap-page min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <button
            type="button"
            onClick={() => navigate(routes.course(courseId))}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-violet-300"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to course
          </button>
        </div>
        {roadmapNotice && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{roadmapNotice}
          </p>
        )}
        <CourseRoadmapExperience
          courseId={courseId}
          document={roadmapDocument}
          enrolled={enrolled}
          onEnroll={() => navigate(routes.course(courseId))}
          onContinue={continueToLesson}
          onToggleCompletion={updateLessonCompletion}
        />
        {savingProgress && <span className="sr-only" role="status"><Loader2 className="inline h-4 w-4 animate-spin" /> Saving learning progress</span>}
        {!enrolled && firstIncompleteNode && <span className="sr-only">Enroll to save milestone completion.</span>}
      </div>
    </main>
  );
}
