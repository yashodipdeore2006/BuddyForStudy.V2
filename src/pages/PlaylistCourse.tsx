import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, PlayCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";

export default function PlaylistCourse() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [showAudit, setShowAudit] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!playlistId) return;
    apiFetch(`/api/discovery/playlists/${playlistId}`)
      .then((data) => setCourse(data.course))
      .catch((err) => setError(err.message || "Unable to load course"))
      .finally(() => setLoading(false));
  }, [playlistId]);

  const totalSeconds = useMemo(
    () => (course?.lessons || []).reduce((sum: number, lesson: any) => sum + (lesson.durationSeconds || 0), 0),
    [course]
  );

  const duration =
    totalSeconds >= 3600
      ? `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`
      : `${Math.floor(totalSeconds / 60)}m`;

  async function auditCourse() {
    if (!course) return;

    setAuditing(true);
    setError("");

    try {
      const payload = {
        query: course.title,
        canonicalTopic: course.title,
        intent: "youtube_playlist",
        careerOutcome: "",
        level: "Beginner",
        skillGraph: [],
        course: {
          title: course.title,
          description: course.description,
          category: "YouTube Course",
          level: "Beginner",
          duration,
          learningOutcomes: [
            "Complete the lessons in order",
            "Track progress across the course",
            "Practice concepts while learning",
          ],
          modules: [
            {
              title: course.title,
              description: course.description,
              skillIds: [],
              order: 1,
              quiz: null,
              lessons: course.lessons.map((lesson: any) => ({
                id: lesson.id,
                title: lesson.title,
                description: lesson.description,
                type: "tutorial",
                tutorial: {
                  content: lesson.description,
                  videos: [
                    {
                      videoId: lesson.videoId,
                      title: lesson.title,
                      url: lesson.url,
                      embedUrl: lesson.embedUrl,
                      thumbnail: lesson.thumbnail,
                      channelTitle: lesson.channelTitle,
                    },
                  ],
                  resources: [lesson.url],
                  resourceStatus: "ready",
                },
              })),
            },
          ],
        },
      };

      const data = await apiFetch("/api/roadmaps", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const id = data.roadmap?._id || data.roadmap?.id;
      if (!id) throw new Error("Course could not be saved");

      navigate(routes.savedRoadmap(id));
    } catch (err: any) {
      setError(err.message || "Unable to add course");
    } finally {
      setAuditing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link to={routes.explore()} className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Course preview
            </p>
            <h1 className="truncate text-lg font-semibold text-slate-900">
              {course.title}
            </h1>
          </div>

          <button
            onClick={() => setShowAudit(true)}
            className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white"
          >
            Add to My Learning
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_.7fr]">
          <div>
            <div className="overflow-hidden rounded-2xl bg-slate-100">
              <img
                src={course.thumbnail}
                alt=""
                className="aspect-video w-full object-cover"
              />
            </div>

            <h2 className="mt-6 text-3xl font-serif text-slate-900">
              {course.title}
            </h2>

            <p className="mt-3 text-slate-500">
              {course.channelTitle} · {course.itemCount} lessons · {duration}
            </p>

            <p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-600">
              {course.description || "A structured learning playlist from YouTube."}
            </p>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Course content
            </p>

            <div className="mt-4 space-y-2">
              {course.lessons.slice(0, 13).map((lesson: any) => (
                <div key={lesson.id} className="flex gap-3 rounded-xl bg-white p-3">
                  <PlayCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {lesson.order}. {lesson.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{lesson.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>

      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <img
              src={course.thumbnail}
              alt=""
              className="aspect-video w-full object-cover"
            />

            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                Course access
              </p>

              <h3 className="mt-2 text-2xl font-serif text-slate-900">
                Add this course?
              </h3>

              <p className="mt-4 font-medium text-slate-900">{course.title}</p>
              <p className="mt-1 text-sm text-slate-500">
                {course.channelTitle} · {course.itemCount} lessons
              </p>

              <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
                Adding the course saves your progress and turns the playlist into
                an ordered learning workspace.
              </div>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowAudit(false)}
                  className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700"
                >
                  Not now
                </button>

                <button
                  disabled={auditing}
                  onClick={auditCourse}
                  className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {auditing ? "Adding..." : "Add course"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
