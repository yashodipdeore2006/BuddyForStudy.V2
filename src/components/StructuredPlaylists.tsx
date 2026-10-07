import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, GraduationCap, Loader2, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Module = {
  order: number;
  title: string;
  skill: string;
  searchSpecification: {
    duration: {
      minMinutes: number;
      targetMinutes: number;
      maxMinutes: number;
    };
  };
  course: {
    videoId: string;
    title: string;
    description: string;
    channelTitle: string;
    duration: string;
    durationSeconds: number;
    url: string;
    embedUrl: string;
    thumbnail: string;
    score: number;
  } | null;
};

type Result = {
  query: string;
  title: string;
  modules: Module[];
  moduleCount: number;
  foundModules: number;
};

type Props = {
  query: string;
};

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export default function StructuredPlaylists({ query }: Props) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResult(null);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    apiFetch(`/api/discovery/course-search?q=${encodeURIComponent(normalized)}`)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setResult(null);
          setError(err instanceof Error ? err.message : "Unable to build the course");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const totalDuration = useMemo(() => {
    if (!result) return "Self-paced";
    const seconds = result.modules.reduce(
      (sum, module) => sum + Number(module.course?.durationSeconds || 0),
      0
    );
    if (!seconds) return "Self-paced";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
  }, [result]);

  const handleEnroll = async () => {
    if (!result) return;

    if (!session) {
      navigate("/login", {
        state: { from: { pathname: "/courses", search: `?q=${encodeURIComponent(query)}` } }
      });
      return;
    }

    setEnrolling(true);
    setError("");

    try {
      const data = await apiFetch("/api/discovery/course-search/enroll", {
        method: "POST",
        body: JSON.stringify({ q: result.query }),
      });
      const courseId = data.course?._id || data.course?.id;
      if (!courseId) throw new Error("Course was created but no course ID was returned.");
      navigate(`/learn/${courseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to enroll in this course.");
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span>AI is planning the course and finding the best video for each module...</span>
        </div>
      </section>
    );
  }

  if (error && !result) {
    return (
      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-medium text-red-700">Could not build the course.</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  if (!result) return null;

  const firstCourse = result.modules.find((module) => module.course)?.course;
  const available = result.foundModules;
  const allModulesFound = available === result.moduleCount;

  return (
    <section className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-6 py-7 text-white sm:px-8">
          <div className="relative z-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
              AI Course Search
            </p>
            <h2 className="mt-2 text-3xl font-bold">{result.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
              One complete course assembled from independently selected YouTube lessons,
              ordered by prerequisite and matched to AI-generated duration requirements.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                {result.moduleCount} modules
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {totalDuration}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {available}/{result.moduleCount} modules found
              </span>
            </div>
          </div>

          {firstCourse?.thumbnail && (
            <img
              src={firstCourse.thumbnail}
              alt=""
              className="absolute right-0 top-0 hidden h-full w-80 object-cover opacity-20 lg:block"
            />
          )}
        </div>

        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_280px] lg:p-8">
          <div>
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-900">Course Curriculum</h3>
              <p className="mt-1 text-sm text-slate-500">
                Each module contains the single best qualifying video selected for that skill.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              {result.modules.map((module) => (
                <div key={module.order} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex items-start gap-4 p-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
                      {module.order}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900">{module.title}</h4>
                        {module.course && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            Video matched
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        Target: {formatHours(module.searchSpecification.duration.minMinutes)}–
                        {formatHours(module.searchSpecification.duration.maxMinutes)}
                      </p>

                      {module.course ? (
                        <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                          <div className="h-14 w-24 flex-shrink-0 overflow-hidden rounded-md bg-slate-200">
                            {module.course.thumbnail ? (
                              <img src={module.course.thumbnail} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <PlayCircle className="h-5 w-5 text-slate-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-medium text-slate-800">
                              {module.course.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {module.course.channelTitle} · {module.course.duration}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm font-medium text-amber-700">
                          No video matched this module's requirements.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {firstCourse?.thumbnail ? (
                <img src={firstCourse.thumbnail} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-blue-50">
                  <GraduationCap className="h-12 w-12 text-blue-300" />
                </div>
              )}

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Course access
                </p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">Start learning</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enroll once and learn every module from the BuddyForStudy course player.
                </p>

                <button
                  type="button"
                  onClick={handleEnroll}
                  disabled={enrolling || available === 0}
                  className="btn-primary mt-5 w-full justify-center"
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enrolling...
                    </>
                  ) : (
                    <>
                      <GraduationCap className="h-4 w-4" />
                      Enroll Course — Free
                    </>
                  )}
                </button>

                {!allModulesFound && (
                  <p className="mt-3 text-xs leading-5 text-amber-700">
                    Some modules have no qualifying video. Their duration/relevance rules were not relaxed.
                  </p>
                )}

                {error && (
                  <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    {error}
                  </p>
                )}

                <p className="mt-4 text-center text-[11px] text-slate-400">
                  Videos play inside BuddyForStudy after enrollment.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
