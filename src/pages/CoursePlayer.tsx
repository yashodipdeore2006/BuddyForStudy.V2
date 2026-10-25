import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Course, Progress } from "@/types";
import { getAllLessonsFlat, findLessonById, isLessonCompleted, getNavigationLessons } from "@/lib/courseUtils";
import YouTubeEmbedPlayer from "@/components/YouTubeEmbedPlayer";

// Notes editor theme tokens: update these values to rebrand the notes UI.
const NOTE_EDITOR_THEME = {
  primaryAccent: "#6c2bd9",
  secondaryHover: "#5b21b6",
  timestampBackground: "#0d0e12",
  timestampText: "#ffffff",
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
} as const;
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Play, ListChecks, CircleHelp, Menu, X, Loader2, ArrowLeft, AlertCircle, ExternalLink, FileText, Github, Clock3, Trash2, Save } from "lucide-react";
import { classNames } from "@/lib/utils";
import AdvancedAIAssistant from "@/components/AdvancedAIAssistant";
import { routes } from "@/lib/routes";
import {
  courseTimestampNotesKey,
  createTimestampedCourseNote,
  formatMediaTimestamp,
  loadTimestampedCourseNotes,
  parseMediaTimestamp,
  saveTimestampedCourseNotes,
  type TimestampedCourseNote,
} from "@/lib/courseNotes";

type PlayerQuizOption = { id: string; text: string };
type PlayerQuizQuestion = { id: string; question: string; correctOptionId: string; options: PlayerQuizOption[]; explanation?: string; topic?: string };
type PlayerQuizData = { questions: PlayerQuizQuestion[]; quizBankId?: string; quizBankIds?: string[]; passingScore?: number; title?: string; instructions?: string; };
type RawPlayerLesson = { _id?: string; id?: string; [key: string]: unknown };
type RawPlayerModule = { _id?: string; id?: string; lessons?: RawPlayerLesson[]; [key: string]: unknown };
type RawPlayerCourse = {
  _id?: string; id?: string; title: string; slug: string; description: string; category: string;
  level: Course["level"]; duration?: string | number; thumbnail?: string | null;
  learningOutcomes?: string[]; modules?: RawPlayerModule[]; isPublished?: boolean;
  pricing?: Course["pricing"]; createdBy?: string | null; createdAt?: string; updatedAt?: string;
};
type RawPlayerProgress = {
  _id?: string; id?: string; user?: string; user_id?: string; course?: string; course_id?: string;
  completedLessons?: Array<{ lessonId?: string; type?: Course["modules"][number]["lessons"][number]["type"]; completedAt?: string }>;
  completed_count?: number; completedCount?: number; totalLessons?: number; total_lessons?: number;
  percentage?: number; lastLessonId?: string; last_accessed_at?: string | null; lastAccessedAt?: string | null;
  createdAt?: string; updatedAt?: string;
};

function cleanPlayerLessonTitle(title: string, siblingTitles: string[] = []): string {
  const parts = String(title || "").split(/\s*[|•]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return String(title || "").trim();
  const siblings = siblingTitles.map((sibling) => String(sibling || "").split(/\s*[|•]\s*/).map((part) => part.trim()).filter(Boolean));
  let sharedSegments = 0;
  while (
    sharedSegments < parts.length - 1 &&
    siblings.length > 1 &&
    siblings.every((segments) => segments[sharedSegments] && segments[sharedSegments].toLowerCase() === parts[sharedSegments].toLowerCase())
  ) sharedSegments += 1;
  return sharedSegments > 0 ? (parts.slice(sharedSegments).join(" · ").trim() || parts[parts.length - 1]) : parts.join(" · ");
}

function parseDurationValue(value: unknown): number {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return 0;
  const iso = text.match(/^pt(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const clock = text.match(/^\d+(?::\d{1,2}){1,2}$/);
  if (clock) {
    const parts = text.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+)\s*m/);
  const seconds = text.match(/(\d+)\s*s/);
  return Math.round(Number(hours?.[1] || 0) * 3600 + Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0));
}

function getPlayerLessonDurationSeconds(lesson: Course["modules"][number]["lessons"][number]): number {
  if (Number(lesson.durationSeconds) > 0) return Number(lesson.durationSeconds);
  const videos = [...(lesson.tutorial?.videos || []), ...(lesson.project?.videos || [])];
  const videoDuration = videos.reduce((sum, video) => sum + Math.max(0, Number(video.durationSeconds) || parseDurationValue("duration" in video ? video.duration : undefined)), 0);
  return videoDuration || Math.max(0, parseDurationValue((lesson as typeof lesson & { duration?: string }).duration));
}

function formatPlayerDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.round(safe / 60);
  if (minutes < 1) return safe > 0 ? "<1 min" : "";
  if (minutes < 60) return minutes + " min";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? hours + "h " + remaining + "m" : hours + "h";
}

function mapCourse(raw: RawPlayerCourse): Course {
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
    modules: (raw.modules ?? []).map((module: RawPlayerModule) => ({
      ...module,
      id: String(module._id ?? module.id),
      lessons: (module.lessons ?? []).map((lesson: RawPlayerLesson) => ({
        ...lesson,
        id: String(lesson._id ?? lesson.id),
      })),
    })),
    is_published: raw.isPublished ?? true,
    pricing: raw.pricing,
    created_by: raw.createdBy ?? null,
    created_at: raw.createdAt ?? "",
    updated_at: raw.updatedAt ?? "",
  } as Course;
}

function mapProgress(raw: RawPlayerProgress): Progress {
  return {
    id: String(raw._id ?? raw.id),
    user_id: String(raw.user ?? raw.user_id),
    course_id: String(raw.course ?? raw.course_id),
    completed_lessons: (raw.completedLessons ?? []).map((item) => ({
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
  } as Progress;
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
  const [progressUnavailable, setProgressUnavailable] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [quizRetryCount, setQuizRetryCount] = useState(0);
  const [quizData, setQuizData] = useState<PlayerQuizData | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizPassed, setQuizPassed] = useState(false);
  const [quizActionLoading, setQuizActionLoading] = useState(false);
  const [quizActionError, setQuizActionError] = useState("");
  const [practiceQuizData, setPracticeQuizData] = useState<PlayerQuizData | null>(null);
  const [practiceQuizAnswers, setPracticeQuizAnswers] = useState<Record<string, string>>({});
  const [practiceQuizSubmitted, setPracticeQuizSubmitted] = useState(false);
  const [practiceQuizLoading, setPracticeQuizLoading] = useState(false);
  const [practiceQuizError, setPracticeQuizError] = useState("");
  const practiceAutoAttemptRef = useRef("");
  const [lessonTab, setLessonTab] = useState<"lesson" | "progress" | "quiz" | "notes">("lesson");
  const [noteTimestamp, setNoteTimestamp] = useState("");
  const [pausedTimestampSeconds, setPausedTimestampSeconds] = useState<number | null>(null);
  const [playerSeekRequest, setPlayerSeekRequest] = useState<{ seconds: number; id: number } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [timestampNotes, setTimestampNotes] = useState<TimestampedCourseNote[]>([]);
  const [notesStorageReady, setNotesStorageReady] = useState(false);
  const [loadedNotesKey, setLoadedNotesKey] = useState("");
  const [noteError, setNoteError] = useState("");
  const [noteNotice, setNoteNotice] = useState("");
  const [notesLessonFilter, setNotesLessonFilter] = useState("all");
  const [notesSortOrder, setNotesSortOrder] = useState<"recent" | "oldest">("recent");
  const noteEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const noteCharacterLimit = 1000;
  const timestampNotesKey = courseId ? courseTimestampNotesKey(String(session?.user?.id || "anonymous"), courseId) : "";
  const activeLessonCompletedRef = useRef(false);
  const sendPlayerCurationFeedback = async (event: "helpful" | "outdated" | "wrong_level" | "completed" | "abandoned", video: NonNullable<NonNullable<Course["modules"][number]["lessons"][number]["tutorial"]>["videos"]>[number]) => {
    if (!video?.videoId || !courseId || !currentLesson) return;
    const moduleMeta = currentLesson.module as typeof currentLesson.module & { canonicalSkillId?: string; skillIds?: string[] };
    try {
      await apiFetch("/api/ai/curation-feedback", {
        method: "POST",
        body: JSON.stringify({
          event,
          query: course?.title || currentLesson.module.title || "Course lesson",
          resourceId: video.videoId,
          resourceType: "video",
          skillId: moduleMeta.canonicalSkillId || moduleMeta.skillIds?.[0] || currentLesson.module.title,
          courseId
        })
      });
    } catch {
      // Feedback is best-effort and must never block lesson progress.
    }
  };



  useEffect(() => {
    if (!courseId) {
      setError("Invalid course");
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const courseData = await apiFetch(`/api/courses/${courseId}/learn`);
        setCourse(mapCourse(courseData.course));

        try {
          const progressData = await apiFetch(`/api/progress/${courseId}`);
          setProgress(mapProgress(progressData.progress));
          setProgressUnavailable(false);
        } catch {
          // Progress is independently plan-controlled; do not block course access when disabled.
          setProgress(null);
          setProgressUnavailable(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load this course.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [courseId]);

  useEffect(() => {
    setNotesStorageReady(false);
    if (!timestampNotesKey) {
      setTimestampNotes([]);
      setLoadedNotesKey("");
      return;
    }
    setTimestampNotes(loadTimestampedCourseNotes(timestampNotesKey));
    setLoadedNotesKey(timestampNotesKey);
    setNotesStorageReady(true);
  }, [timestampNotesKey]);

  useEffect(() => {
    if (!notesStorageReady || !timestampNotesKey || loadedNotesKey !== timestampNotesKey) return;
    if (!saveTimestampedCourseNotes(timestampNotesKey, timestampNotes)) {
      setNoteError("Notes could not be saved in this browser. Check available storage and try again.");
    }
  }, [loadedNotesKey, notesStorageReady, timestampNotes, timestampNotesKey]);

  const allLessons = useMemo(() => course ? getAllLessonsFlat(course.modules) : [], [course]);
  const currentLesson = useMemo(
    () => course && lessonId ? findLessonById(course.modules, lessonId) : null,
    [course, lessonId]
  );
  const siblingLessonTitles = allLessons.map((lesson) => lesson.title);
  const visibleCourseNotes = useMemo(() => {
    const filtered = notesLessonFilter === "all" ? timestampNotes : timestampNotes.filter((note) => note.lessonId === notesLessonFilter);
    return [...filtered].sort((a, b) => notesSortOrder === "recent"
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [notesLessonFilter, notesSortOrder, timestampNotes]);
  const moduleLessonCounts = (module: Course["modules"][number]) => module.lessons.filter((lesson) => isLessonCompleted(progress?.completed_lessons || [], lesson.id)).length;

  const saveLessonNote = () => {
    if (!currentLesson) return;
    const content = noteDraft.trim();
    const seconds = parseMediaTimestamp(noteTimestamp);
    if (!content) {
      setNoteError("Write a note before saving.");
      return;
    }
    if (seconds === null) {
      setNoteError("Enter a timestamp such as 01:25 or 1:02:15.");
      return;
    }
    const note = createTimestampedCourseNote({
      lessonId: String(currentLesson.lesson.id),
      lessonTitle: cleanPlayerLessonTitle(currentLesson.lesson.title, siblingLessonTitles),
      timestampSeconds: seconds,
      content,
    });
    setTimestampNotes((previous) => [...previous, note].sort((a, b) => a.timestampSeconds - b.timestampSeconds));
    setNoteDraft("");
    setNoteError("");
    setNoteNotice("Timestamped note saved.");
  };

  const formatNoteDraft = (prefix: string, suffix = prefix) => {
    const editor = noteEditorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = noteDraft.slice(start, end) || "text";
    const next = noteDraft.slice(0, start) + prefix + selected + suffix + noteDraft.slice(end);
    setNoteDraft(next);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const deleteLessonNote = (noteId: string) => {
    setTimestampNotes((previous) => previous.filter((note) => note.id !== noteId));
    setNoteNotice("Note removed.");
    setNoteError("");
  };


  useEffect(() => {
    setNoteTimestamp("");
    setNoteDraft("");
    setNoteError("");
    setNoteNotice("");
  }, [courseId, lessonId]);

  useEffect(() => {
    setPracticeQuizData(null);
    setPracticeQuizAnswers({});
    setPracticeQuizSubmitted(false);
    setPracticeQuizError("");
  }, [courseId, lessonId]);

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
      setQuizError("");
      setQuizData(null);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(null);
      if (lessonId) {
        setQuizPassed(isLessonCompleted(progress?.completed_lessons || [], lessonId));
      } else {
        setQuizPassed(false);
      }

      try {
        const data = await apiFetch("/api/ai/quiz", {
          method: "POST",
          body: JSON.stringify({ courseId, lessonId }),
        });
        if (!data?.quiz?.questions?.length) {
          setQuizError("No questions are available yet. BuddyForStudy will try to generate them again when you retry.");
          return;
        }
        setQuizData(data.quiz);
      } catch (err) {
        setQuizError(err instanceof Error ? err.message : "Unable to load this quiz. Try again.");
      } finally {
        setQuizLoading(false);
      }
    }

    void loadQuiz();
  }, [currentLesson?.lesson.type, courseId, lessonId, quizRetryCount]);

  useEffect(() => {
    if (!course || lessonId || allLessons.length === 0) return;
    const targetId =
      progress?.last_lesson_id ||
      allLessons.find((item) => !isLessonCompleted(progress?.completed_lessons || [], item.id))?.id ||
      allLessons[0].id;
    if (courseId && targetId) navigate(routes.learn(courseId, targetId), { replace: true });
  }, [course, lessonId, allLessons, progress, navigate, courseId]);

  const handleNavigate = (id: string) => {
    if (!courseId) return;
    navigate(routes.learn(courseId, id));
    setSidebarOpen(false);
  };

  useEffect(() => {
    const video = currentLesson?.lesson.type === "tutorial" ? currentLesson.lesson.tutorial?.videos?.[0] : null;
    activeLessonCompletedRef.current = lessonId ? isLessonCompleted(progress?.completed_lessons || [], lessonId) : false;
    return () => {
      if (video?.videoId && !activeLessonCompletedRef.current) void sendPlayerCurationFeedback("abandoned", video);
    };
  }, [courseId, lessonId]);

  const handleComplete = async () => {
    if (!courseId || !lessonId || !currentLesson || isLessonCompleted(progress?.completed_lessons || [], lessonId)) return;
    setCompleting(true);
    setError("");
    try {
      const data = await apiFetch(`/api/progress/${courseId}/items/${lessonId}/complete`, { method: "POST" });
      setProgress(mapProgress(data.progress));
      activeLessonCompletedRef.current = true;
      const completedVideo = currentLesson.lesson.type === "tutorial" ? currentLesson.lesson.tutorial?.videos?.[0] : null;
      if (completedVideo?.videoId) void sendPlayerCurationFeedback("completed", completedVideo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark lesson complete.");
    } finally {
      setCompleting(false);
    }
  };

  const handleGeneratePracticeQuiz = async (mode: "generate" | "reattempt" = "generate") => {
    if (!courseId || !lessonId) return;
    setPracticeQuizLoading(true);
    setPracticeQuizError("");
    setPracticeQuizData(null);
    setPracticeQuizAnswers({});
    setPracticeQuizSubmitted(false);
    try {
      let data = await apiFetch("/api/ai/practice-quiz", {
        method: "POST",
        body: JSON.stringify({ courseId, lessonId, mode }),
      });
      if (data.generating) {
        setPracticeQuizError("New questions are being prepared in the background. Waiting for the quiz bank...");
        for (let attempt = 0; attempt < 20 && data.generating; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          data = await apiFetch("/api/ai/practice-quiz", {
            method: "POST",
            body: JSON.stringify({ courseId, lessonId, mode: "generate" }),
          });
          if (data.pendingReview) break;
        }
        if (data.pendingReview) {
          setPracticeQuizError(data.message || "These AI-generated practice questions are waiting for administrator approval.");
          return;
        }
        if (data.generating || !data.quiz) {
          throw new Error("New questions are still being prepared. Please try Generate More again shortly.");
        }
      }
      if (data.pendingReview) {
        setPracticeQuizError(data.message || "These AI-generated practice questions are waiting for administrator approval.");
        return;
      }
      setPracticeQuizError("");
      setPracticeQuizData(data.quiz);
    } catch (err) {
      setPracticeQuizError(err instanceof Error ? err.message : "Unable to generate practice questions.");
    } finally {
      setPracticeQuizLoading(false);
    }
  };

  useEffect(() => {
    if (lessonTab !== "quiz") {
      practiceAutoAttemptRef.current = "";
      return;
    }
    if (!courseId || !lessonId || currentLesson?.lesson.type === "quiz" || practiceQuizLoading) return;
    const attemptKey = courseId + ":" + lessonId;
    if (practiceAutoAttemptRef.current === attemptKey) return;
    practiceAutoAttemptRef.current = attemptKey;
    if (!practiceQuizData) void handleGeneratePracticeQuiz("generate");
  }, [lessonTab, courseId, lessonId, currentLesson?.lesson.type, practiceQuizLoading, practiceQuizData]);


  const handlePracticeQuizSubmit = async () => {
    const quizData = practiceQuizData;
    const questions = quizData?.questions ?? [];
    if (!quizData || !questions.length || questions.some((question: PlayerQuizQuestion) => !practiceQuizAnswers[question.id])) return;
    setPracticeQuizSubmitted(true);
    try {
      if (quizData.quizBankId || quizData.quizBankIds?.length) {
        await apiFetch("/api/ai/practice-quiz/submit", {
          method: "POST",
          body: JSON.stringify({
            courseId,
            lessonId,
            quizBankId: quizData.quizBankId,
            quizBankIds: quizData.quizBankIds || [],
            score: Math.round((questions.filter((question: PlayerQuizQuestion) => practiceQuizAnswers[question.id] === question.correctOptionId).length / questions.length) * 100),
            answers: practiceQuizAnswers
          })
        });
      }
    } catch (err) {
      setPracticeQuizError(err instanceof Error ? err.message : "Quiz score could not be saved.");
    }
  };

  const practiceQuizScore = practiceQuizData?.questions?.length
    ? Math.round((practiceQuizData.questions.filter((question: PlayerQuizQuestion) => practiceQuizAnswers[question.id] === question.correctOptionId).length / practiceQuizData.questions.length) * 100)
    : 0;

  const handleGenerateLessonQuiz = async (mode: "generate" | "reattempt") => {
    if (!courseId || !lessonId || quizActionLoading) return;
    setQuizActionLoading(true);
    setQuizActionError("");
    try {
      let data = await apiFetch("/api/ai/practice-quiz", {
        method: "POST",
        body: JSON.stringify({ courseId, lessonId, mode }),
      });
      if (data.generating) {
        for (let attempt = 0; attempt < 20 && data.generating; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          data = await apiFetch("/api/ai/practice-quiz", {
            method: "POST",
            body: JSON.stringify({ courseId, lessonId, mode: "generate" }),
          });
          if (data.pendingReview) break;
        }
      }
      if (data.pendingReview) throw new Error(data.message || "New quiz questions are waiting for review.");
      if (!data.quiz?.questions?.length) throw new Error(data.message || "No quiz questions are available for this action yet.");
      setQuizData(data.quiz);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizPassed(false);
      setQuizError("");
      setQuizActionError("");
    } catch (err) {
      setQuizActionError(err instanceof Error ? err.message : "Unable to load another quiz.");
    } finally {
      setQuizActionLoading(false);
    }
  };

  const handleQuizSubmit = async () => {
    if (!courseId || !lessonId || !quizData?.questions?.length) return;

    const questions = quizData.questions || [];
    const correct = questions.filter(
      (question: PlayerQuizQuestion) => quizAnswers[question.id] === question.correctOptionId
    ).length;
    const score = Math.round((correct / questions.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);

    const passed = score >= Number(quizData.passingScore || currentLesson?.lesson.quiz?.passingScore || 70);
    setQuizPassed(passed);

    if (quizData.quizBankId || quizData.quizBankIds?.length) {
      try {
        await apiFetch("/api/ai/practice-quiz/submit", {
          method: "POST",
          body: JSON.stringify({
            courseId,
            lessonId,
            quizBankId: quizData.quizBankId,
            quizBankIds: quizData.quizBankIds || [],
            score,
            answers: quizAnswers,
          }),
        });
      } catch (err) {
        setQuizActionError(err instanceof Error ? err.message : "Quiz score could not be saved.");
      }
    }

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
        <Link to={courseId ? routes.course(courseId) : routes.explore()} className="btn-primary mt-6">
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
    <div className="min-h-screen min-w-0 max-w-full overflow-x-clip bg-[#f1f4f7] text-slate-900">
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="flex h-full items-center gap-3 px-4 sm:gap-4">
          <button
            className="inline-flex rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open course content"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Link
            to={courseId ? routes.course(courseId) : routes.explore()}
            className="hidden items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900 sm:flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Course Details
          </Link>

          <div className="min-w-0 flex-1 sm:border-l sm:border-slate-200 sm:pl-4">
            <p className="truncate text-sm font-extrabold text-slate-900">{course.title}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="whitespace-nowrap text-[10px] font-medium text-slate-400">
                {progressUnavailable ? "Progress unavailable on this plan" : `${progress?.completed_count || 0}/${allLessons.length} lessons`}
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

          {currentLesson && currentLesson.lesson.type !== "quiz" && !progressUnavailable && (
            <button
              onClick={handleComplete}
              disabled={completing || currentCompleted}
              className={classNames(
                "inline-flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:text-sm",
                currentCompleted
                  ? "bg-green-50 text-green-700"
                  : "bg-black text-white hover:bg-[#444950]"
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
            to={routes.home()}
            className="hidden rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold transition hover:bg-slate-50 sm:block"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] min-w-0 max-w-full overflow-x-clip lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 max-w-full overflow-x-clip bg-slate-50">
          <div className="mx-auto max-w-5xl">
            {currentLesson ? (
              <>
                {currentLesson.lesson.type === "quiz" && (
                  <section className="border-b border-slate-200 bg-white px-5 py-7 sm:px-8 lg:px-10">
                    <div className="mx-auto max-w-4xl">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-600">
                            {currentLesson.lesson.quiz?.scope === "module" ? "Module assessment" : "Lesson quiz"}
                          </p>
                          <h1 className="mt-1 text-2xl font-medium tracking-tight text-slate-950 sm:text-3xl">
                            {cleanPlayerLessonTitle(currentLesson.lesson.title, siblingLessonTitles)}
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
                          {quizData.questions.map((question: PlayerQuizQuestion, questionIndex: number) => (
                            <article key={question.id} className="rounded-[24px] border border-slate-200 bg-white p-5">
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
                                {(question.options || []).map((option: PlayerQuizOption, optionIndex: number) => {
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
                                      key={"option-" + (option.id || optionIndex) + "-" + optionIndex}
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

                            <div className="flex flex-wrap gap-2">
                              {!quizSubmitted ? (
                                <button
                                  type="button"
                                  onClick={() => void handleQuizSubmit()}
                                  disabled={quizLoading || Object.keys(quizAnswers).length !== quizData.questions.length || completing}
                                  className="btn-primary justify-center"
                                >
                                  Submit Quiz
                                </button>
                              ) : (
                                <>
                                  {quizPassed && (
                                    <button
                                      type="button"
                                      onClick={() => navigation.next && handleNavigate(navigation.next.id)}
                                      className="btn-primary justify-center"
                                      disabled={completing}
                                    >
                                      {completing ? "Saving..." : navigation.next ? "Continue" : "Finish Course"}
                                    </button>
                                  )}
                                  {!quizPassed && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuizSubmitted(false);
                                        setQuizScore(null);
                                        setQuizPassed(false);
                                        setQuizAnswers({});
                                      }}
                                      className="btn-secondary justify-center"
                                      disabled={quizActionLoading}
                                    >
                                      Try Again
                                    </button>
                                  )}
                                  <button type="button" onClick={() => void handleGenerateLessonQuiz("reattempt")} disabled={quizActionLoading} className="btn-secondary justify-center">
                                    {quizActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Reattempt
                                  </button>
                                  <button type="button" onClick={() => void handleGenerateLessonQuiz("generate")} disabled={quizActionLoading} className="btn-primary justify-center">
                                    {quizActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleHelp className="h-4 w-4" />}
                                    {quizActionLoading ? "Generating..." : "Generate More Quiz"}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {quizActionError && <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{quizActionError}</p>}
                        </div>
                      ) : (
                        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                          <p className="font-semibold">{quizError || "No quiz questions are available yet."}</p>
                          <p className="mt-1 text-amber-800">The course remains available. Quiz generation can be retried without rebuilding the course.</p>
                          <button
                            type="button"
                            onClick={() => setQuizRetryCount((count) => count + 1)}
                            disabled={quizLoading}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-900 px-4 py-2 font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
                          >
                            {quizLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleHelp className="h-4 w-4" />}
                            {quizLoading ? "Retrying quiz generation..." : "Retry quiz generation"}
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {currentLesson.lesson.type === "tutorial" && (
                  <div className="bg-black">
                    {currentLesson.lesson.tutorial?.videos?.[0] ? (
                        <div>
                          {currentLesson.lesson.tutorial.videos[0].videoId ? (
                            <YouTubeEmbedPlayer
                              videoId={currentLesson.lesson.tutorial.videos[0].videoId}
                              title={currentLesson.lesson.tutorial.videos[0].title || "Course video"}
                              onPausedAt={(seconds) => { setPausedTimestampSeconds(seconds); setNoteTimestamp(formatMediaTimestamp(seconds)); }}
                              seekRequest={playerSeekRequest}
                            />
                          ) : (
                            <div className="flex aspect-video items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-300">
                              This video does not provide an embeddable video ID.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex aspect-video items-center justify-center px-6 text-sm text-slate-300">
                          No video is available for this lesson.
                        </div>
                      )}
                    {currentLesson.lesson.type === "tutorial" && currentLesson.lesson.tutorial?.videos?.[0]?.videoId && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-300">
                        <span>Is this resource useful?</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void sendPlayerCurationFeedback("helpful", currentLesson.lesson.tutorial!.videos![0])} className="rounded-full border border-slate-700 px-3 py-1.5 hover:bg-slate-800">Helpful</button>
                          <button type="button" onClick={() => void sendPlayerCurationFeedback("outdated", currentLesson.lesson.tutorial!.videos![0])} className="rounded-full border border-slate-700 px-3 py-1.5 hover:bg-slate-800">Outdated</button>
                          <button type="button" onClick={() => void sendPlayerCurationFeedback("wrong_level", currentLesson.lesson.tutorial!.videos![0])} className="rounded-full border border-slate-700 px-3 py-1.5 hover:bg-slate-800">Wrong level</button>
                        </div>
                      </div>
                    )}
                    <div aria-hidden="true" className="h-3 w-full bg-[#1c1d1f]" />
                  </div>
                )}

                <section className={`border-b border-slate-200 bg-white px-5 py-7 sm:px-8 lg:px-10 ${currentLesson.lesson.type === "quiz" ? "hidden" : ""}`}>
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-400">{currentLesson.module.title}</p>
                      <h1 className="mt-1 max-w-4xl text-2xl font-medium tracking-tight text-slate-950 sm:text-3xl">
                        {cleanPlayerLessonTitle(currentLesson.lesson.title, siblingLessonTitles)}
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
                          : "bg-slate-100 text-slate-950"
                      )}
                    >
                      {currentLesson.lesson.type === "project" ? (
                        <ListChecks className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {currentLesson.lesson.type === "tutorial" ? "Video lesson" : currentLesson.lesson.type === "quiz" ? "Quiz" : "Project"}
                    </span>
                  </div>

                  <div className="mt-6 flex gap-6 border-b border-slate-200" role="tablist" aria-label="Lesson sections">
                    {([
                      { id: "lesson", label: "Lesson" },
                      { id: "progress", label: "Progress" },
                      { id: "quiz", label: "Quiz" },
                      { id: "notes", label: "Notes" },
                    ] as const).map((tab) => (
                      <button key={tab.id} type="button" role="tab" aria-selected={lessonTab === tab.id} onClick={() => setLessonTab(tab.id)}
                        className={classNames("pb-3 text-sm font-semibold transition", lessonTab === tab.id ? "border-b-2 border-blue-600 font-bold text-blue-600" : "text-slate-400 hover:text-slate-700")}>
                        {tab.label}{tab.id === "progress" ? ` ${progressPct}%` : ""}
                      </button>
                    ))}
                  </div>

                  <div className="py-5">
                    {lessonTab === "quiz" && currentLesson.lesson.type !== "quiz" && (
                      <section className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Practice & check understanding</p>
                            <h2 className="mt-1 text-lg font-semibold text-slate-950">Quiz yourself on this lesson</h2>
                            <p className="mt-1 text-sm text-slate-500">Quiz questions are separate from lesson notes, Q&A, and resources.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {practiceQuizData && (
                              <>
                                <button type="button" onClick={() => void handleGeneratePracticeQuiz("reattempt")} disabled={practiceQuizLoading} className="btn-secondary justify-center">Reattempt</button>
                                <button type="button" onClick={() => void handleGeneratePracticeQuiz("generate")} disabled={practiceQuizLoading} className="btn-primary justify-center">
                                  {practiceQuizLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleHelp className="h-4 w-4" />}
                                  {practiceQuizLoading ? "Loading..." : "Generate More"}
                                </button>
                              </>
                            )}
                            {!practiceQuizData && <button type="button" onClick={() => void handleGeneratePracticeQuiz()} disabled={practiceQuizLoading} className="btn-primary justify-center">
                              {practiceQuizLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleHelp className="h-4 w-4" />}
                              {practiceQuizLoading ? "Generating..." : "Generate Practice Quiz"}
                            </button>}
                          </div>
                        </div>
                    {practiceQuizError && (
                      <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{practiceQuizError}</p>
                    )}
                    {practiceQuizLoading && (
                      <p className="mb-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Preparing quiz questions...</p>
                    )}
                                            {(practiceQuizData?.questions?.length ?? 0) > 0 && (
                          <div className="mt-5 space-y-4">
                            {(practiceQuizData?.questions ?? []).map((question: PlayerQuizQuestion, questionIndex: number) => (
                              <article key={question.id} className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-start gap-3">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">{questionIndex + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-6 text-slate-900">{question.question}</p>
                                    {question.topic && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{question.topic}</p>}
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-2">
                                  {(question.options || []).map((option: PlayerQuizOption) => {
                                    const selected = practiceQuizAnswers[question.id] === option.id;
                                    const correct = question.correctOptionId === option.id;
                                    const tone = practiceQuizSubmitted
                                      ? correct ? "border-green-200 bg-green-50 text-green-800" : selected ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-600"
                                      : selected ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
                                    return <button key={option.id} type="button" disabled={practiceQuizSubmitted} onClick={() => setPracticeQuizAnswers((current) => ({ ...current, [question.id]: option.id }))} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${tone}`}>
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-current/20 text-[11px] font-bold">{option.id}</span>
                                      <span>{option.text}</span>
                                    </button>;
                                  })}
                                </div>
                                {practiceQuizSubmitted && question.explanation && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{question.explanation}</p>}
                              </article>
                            ))}
                            <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                              {practiceQuizSubmitted ? <p className="text-sm font-bold text-slate-900">Your practice score: {practiceQuizScore}%</p> : <p className="text-sm text-slate-500">{Object.keys(practiceQuizAnswers).length} of {(practiceQuizData?.questions ?? []).length} answered</p>}
                              {!practiceQuizSubmitted ? (
                                <button type="button" onClick={handlePracticeQuizSubmit} disabled={Object.keys(practiceQuizAnswers).length !== (practiceQuizData?.questions ?? []).length} className="btn-primary justify-center">Check answers</button>
                              ) : (
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <button type="button" onClick={() => void handleGeneratePracticeQuiz("generate")} disabled={practiceQuizLoading} className="btn-primary justify-center">
                                    {practiceQuizLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleHelp className="h-4 w-4" />}
                                    Generate More
                                  </button>
                                  <button type="button" onClick={() => void handleGeneratePracticeQuiz("reattempt")} disabled={practiceQuizLoading} className="btn-secondary justify-center">
                                    Reattempt
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </section>
                    )}
                    {lessonTab === "progress" && (
                      <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Learning progress</p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-950">{progressPct}% completed</h2>
                        <p className="mt-2 text-sm text-slate-500">{progress?.completed_count || 0} of {allLessons.length} lessons completed in this course.</p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} /></div>
                      </section>
                    )}
                    {lessonTab === "notes" && (
                      <section aria-labelledby="timestamp-notes-title" className="space-y-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 id="timestamp-notes-title" className="text-xl font-bold tracking-tight text-slate-950">Notes</h2>
                            <p className="mt-1 text-sm text-slate-500">Timestamped notes help you capture ideas while learning and jump back to the exact moment in a lecture.</p>
                          </div>
                          <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{timestampNotes.length} {timestampNotes.length === 1 ? "note" : "notes"}</span>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold" style={{ backgroundColor: NOTE_EDITOR_THEME.timestampBackground, color: NOTE_EDITOR_THEME.timestampText, fontFamily: NOTE_EDITOR_THEME.fontFamily }}><Clock3 className="h-4 w-4" />{noteTimestamp.trim() ? formatMediaTimestamp(parseMediaTimestamp(noteTimestamp) || 0) : "Add a timestamp"}</div>
                            <span className="text-xs text-slate-500">Current lecture: {cleanPlayerLessonTitle(currentLesson.lesson.title, siblingLessonTitles)}</span>
                          </div>
                          <div className="p-4 sm:p-5">
                            <label htmlFor="course-note-timestamp" className="mb-1 block text-xs font-semibold text-slate-600">Video timestamp</label>
                            <input id="course-note-timestamp" value={noteTimestamp} onChange={(event) => setNoteTimestamp(event.target.value)} placeholder="00:15 (mm:ss or hh:mm:ss)" inputMode="numeric" className="input-field mb-3 w-full max-w-xs text-sm" aria-describedby="timestamp-note-help" />
                            <div className="mb-3 flex flex-wrap items-center gap-2"><p id="timestamp-note-help" className="text-xs text-slate-500">Pause the video to sync its timestamp automatically, or grab the last paused position.</p><button type="button" onClick={() => { if (pausedTimestampSeconds !== null) setNoteTimestamp(formatMediaTimestamp(pausedTimestampSeconds)); else setNoteNotice("Pause the lesson video first to grab its timestamp."); }} disabled={pausedTimestampSeconds === null} className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-semibold text-[#6c2bd9] transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50">Grab current timestamp</button></div>
                            <div className="overflow-hidden rounded-xl border-[1.5px] border-slate-200 transition focus-within:border-[#6c2bd9] focus-within:ring-2 focus-within:ring-purple-100">
                              <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2" aria-label="Note formatting tools"><label className="sr-only" htmlFor="note-style">Text style</label><select id="note-style" defaultValue="paragraph" onChange={(event) => { const style = event.target.value; if (style === "heading") formatNoteDraft("## ", ""); else if (style === "subheading") formatNoteDraft("### ", ""); else if (style === "paragraph") formatNoteDraft("\n", ""); event.target.value = "paragraph"; }} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"><option value="paragraph">Styles</option><option value="heading">Heading</option><option value="subheading">Subheading</option></select>
                                <button type="button" onClick={() => formatNoteDraft("**")} className="rounded-md px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-white hover:text-slate-950" aria-label="Bold selected text">B</button>
                                <button type="button" onClick={() => formatNoteDraft("*")} className="rounded-md px-3 py-1.5 text-sm italic text-slate-600 hover:bg-white hover:text-slate-950" aria-label="Italic selected text">I</button>
                                <span className="mx-1 h-5 w-px bg-slate-200" />
                                <button type="button" onClick={() => formatNoteDraft("\n- ", "")} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-950" aria-label="Insert bullet list">• List</button><button type="button" onClick={() => formatNoteDraft("\n1. ", "")} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-950" aria-label="Insert numbered list">1. 2. 3.</button>
                                <button type="button" onClick={() => formatNoteDraft("`")} className="rounded-md px-3 py-1.5 font-mono text-xs text-slate-600 hover:bg-white hover:text-slate-950" aria-label="Format as code">{"</>"}</button><button type="button" onClick={() => formatNoteDraft("[Card: ", "]")} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-slate-950" aria-label="Insert card or embed">▣ Card</button>
                                <span className={`ml-auto pr-2 text-xs font-medium ${noteDraft.length > noteCharacterLimit ? "text-red-600" : "text-slate-500"}`}>{Math.max(0, noteCharacterLimit - noteDraft.length)} characters left</span>
                              </div>
                              <textarea ref={noteEditorRef} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={5} placeholder="Write a note for this moment in the lecture..." className="block w-full resize-y border-0 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none ring-0 placeholder:text-slate-400 focus:ring-0" />
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                              <p className="text-xs text-slate-500" aria-live="polite">{noteError || noteNotice || "Notes are saved in this browser for this account and course."}</p>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => { setNoteDraft(""); setNoteTimestamp(""); setNoteError(""); setNoteNotice(""); }} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Cancel</button>
                                <button type="button" onClick={saveLessonNote} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: NOTE_EDITOR_THEME.primaryAccent, fontFamily: NOTE_EDITOR_THEME.fontFamily }} onMouseOver={(event) => { event.currentTarget.style.backgroundColor = NOTE_EDITOR_THEME.secondaryHover; }} onMouseOut={(event) => { event.currentTarget.style.backgroundColor = NOTE_EDITOR_THEME.primaryAccent; }} disabled={!notesStorageReady || !noteDraft.trim() || noteDraft.length > noteCharacterLimit}><Save className="h-4 w-4" aria-hidden="true" />Save note</button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <h3 className="mr-auto whitespace-nowrap text-sm font-bold text-slate-900 sm:text-base">Your notes <span className="ml-1 text-xs font-medium text-slate-500">({visibleCourseNotes.length})</span></h3>
                          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-0">
                            <label className="sr-only" htmlFor="notes-lecture-filter">Filter notes by lecture</label>
                            <select id="notes-lecture-filter" value={notesLessonFilter} onChange={(event) => setNotesLessonFilter(event.target.value)} className="input-field h-9 min-w-0 max-w-full px-2 py-1 text-xs sm:w-56 sm:text-sm">
                              <option value="all">All lectures</option>
                              {allLessons.map((lesson) => <option key={lesson.id} value={String(lesson.id)}>{cleanPlayerLessonTitle(lesson.title, siblingLessonTitles)}</option>)}
                            </select>
                            <label className="sr-only" htmlFor="notes-sort-order">Sort notes</label>
                            <select id="notes-sort-order" value={notesSortOrder} onChange={(event) => setNotesSortOrder(event.target.value as "recent" | "oldest")} className="input-field h-9 min-w-0 max-w-full px-2 py-1 text-xs sm:w-36 sm:text-sm">
                              <option value="recent">Recent</option>
                              <option value="oldest">Oldest</option>
                            </select>
                          </div>
                        </div>
                        {visibleCourseNotes.length > 0 ? (
                          <div className="space-y-3">
                            {visibleCourseNotes.map((note) => (
                              <article key={note.id} className="flex min-w-0 items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                <button type="button" onClick={() => { if (String(currentLesson?.lesson.id) === note.lessonId) { setPlayerSeekRequest({ seconds: note.timestampSeconds, id: Date.now() }); setLessonTab("lesson"); } else { navigate(`/learn/${courseId}/${note.lessonId}`); setPlayerSeekRequest({ seconds: note.timestampSeconds, id: Date.now() }); } }} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#0d0e12] px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#272832]" aria-label={"Jump to " + formatMediaTimestamp(note.timestampSeconds)}><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatMediaTimestamp(note.timestampSeconds)}</button>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-slate-500">{note.lessonTitle}</p>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{note.content}</p>
                                  <p className="mt-2 text-[11px] text-slate-400">{new Date(note.createdAt).toLocaleString()}</p>
                                </div>
                                <button type="button" onClick={() => deleteLessonNote(note.id)} className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700" aria-label="Delete note"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center">
                            <FileText className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
                            <p className="mt-2 text-sm font-semibold text-slate-700">{timestampNotes.length ? "No notes match this lecture filter." : "No notes yet"}</p>
                            <p className="mt-1 text-xs text-slate-500">Add a timestamp and note above to save your first learning note.</p>
                          </div>
                        )}
                      </section>
                    )}
                    {lessonTab === "lesson" && (
                      <div className="space-y-4">
                    {currentLesson.lesson.type !== "quiz" && courseId && lessonId && (
                      <AdvancedAIAssistant courseId={courseId} lessonId={lessonId} />
                    )}

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
                                {currentLesson.lesson.tutorial.resources.map((resource, resourceIndex) => (
                                  <a
                                    key={"resource-" + (resource.url || resource.title || "item") + "-" + resourceIndex}
                                    href={resource.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
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
                      <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">
                            Project brief
                          </p>
                          <h2 className="mt-1 text-xl font-extrabold text-slate-950">
                            {cleanPlayerLessonTitle(currentLesson.lesson.title, siblingLessonTitles)}
                          </h2>
                          <p className="mt-3 text-sm leading-7 text-slate-700">
                            {currentLesson.lesson.project?.description}
                          </p>
                        </div>

                        {currentLesson.lesson.project?.realWorldScenario && (
                          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                            <h3 className="font-bold text-slate-900">Real-world scenario</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {currentLesson.lesson.project.realWorldScenario}
                            </p>
                          </section>
                        )}

                        {currentLesson.lesson.project?.features?.length ? (
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">What you will build</h3>
                            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                              {currentLesson.lesson.project.features.map((item: string, index: number) => (
                                <li key={"feature-" + index + "-" + item} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}

                        {currentLesson.lesson.project?.architecture?.length ? (
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Suggested architecture</h3>
                            <ul className="mt-2 space-y-2">
                              {currentLesson.lesson.project.architecture.map((item: string, index: number) => (
                                <li key={"architecture-" + index + "-" + item} className="text-sm leading-6 text-slate-700">
                                  <span className="mr-2 text-blue-600">•</span>{item}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}

                        {currentLesson.lesson.project?.milestones?.length ? (
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Build milestones</h3>
                            <ol className="mt-2 space-y-2">
                              {currentLesson.lesson.project.milestones.map((item: string, index: number) => (
                                <li key={"milestone-" + index + "-" + item} className="flex gap-3 text-sm leading-6 text-slate-700">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                                    {index + 1}
                                  </span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ol>
                          </section>
                        ) : null}

                        <div className="grid gap-4 lg:grid-cols-2">
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Objectives</h3>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                              {(currentLesson.lesson.project?.objectives || []).map((item: string, index: number) => (
                                <li key={"objective-" + index + "-" + item}>{item}</li>
                              ))}
                            </ul>
                          </section>

                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Technical requirements</h3>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                              {(currentLesson.lesson.project?.requirements || []).map((item: string, index: number) => (
                                <li key={"requirement-" + index + "-" + item}>{item}</li>
                              ))}
                            </ul>
                          </section>
                        </div>

                        {currentLesson.lesson.project?.testingChecklist?.length ? (
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Testing & quality checklist</h3>
                            <ul className="mt-2 space-y-2">
                              {currentLesson.lesson.project.testingChecklist.map((item: string, index: number) => (
                                <li key={"test-" + index + "-" + item} className="text-sm leading-6 text-slate-700">
                                  <span className="mr-2 text-green-600">✓</span>{item}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}

                        {currentLesson.lesson.project?.industrySkills?.length ? (
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Industry skills</h3>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {currentLesson.lesson.project.industrySkills.map((item: string, index: number) => (
                                <span key={"industry-" + index + "-" + item} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {currentLesson.lesson.project?.githubWorkflow?.length ? (
                          <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <h3 className="font-bold text-slate-900">Git & GitHub workflow</h3>
                            <ol className="mt-2 space-y-2">
                              {currentLesson.lesson.project.githubWorkflow.map((item: string, index: number) => (
                                <li key={"github-" + index + "-" + item} className="flex gap-3 text-sm leading-6 text-slate-700">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                    {index + 1}
                                  </span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ol>
                          </section>
                        ) : null}

                        {currentLesson.lesson.project?.videos?.length ? (
                          <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                            <h3 className="font-bold text-slate-900">Project tutorial</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              Watch the selected long-form project walkthrough inside BuddyForStudy.
                            </p>
                            <div className="mt-3 overflow-hidden rounded-xl bg-black">
                              <YouTubeEmbedPlayer
                                videoId={String(currentLesson.lesson.project.videos[0].videoId || "")}
                                title={currentLesson.lesson.project.videos[0].title || "Project tutorial"}
                                onPausedAt={(seconds) => { setPausedTimestampSeconds(seconds); setNoteTimestamp(formatMediaTimestamp(seconds)); }}
                                seekRequest={playerSeekRequest}
                              />
                            </div>
                          </section>
                        ) : null}

                        <section className="rounded-2xl border border-green-100 bg-green-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-[.14em] text-green-700">
                            Definition of done
                          </p>
                          <p className="mt-1 text-sm leading-6 text-green-900">
                            {currentLesson.lesson.project?.expectedOutcome}
                          </p>
                        </section>
                      </div>
                    )}
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
                      className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-[#444950] disabled:cursor-not-allowed disabled:opacity-40"
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
              <div key={module.id} className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">
                    Module {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-extrabold leading-5 text-slate-900">
                    {module.title}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    {moduleLessonCounts(module)}/{module.lessons.length} done{module.lessons.some((lesson) => getPlayerLessonDurationSeconds(lesson) > 0) ? " · " + formatPlayerDuration(module.lessons.reduce((sum, lesson) => sum + getPlayerLessonDurationSeconds(lesson), 0)) : ""}
                  </p>
                </div>

                {(module.resources || []).length > 0 && (
                  <div className="border-t border-slate-100 bg-white px-3 py-2">
                    <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                      Resources
                    </p>
                    <div className="space-y-1">
                      {(module.resources || []).map((resource) => {
                        const Icon =
                          resource.type === "repository"
                            ? Github
                            : resource.type === "document"
                              ? FileText
                              : ExternalLink;
                        return (
                          <a
                            key={resource.id}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 truncate">{resource.title}</span>
                            <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {module.lessons.map((lesson) => {
                  const done = isLessonCompleted(completedLessons, lesson.id);
                  const active = lesson.id === lessonId;
                  const durationLabel = formatPlayerDuration(getPlayerLessonDurationSeconds(lesson));
                  const cleanedTitle = cleanPlayerLessonTitle(lesson.title, allLessons.map((item) => item.title));

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleNavigate(lesson.id)}
                      className={classNames(
                        "flex w-full items-start gap-3 border-t border-slate-100 px-4 py-3 text-left transition",
                        active
                          ? "bg-slate-100 text-slate-950"
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
                        ) : lesson.type === "quiz" ? (
                          <CircleHelp className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block line-clamp-2 text-xs font-semibold leading-5">
                          {cleanedTitle}
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-400">{done ? "Completed" : active ? "Currently learning" : lesson.type === "quiz" ? "Quiz" : lesson.type === "project" ? "Project" : "Video lesson"}</span>
                        </span>
                      </span>

                      {durationLabel && <span className="shrink-0 self-center text-[10px] font-semibold text-slate-500">{durationLabel}</span>}
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
