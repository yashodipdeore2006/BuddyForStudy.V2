import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Loader2,
  PlayCircle,
  X,
} from "lucide-react";

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
  sourceType: "playlist" | "video";
  sourceId: string;
  lessons: CourseLesson[];
  itemCount: number;
};

type Viewer = {
  course: BuiltCourse;
  lessonIndex: number;
};

type Props = {
  query: string;
  courses: YouTubeCourse[];
  playlists: YouTubePlaylist[];
  loadingPlaylists?: boolean;
  error?: string;
};

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value || 0);
}

function toEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&playsinline=1`;
}

function formatMinutes(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export default function YouTubeSearchFallback({
  query,
  courses,
  playlists,
  loadingPlaylists = false,
  error = "",
}: Props) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const { session } = useAuth();
  const navigate = useNavigate();

  const builtCourses = useMemo<BuiltCourse[]>(() => {
    const playlistCourses = playlists.slice(0, 3).map((playlist, index) => ({
      id: `playlist-course-${playlist.playlistId}`,
      title: playlist.title,
      description: `BuddyForStudy course built from the #${index + 1} ranked YouTube playlist for “${query}”.`,
      thumbnail: playlist.thumbnail,
      channelTitle: playlist.channelTitle,
      sourceType: "playlist" as const,
      sourceId: playlist.playlistId,
      lessons: [],
      itemCount: playlist.itemCount,
    }));

    if (playlistCourses.length >= 3) return playlistCourses;

    const used = new Set(playlistCourses.map((course) => course.sourceId));
    const videoCourses = courses
      .filter((video) => !used.has(video.videoId))
      .slice(0, 3 - playlistCourses.length)
      .map((video, index) => ({
        id: `video-course-${video.videoId}`,
        title: `${query} Course ${index + playlistCourses.length + 1}`,
        description: `BuddyForStudy course built from the #${index + playlistCourses.length + 1} ranked YouTube learning resource.`,
        thumbnail: video.thumbnail,
        channelTitle: video.channelTitle,
        sourceType: "video" as const,
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
        }),
      });
      setSavedIds((current) => new Set(current).add(course.id));
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
        }),
      });

      const courseId = data?.course?._id;
      if (!courseId) throw new Error("The course could not be added to My Learning.");

      setEnrolledIds((current) => new Set(current).add(course.id));
      navigate(`/courses/${courseId}/roadmap`);
    } catch (error) {
      setViewerError(
        error instanceof Error ? error.message : "Unable to enroll in this course."
      );
    } finally {
      setEnrollingId(null);
    }
  };

  const openCourse = async (course: BuiltCourse) => {
    setViewerError("");
    setOpeningId(course.id);

    try {
      if (course.sourceType === "video") {
        setViewer({ course, lessonIndex: 0 });
        return;
      }

      const data = await apiFetch(
        `/api/discovery/playlists/${encodeURIComponent(course.sourceId)}`
      );
      const source = data?.course;

      const lessons: CourseLesson[] = (source?.lessons || [])
        .map((lesson: any) => {
          const videoId = String(lesson.videoId || lesson.id || "");
          if (!videoId) return null;

          return {
            videoId,
            title: lesson.title || "Untitled lesson",
            description: lesson.description || "",
            channelTitle: lesson.channelTitle || source?.channelTitle || "",
            duration: lesson.duration || formatMinutes(Number(lesson.durationSeconds || 0)),
            durationSeconds: Number(lesson.durationSeconds || 0),
            thumbnail: lesson.thumbnail || "",
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
  const hasAnything = builtCourses.length > 0 || courses.length > 0 || playlists.length > 0;

  if (!hasAnything && !loadingPlaylists && !error) {
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
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
            Learning discovery
          </p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
            No matching BuddyForStudy course yet
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            We ranked the best YouTube learning resources for “{query}”. The top three
            resources are packaged into course-style experiences, and everything opens
            inside the BuddyForStudy player.
          </p>

          {builtCourses.length > 0 && (
            <div className="mt-7">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <div>
                  <h4 className="font-bold text-slate-900">Top 3 courses</h4>
                  <p className="text-xs text-slate-500">
                    Built from the highest-ranked YouTube playlists, with videos used as fallback.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {builtCourses.map((course, index) => (
                  <article
                    key={course.id}
                    className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="relative aspect-video overflow-hidden bg-slate-100">
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
                        <p className="line-clamp-2 text-sm font-extrabold leading-5 text-slate-900">
                          {course.title}
                        </p>
                        <p className="mt-2 truncate text-xs font-semibold text-slate-500">
                          {course.channelTitle}
                        </p>
                        <p className="mt-3 text-[11px] text-slate-500">
                          {course.itemCount} {course.sourceType === "playlist" ? "videos" : "lesson"}
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void saveCourse(course)}
                          disabled={savingId === course.id}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                            savedIds.has(course.id)
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          {savingId === course.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BookOpen className="h-3.5 w-3.5" />
                          )}
                          {savedIds.has(course.id) ? "Saved" : "Save Course"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void enrollCourse(course)}
                          disabled={enrollingId === course.id || enrolledIds.has(course.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {enrollingId === course.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Adding...
                            </>
                          ) : enrolledIds.has(course.id) ? (
                            "Enrolled"
                          ) : (
                            "Enroll Now"
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void openCourse(course)}
                        disabled={openingId === course.id}
                        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        {openingId === course.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4" />
                            Preview in BuddyForStudy
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {courses.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-blue-600" />
                <div>
                  <h4 className="font-bold text-slate-900">Top-ranked YouTube videos</h4>
                  <p className="text-xs text-slate-500">
                    The same ranked resources used to build the course options above.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {courses.slice(0, 3).map((course, index) => (
                  <button
                    key={course.videoId}
                    type="button"
                    onClick={() => openVideo(course)}
                    className="group flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="relative aspect-video overflow-hidden bg-slate-100">
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
                      <p className="mt-auto pt-4 text-xs font-bold text-blue-600">
                        Watch inside BuddyForStudy →
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <div className="flex items-center gap-2">
              <ListVideo className="h-4 w-4 text-blue-600" />
              <div>
                <h4 className="font-bold text-slate-900">Top YouTube playlists & courses</h4>
                <p className="text-xs text-slate-500">
                  Ranked playlist/course series. They open as a multi-lesson course inside BuddyForStudy.
                </p>
              </div>
            </div>

            {loadingPlaylists ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                Loading the highest-ranked playlists...
              </div>
            ) : playlists.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {playlists.slice(0, 6).map((playlist, index) => {
                  const built = builtCourses.find(
                    (course) =>
                      course.sourceType === "playlist" &&
                      course.sourceId === playlist.playlistId
                  );

                  return (
                    <button
                      key={playlist.playlistId}
                      type="button"
                      onClick={() =>
                        void openCourse(
                          built || {
                            id: `playlist-resource-${playlist.playlistId}`,
                            title: playlist.title,
                            description: playlist.description,
                            thumbnail: playlist.thumbnail,
                            channelTitle: playlist.channelTitle,
                            sourceType: "playlist",
                            sourceId: playlist.playlistId,
                            lessons: [],
                            itemCount: playlist.itemCount,
                          }
                        )
                      }
                      disabled={openingId === (built?.id || `playlist-resource-${playlist.playlistId}`)}
                      className="group flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                    >
                      <div className="relative aspect-video w-full flex-shrink-0 overflow-hidden bg-slate-100">
                        {playlist.thumbnail ? (
                          <img src={playlist.thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ListVideo className="h-7 w-7 text-slate-300" />
                          </div>
                        )}
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-4">
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
                        <p className="mt-auto pt-4 text-xs font-bold text-blue-600">
                          Open inside BuddyForStudy →
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                No relevant playlists were returned.
              </div>
            )}
          </div>

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
                  <div className="aspect-video w-full">
                    <iframe
                      title={currentLesson?.title || viewer.course.title}
                      src={currentLesson?.embedUrl || ""}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>

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
