import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import YouTubeEmbedPlayer from "@/components/YouTubeEmbedPlayer";
import { getYouTubeEmbedUrl } from "@/lib/youtubeEmbed";
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Loader2,
  PlayCircle,
  Share2,
  Star,
  Users,
  X,
} from "lucide-react";

function toEmbedUrl(videoId: string): string {
  return getYouTubeEmbedUrl(videoId);
}

type YouTubeCourse = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  duration: string;
  durationSeconds: number;
  url: string;
  embedUrl: string;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
  score: number;
};

type YouTubePlaylist = {
  playlistId: string;
  title: string;
  description: string;
  channelTitle: string;
  itemCount: number;
  thumbnail: string;
  url: string;
  score?: number;
};

type CourseLesson = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  embedUrl: string;
};

type BuiltCourse = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  sourceType: "playlist" | "video" | "series";
  sourceId: string;
  lessons: CourseLesson[];
  itemCount: number;
};

type Viewer = {
  course: BuiltCourse;
  lessonIndex: number;
};

type CuratedResource = {
  id: string;
  sourceType: "video" | "playlist" | "series";
  sourceId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  sourceUrl?: string;
  duration: string;
  durationSeconds: number;
  durationEstimated?: boolean;
  itemCount: number;
  viewCount: number;
  score: number;
  qualityScore: number;
  confidence: number;
  isHiddenGem: boolean;
  slots: string[];
  primarySlot: string;
  whyThis: string[];
  gaps: string[];
  evidence: Record<string, number | string>;
  items: Array<{
    videoId: string;
    title: string;
    description?: string;
    durationSeconds: number;
    duration?: string;
    thumbnail?: string;
    channelTitle?: string;
    publishedAt?: string | null;
    url?: string;
  }>;
};

type ComposedPathStep = {
  moduleOrder: number;
  moduleName: string;
  videoTitle: string;
  resourceTitle: string;
  resourceType: "video" | "playlist" | "series";
  channelTitle: string;
  videoId: string;
  timestampSeconds: number;
  timestampLabel: string;
  verifiedTimecode: boolean;
  url: string;
  embedUrl: string;
  matchScore: number;
  overallScore: number;
};

type Props = {
  query: string;
  courses: YouTubeCourse[];
  playlists: YouTubePlaylist[];
  curatedResources?: CuratedResource[];
  curationMeta?: { resultsShown?: number; version?: string; intent?: { category?: string; level?: string; [key: string]: unknown }; composedPath?: ComposedPathStep[]; composedPathSteps?: number; syllabus?: { moduleCount?: number }; [key: string]: unknown } | null;
  loadingPlaylists?: boolean;
  error?: string;
  hasLocalResults?: boolean;
};

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value || 0);
}

function formatMinutes(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function summarizeDescription(description: string, maxLength = 115) {
  const concise = String(description || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (!concise) return "A curated learning resource to help you build practical skills.";
  return concise.length > maxLength ? `${concise.slice(0, maxLength).trimEnd()}…` : concise;
}

function normalizeDiscoveryLevel(value: unknown): "Beginner" | "Intermediate" | "Advanced" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "intermediate") return "Intermediate";
  if (normalized === "advanced") return "Advanced";
  return "Beginner";
}

export default function YouTubeSearchFallback({
  query,
  courses,
  playlists,
  curatedResources,
  curationMeta,
  loadingPlaylists = false,
  error = "",
  hasLocalResults = false,
}: Props) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Record<string, string>>({});
  const { session } = useAuth();
  const navigate = useNavigate();

  const builtCourses = useMemo<BuiltCourse[]>(() => {
    const playlistCourses: BuiltCourse[] = playlists.slice(0, 30).map((playlist, index) => ({
      id: `playlist-course-${playlist.playlistId}`,
      title: playlist.title,
      description: `BuddyForStudy course built from the #${index + 1} ranked YouTube playlist for “${query}”.`,
      thumbnail: playlist.thumbnail,
      channelTitle: playlist.channelTitle,
      sourceType: "playlist",
      sourceId: playlist.playlistId,
      lessons: [],
      itemCount: playlist.itemCount,
    }));

    if (playlistCourses.length >= 30) return playlistCourses;

    const usedResourceIds = new Set(playlistCourses.map((course) => course.sourceId));
    const videoCourses: BuiltCourse[] = courses
      .filter((video) => !usedResourceIds.has(video.videoId))
      .slice(0, Math.max(0, 30 - playlistCourses.length))
      .map((video, index) => ({
        id: `video-course-${video.videoId}`,
        title: `${query} Course ${index + playlistCourses.length + 1}`,
        description: `BuddyForStudy course built from the #${index + playlistCourses.length + 1} ranked YouTube learning resource.`,
        thumbnail: video.thumbnail,
        channelTitle: video.channelTitle,
        sourceType: "video",
        sourceId: video.videoId,
        lessons: [{
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          channelTitle: video.channelTitle,
          duration: video.duration,
          durationSeconds: video.durationSeconds,
          thumbnail: video.thumbnail,
          embedUrl: toEmbedUrl(video.videoId),
        }],
        itemCount: 1,
      }));

    return [...playlistCourses, ...videoCourses];
  }, [courses, playlists, query]);

  const requireSignIn = () => {
    navigate("/login", {
      state: { from: { pathname: "/courses" } }
    });
  };

  const recordCurationFeedback = async (
    resourceId: string,
    event: "preview" | "save" | "enroll" | "thumbs_up" | "thumbs_down" | "outdated" | "report",
    rankOverride?: number
  ) => {
    const resource = curatedResources?.find((item) => item.id === resourceId);
    if (!session && event !== "preview") {
      if (event === "thumbs_up" || event === "thumbs_down" || event === "outdated") requireSignIn();
      return false;
    }
    if (!resource) return false;
    const inferredRank = curatedResources?.findIndex((item) => item.id === resource.id) ?? -1;
    try {
      await apiFetch("/api/discovery/curation-feedback", {
        method: "POST",
        body: JSON.stringify({
          query,
          category: curationMeta?.intent?.category,
          level: curationMeta?.intent?.level,
          event,
          resourceType: resource.sourceType,
          resourceId: resource.sourceId,
          engineVersion: curationMeta?.version || "course-curation-decision-engine-v1.7",
          rank: rankOverride ?? (inferredRank >= 0 ? inferredRank + 1 : undefined),
          score: resource.score,
        }),
      });
      if (["thumbs_up", "thumbs_down", "outdated"].includes(event)) {
      }
      return true;
    } catch {
      // Telemetry must never block saving, enrolling or previewing a resource.
      return false;
    }
  };

  const saveCourse = async (course: BuiltCourse) => {
    if (!session) {
      requireSignIn();
      return;
    }

    setSavingId(course.id);
    setViewerError("");

    try {
      await apiFetch("/api/discovery/youtube-course/save", {
        method: "POST",
        body: JSON.stringify({
          query,
          resourceType: course.sourceType,
          resourceId: course.sourceId,
          level: normalizeDiscoveryLevel(curationMeta?.intent?.level),
        }),
      });
      setSavedIds((current) => new Set(current).add(course.id));
      await recordCurationFeedback(course.id, "save");
    } catch (error) {
      setViewerError(
        error instanceof Error ? error.message : "Unable to save this course."
      );
    } finally {
      setSavingId(null);
    }
  };

  const enrollCourse = async (course: BuiltCourse) => {
    if (!session) {
      requireSignIn();
      return;
    }

    setEnrollingId(course.id);
    setViewerError("");

    try {
      const data = await apiFetch("/api/discovery/youtube-course/enroll", {
        method: "POST",
        body: JSON.stringify({
          query,
          resourceType: course.sourceType,
          resourceId: course.sourceId,
          level: normalizeDiscoveryLevel(curationMeta?.intent?.level),
        }),
      });

      const courseId = data?.course?._id;
      if (!courseId) throw new Error("The course could not be added to My Learning.");

      setEnrolledIds((current) => new Set(current).add(course.id));
      setEnrolledCourseIds((current) => ({ ...current, [course.id]: String(courseId) }));
      await recordCurationFeedback(course.id, "enroll");
      navigate(`/learn/${courseId}`);
    } catch (error) {
      setViewerError(
        error instanceof Error ? error.message : "Unable to enroll in this course."
      );
    } finally {
      setEnrollingId(null);
    }
  };

  const openCourseDetails = async (course: BuiltCourse) => {
    if (!session) {
      requireSignIn();
      return;
    }
    setOpeningId(course.id);
    setViewerError("");
    try {
      const data = await apiFetch("/api/discovery/youtube-course/prepare", {
        method: "POST",
        body: JSON.stringify({ query, resourceType: course.sourceType, resourceId: course.sourceId, level: normalizeDiscoveryLevel(curationMeta?.intent?.level) }),
      });
      const courseId = data?.course?._id;
      if (!courseId) throw new Error("Course details are not available yet.");
      if (data?.pendingApproval || data?.pendingPublication) {
        setViewerError(data.message || "This course is awaiting approval or publication.");
        return;
      }
      navigate(`/courses/${courseId}`);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : "Unable to open course details.");
    } finally {
      setOpeningId(null);
    }
  };

  const openCourse = async (course: BuiltCourse) => {
    if (curatedResources?.some((item) => item.id === course.id)) {
      void recordCurationFeedback(course.id, "preview");
    }
    setViewerError("");
    setOpeningId(course.id);

    try {
      if (course.sourceType === "video" || course.sourceType === "series") {
        if (!course.lessons.length) throw new Error("This learning resource has no playable lessons.");
        setViewer({ course, lessonIndex: 0 });
        return;
      }

      const data = await apiFetch(
        `/api/discovery/playlists/${encodeURIComponent(course.sourceId)}`
      );
      const source = data?.course;

      const lessons: CourseLesson[] = (source?.lessons || [])
        .map((lesson: Record<string, unknown>) => {
          const videoId = String(lesson.videoId || lesson.id || "");
          if (!videoId) return null;

          return {
            videoId,
            title: lesson.title || "Untitled lesson",
            description: lesson.description || "",
            channelTitle: lesson.channelTitle || source?.channelTitle || "",
            duration: lesson.duration || formatMinutes(Number(lesson.durationSeconds || 0)),
            durationSeconds: Number(lesson.durationSeconds || 0),
            thumbnail: String(lesson.thumbnail || ""),
            embedUrl: toEmbedUrl(videoId),
          };
        })
        .filter(Boolean) as CourseLesson[];

      if (!lessons.length) {
        throw new Error("This YouTube playlist has no playable lessons.");
      }

      setViewer({
        course: {
          ...course,
          title: source?.title || course.title,
          description: source?.description || course.description,
          thumbnail: source?.thumbnail || course.thumbnail,
          channelTitle: source?.channelTitle || course.channelTitle,
          lessons,
          itemCount: lessons.length,
        },
        lessonIndex: 0,
      });
    } catch (err) {
      setViewerError(
        err instanceof Error
          ? err.message
          : "Unable to open this resource inside BuddyForStudy."
      );
    } finally {
      setOpeningId(null);
    }
  };

  const handleCourseAction = (course: BuiltCourse) => {
    const enrolledCourseId = enrolledCourseIds[course.id];
    if (enrolledIds.has(course.id) && enrolledCourseId) {
      navigate(`/learn/${enrolledCourseId}`);
      return;
    }
    void enrollCourse(course);
  };

  const openVideo = (video: YouTubeCourse) => {
    setViewerError("");
    setViewer({
      course: {
        id: `video-${video.videoId}`,
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnail,
        channelTitle: video.channelTitle,
        sourceType: "video",
        sourceId: video.videoId,
        lessons: [{
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          channelTitle: video.channelTitle,
          duration: video.duration,
          durationSeconds: video.durationSeconds,
          thumbnail: video.thumbnail,
          embedUrl: toEmbedUrl(video.videoId),
        }],
        itemCount: 1,
      },
      lessonIndex: 0,
    });
  };

  const currentLesson = viewer?.course.lessons[viewer.lessonIndex];
  const hasAnything = curatedResources !== undefined ? curatedResources.length > 0 : builtCourses.length > 0 || courses.length > 0 || playlists.length > 0;

  if (!hasAnything && curatedResources === undefined && !loadingPlaylists && !error) {
    return (
      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-800">
          No BuddyForStudy or YouTube results found
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Try a broader term or use Build with AI.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="mt-6">
        <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 sm:p-7">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">
            {hasLocalResults ? `More resources for “${query}”` : "Explore learning resources"}
          </h3>

          {curatedResources !== undefined ? (
            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">For you</h4>
                {curationMeta && Number(curationMeta.resultsShown || 0) > 0 && (
                  <span className="text-xs text-slate-500">{curationMeta.resultsShown} resources</span>
                )}
              </div>
              {curatedResources.length ? (
                <div className="bfs-youtube-course-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {curatedResources.map((resource) => {
                    const mappedLessons: CourseLesson[] = (resource.items || [])
                      .map((item) => {
                        const videoId = String(item.videoId || "");
                        if (!videoId) return null;
                        return {
                          videoId,
                          title: item.title || "Untitled lesson",
                          description: item.description || "",
                          channelTitle: item.channelTitle || resource.channelTitle || "",
                          duration: item.duration || formatMinutes(Number(item.durationSeconds || 0)),
                          durationSeconds: Number(item.durationSeconds || 0),
                          thumbnail: item.thumbnail || "",
                          embedUrl: toEmbedUrl(videoId),
                        };
                      })
                      .filter(Boolean) as CourseLesson[];
                    const lessons: CourseLesson[] = resource.sourceType === "video"
                      ? [{
                          videoId: resource.sourceId,
                          title: resource.title,
                          description: resource.description || "",
                          channelTitle: resource.channelTitle || "",
                          duration: resource.duration || formatMinutes(resource.durationSeconds || 0),
                          durationSeconds: Number(resource.durationSeconds || 0),
                          thumbnail: resource.thumbnail || "",
                          embedUrl: toEmbedUrl(resource.sourceId),
                        }]
                      : mappedLessons;
                    const course: BuiltCourse = {
                      id: resource.id,
                      title: resource.title,
                      description: resource.description || "",
                      thumbnail: resource.thumbnail || "",
                      channelTitle: resource.channelTitle || "",
                      sourceType: resource.sourceType,
                      sourceId: resource.sourceId,
                      lessons,
                      itemCount: Number(resource.itemCount || lessons.length || 1),
                    };
                    return (
                      <article key={resource.id} className="bfs-course-card group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition duration-200 hover:border-violet-200 hover:shadow-md">
                        <div className="bfs-course-card__media relative aspect-video shrink-0 overflow-hidden bg-slate-100">
                          <button type="button" aria-label={`View details for ${resource.title}`} onClick={() => void openCourseDetails(course)} className="absolute inset-0 z-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"><span className="sr-only">View course details</span></button>
                          {resource.thumbnail ? <img src={resource.thumbnail} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center"><PlayCircle className="h-10 w-10 text-slate-300" /></div>}
                          <span className="absolute left-2 top-2 z-10 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">{resource.primarySlot || "Recommended"}</span>
                          {resource.isHiddenGem && <span className="absolute left-2 bottom-2 z-10 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">Hidden gem</span>}
                          <span className="absolute bottom-2 left-2 z-10 rounded-md bg-slate-950/85 px-2 py-1 text-[10px] font-bold text-white">{resource.durationEstimated ? "~" : ""}{resource.duration || formatMinutes(resource.durationSeconds || 0)}</span>
                          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
                            <button type="button" onClick={() => void saveCourse(course)} disabled={savingId === course.id} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm transition hover:bg-violet-50 disabled:opacity-60" aria-label={savedIds.has(course.id) ? "Course saved" : "Save course"} title={savedIds.has(course.id) ? "Saved" : "Save course"}>{savedIds.has(course.id) ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}</button>
                            <button type="button" onClick={() => { const url = resource.sourceUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(resource.sourceId)}`; if (navigator.share) void navigator.share({ title: resource.title, url }).catch(() => undefined); else void navigator.clipboard?.writeText(url); }} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm transition hover:bg-violet-50" aria-label={`Share ${resource.title}`} title="Share course"><Share2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <div className="flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="rounded-full bg-violet-50 px-2 py-1 font-semibold text-violet-700">{resource.sourceType === "video" ? "Single video" : resource.sourceType === "series" ? "Series" : "Course"}</span>
                              <span>{resource.itemCount || 1} {(resource.itemCount || 1) === 1 ? "lesson" : "lessons"}</span>
                            </div>
                            <button type="button" onClick={() => void openCourseDetails(course)} className="block w-full text-left line-clamp-2 min-h-[2.6rem] text-sm font-bold leading-5 text-slate-900 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" title={resource.title}>{resource.title}</button>
                            <p className="mt-1 truncate text-xs text-slate-500" title={resource.channelTitle}>{resource.channelTitle || "YouTube learning resource"}</p>
                            <button type="button" onClick={() => void openCourseDetails(course)} className="mt-2 block w-full text-left line-clamp-2 min-h-9 text-xs leading-4 text-slate-600 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" title={resource.description}>{summarizeDescription(resource.description || `Learn ${query} with this curated YouTube resource.`)}</button>
                            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><Star className="h-3 w-3 text-amber-500" aria-hidden="true" /><span>No ratings yet · Be the first to review</span></div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <span className="text-xs font-bold text-slate-900">View pricing</span>
                            <button type="button" onClick={() => void openCourseDetails(course)} disabled={openingId === course.id} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60">
                              {openingId === course.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{enrolledIds.has(course.id) ? "Continue learning" : "＋ Enroll"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                  {hasLocalResults
                    ? "No YouTube resource passed the current relevance, structure, runtime, and availability checks. Your matching BuddyForStudy courses remain available above."
                    : "No YouTube resource passed the current relevance, structure, runtime, and availability checks. Try a more specific topic or request a crash course."}
                </div>
              )}
            </div>
          ) : (
            <>
              {builtCourses.length > 0 && (
                <div className="mt-7">
                  <div className="bfs-course-grid mt-4">
                    {builtCourses.map((course, index) => (
                  <article
                    key={course.id}
                    className="bfs-course-card group flex h-full min-h-[400px] min-w-0 flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-colors duration-200 hover:bg-slate-50"
                  >
                    <div role="button" tabIndex={0} aria-label={`Preview ${course.title}`} onClick={() => void openCourse(course)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openCourse(course); } }} className="bfs-course-card__media relative block shrink-0 cursor-pointer overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                      {course.thumbnail ? (
                        <img src={course.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <PlayCircle className="h-10 w-10 text-slate-300" />
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-bold text-white">
                        Course {index + 1}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex-1">
                        <p className="mt-2 line-clamp-2 min-h-[2.65rem] text-[15px] font-extrabold leading-[1.32] tracking-[-.02em] text-slate-900">
                          {course.title}
                        </p>
                        <p className="mt-2 truncate text-xs leading-5 text-slate-500">
                          {course.channelTitle}
                        </p>
                        <p className="mt-3 flex min-h-[42px] items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          {course.itemCount} {course.sourceType === "playlist" ? "videos" : "lesson"}
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void saveCourse(course)}
                          disabled={savingId === course.id}
                          aria-label={savedIds.has(course.id) ? "Course saved" : "Save course"} title={savedIds.has(course.id) ? "Saved" : "Save course"} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border px-2 py-2.5 text-xs font-bold transition ${
                            savedIds.has(course.id)
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          {savingId === course.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : savedIds.has(course.id) ? (
                            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Bookmark className="h-4 w-4" aria-hidden="true" />
                          )}
                          
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCourseAction(course)}
                          disabled={enrollingId === course.id}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#1A1B41] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#292a55] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {enrollingId === course.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Adding...
                            </>
                          ) : enrolledIds.has(course.id) ? (
                            "Start"
                          ) : (
                            "Enroll free"
                          )}
                        </button>
                      </div>

                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {courses.length > 0 && (
            <div className="mt-8">
              <div className="bfs-course-grid mt-4">
                {courses.map((course, index) => (
                  <article
                    key={course.videoId}
                    className="bfs-course-card group flex h-full min-h-[400px] min-w-0 flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white text-left transition-colors duration-200 hover:bg-slate-50"
                  >
                    <div role="button" tabIndex={0} aria-label={`Preview ${course.title}`} onClick={() => openVideo(course)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openVideo(course); } }} className="bfs-course-card__media relative block shrink-0 cursor-pointer overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                      {course.thumbnail ? (
                        <img src={course.thumbnail} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <PlayCircle className="h-10 w-10 text-slate-300" />
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white">
                        #{index + 1} ranked
                      </span>
                      <span className="absolute bottom-2 right-2 rounded-md bg-slate-950/85 px-2 py-1 text-[11px] font-bold text-white">
                        {course.duration}
                      </span>
                    </div>
                                        <div className="flex flex-1 flex-col p-4">
                      <div className="flex-1">
                        <p className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">
                          {course.title}
                        </p>
                        <p className="mt-2 truncate text-xs font-semibold text-slate-500">
                          {course.channelTitle}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>{formatCount(course.viewCount)} views</span>
                          <span>·</span>
                          <span>{formatCount(course.likeCount)} likes</span>
                          <span>·</span>
                          <span>Score {Math.round(course.score)}</span>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void saveCourse({
                              id: `video-course-${course.videoId}`,
                              title: `${query} Course`,
                              description: course.description,
                              thumbnail: course.thumbnail,
                              channelTitle: course.channelTitle,
                              sourceType: "video",
                              sourceId: course.videoId,
                              lessons: [],
                              itemCount: 1,
                            });
                          }}
                          disabled={savingId === `video-course-${course.videoId}`}
                          aria-label={savedIds.has(`video-course-${course.videoId}`) ? "Course saved" : "Save course"} title={savedIds.has(`video-course-${course.videoId}`) ? "Remove from saved courses" : "Save course"} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border px-2 py-2.5 text-xs font-bold transition ${
                            savedIds.has(`video-course-${course.videoId}`)
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          {savingId === `video-course-${course.videoId}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void enrollCourse({
                              id: `video-course-${course.videoId}`,
                              title: `${query} Course`,
                              description: course.description,
                              thumbnail: course.thumbnail,
                              channelTitle: course.channelTitle,
                              sourceType: "video",
                              sourceId: course.videoId,
                              lessons: [],
                              itemCount: 1,
                            });
                          }}
                          disabled={enrollingId === `video-course-${course.videoId}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#1A1B41] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#292a55] disabled:opacity-60"
                        >
                          {enrollingId === `video-course-${course.videoId}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {enrolledIds.has(`video-course-${course.videoId}`) ? "Start" : "Enroll free"}
                        </button>
                      </div>

                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            {loadingPlaylists ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                Loading the highest-ranked playlists...
              </div>
            ) : playlists.length > 0 ? (
              <div className="bfs-course-grid mt-4">
                {playlists.slice(0, 30).map((playlist, index) => {
                  return (
                    <article
                      key={playlist.playlistId}
                      className="bfs-course-card group flex h-full min-h-[400px] min-w-0 flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-colors duration-200 hover:bg-slate-50"
                    >
                      <div role="button" tabIndex={0} aria-label={`Preview ${playlist.title}`} onClick={() => { const course = builtCourses.find((item) => item.sourceType === "playlist" && item.sourceId === playlist.playlistId) || { id: `playlist-course-${playlist.playlistId}`, title: playlist.title, description: playlist.description, thumbnail: playlist.thumbnail, channelTitle: playlist.channelTitle, sourceType: "playlist" as const, sourceId: playlist.playlistId, lessons: [], itemCount: playlist.itemCount }; void openCourse(course); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const course = builtCourses.find((item) => item.sourceType === "playlist" && item.sourceId === playlist.playlistId) || { id: `playlist-course-${playlist.playlistId}`, title: playlist.title, description: playlist.description, thumbnail: playlist.thumbnail, channelTitle: playlist.channelTitle, sourceType: "playlist" as const, sourceId: playlist.playlistId, lessons: [], itemCount: playlist.itemCount }; void openCourse(course); } }} className="relative aspect-video cursor-pointer overflow-hidden bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                        {playlist.thumbnail ? (
                          <img src={playlist.thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ListVideo className="h-7 w-7 text-slate-300" />
                          </div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-white">
                          #{index + 1} ranked
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex-1">
                          <p className="line-clamp-2 text-sm font-bold text-slate-900">
                            {playlist.title}
                          </p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                            {playlist.channelTitle}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{playlist.itemCount} videos</span>
                            {playlist.score !== undefined && (
                              <>
                                <span>·</span>
                                <span>Score {Math.round(playlist.score)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const course = builtCourses.find(
                                (item) =>
                                  item.sourceType === "playlist" &&
                                  item.sourceId === playlist.playlistId
                              ) || {
                                id: `playlist-course-${playlist.playlistId}`,
                                title: playlist.title,
                                description: playlist.description,
                                thumbnail: playlist.thumbnail,
                                channelTitle: playlist.channelTitle,
                                sourceType: "playlist" as const,
                                sourceId: playlist.playlistId,
                                lessons: [],
                                itemCount: playlist.itemCount,
                              };
                              void saveCourse(course);
                            }}
                            disabled={savingId === `playlist-course-${playlist.playlistId}`}
                            aria-label={savedIds.has(`playlist-course-${playlist.playlistId}`) ? "Course saved" : "Save course"}
                            title={savedIds.has(`playlist-course-${playlist.playlistId}`) ? "Saved" : "Save course"}
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border px-2 py-2.5 transition ${savedIds.has(`playlist-course-${playlist.playlistId}`) ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}
                          >
                            {savingId === `playlist-course-${playlist.playlistId}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : savedIds.has(`playlist-course-${playlist.playlistId}`) ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const course = builtCourses.find((item) => item.sourceType === "playlist" && item.sourceId === playlist.playlistId) || { id: `playlist-course-${playlist.playlistId}`, title: playlist.title, description: playlist.description, thumbnail: playlist.thumbnail, channelTitle: playlist.channelTitle, sourceType: "playlist" as const, sourceId: playlist.playlistId, lessons: [], itemCount: playlist.itemCount };
                              handleCourseAction(course);
                            }}
                            disabled={enrollingId === `playlist-course-${playlist.playlistId}`}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                          >
                            {enrollingId === `playlist-course-${playlist.playlistId}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {enrolledIds.has(`playlist-course-${playlist.playlistId}`) ? "Start" : "Enroll free"}
                          </button>
                        </div>

                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                No relevant playlists were returned.
              </div>
            )}
          </div>

            </>
          )}
          {error && (
            <p className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
              YouTube discovery warning: {error}
            </p>
          )}
          {viewerError && (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {viewerError}
            </p>
          )}
        </div>
      </section>

      {viewer && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="BuddyForStudy YouTube player"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewer(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-white sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-300">
                  BuddyForStudy player
                </p>
                <p className="mt-1 truncate text-sm font-bold">
                  {viewer.course.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewer(null)}
                className="rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Close player"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="bg-black">
                  <YouTubeEmbedPlayer
                    videoId={currentLesson?.videoId || ""}
                    title={currentLesson?.title || viewer.course.title}
                  />

                  <div className="border-t border-white/10 p-5 text-white">
                    <p className="text-lg font-extrabold">
                      {currentLesson?.title || viewer.course.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {currentLesson?.channelTitle || viewer.course.channelTitle}
                    </p>
                    {currentLesson?.description && (
                      <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
                        {currentLesson.description}
                      </p>
                    )}
                  </div>
                </div>

                <aside className="border-t border-white/10 bg-slate-900 lg:border-l lg:border-t-0">
                  <div className="border-b border-white/10 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-300">
                      Course content
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {viewer.course.lessons.length} lesson{viewer.course.lessons.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="max-h-[55vh] space-y-2 overflow-y-auto p-3">
                    {viewer.course.lessons.map((lesson, index) => (
                      <button
                        key={lesson.videoId}
                        type="button"
                        onClick={() =>
                          setViewer({
                            course: viewer.course,
                            lessonIndex: index,
                          })
                        }
                        className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                          index === viewer.lessonIndex
                            ? "bg-blue-600 text-white"
                            : "bg-white/5 text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold">
                          {index + 1}
                        </span>
                        <span className="line-clamp-3 text-xs font-semibold leading-5">
                          {lesson.title}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 border-t border-white/10 p-3">
                    <button
                      type="button"
                      disabled={viewer.lessonIndex === 0}
                      onClick={() =>
                        setViewer({
                          course: viewer.course,
                          lessonIndex: Math.max(0, viewer.lessonIndex - 1),
                        })
                      }
                      className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-30"
                      aria-label="Previous lesson"
                    >
                      <ChevronLeft className="mx-auto h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      disabled={viewer.lessonIndex === viewer.course.lessons.length - 1}
                      onClick={() =>
                        setViewer({
                          course: viewer.course,
                          lessonIndex: Math.min(
                            viewer.course.lessons.length - 1,
                            viewer.lessonIndex + 1
                          ),
                        })
                      }
                      className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-30"
                      aria-label="Next lesson"
                    >
                      <ChevronRight className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
