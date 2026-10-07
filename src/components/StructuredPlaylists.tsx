import { useEffect, useState } from "react";
import { ExternalLink, Loader2, PlayCircle, Clock3 } from "lucide-react";
import { apiFetch } from "@/lib/api";

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
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
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
          setError(err instanceof Error ? err.message : "Unable to build the YouTube course");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

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

  if (error) {
    return (
      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-medium text-red-700">Could not build the course.</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  if (!result) return null;

  return (
    <section className="mt-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            AI Course Search
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{result.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            One independently selected YouTube course for each skill, ordered as a learning path.
          </p>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:block">
          {result.foundModules}/{result.moduleCount} modules found
        </span>
      </div>

      <div className="space-y-5">
        {result.modules.map((module) => (
          <article key={module.order} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Module {module.order}
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{module.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Target course length: {formatHours(module.searchSpecification.duration.minMinutes)}–{formatHours(module.searchSpecification.duration.maxMinutes)}
              </p>
            </div>

            {module.course ? (
              <div className="grid gap-5 p-5 md:grid-cols-[280px_1fr]">
                <a href={module.course.url} target="_blank" rel="noreferrer" className="group relative block aspect-video overflow-hidden rounded-xl bg-slate-100">
                  {module.course.thumbnail ? (
                    <img src={module.course.thumbnail} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <PlayCircle className="h-10 w-10 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition group-hover:bg-slate-950/20">
                    <PlayCircle className="h-12 w-12 text-white opacity-0 transition group-hover:opacity-100" />
                  </div>
                </a>

                <div className="min-w-0">
                  <h4 className="text-lg font-semibold text-slate-900">{module.course.title}</h4>
                  <p className="mt-1 text-sm font-medium text-slate-500">{module.course.channelTitle}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {module.course.duration}
                    </span>
                    <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">Duration matched</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                    {module.course.description || "Selected YouTube course matching the AI-generated search requirements."}
                  </p>
                  <a href={module.course.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Open course
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm font-medium text-amber-700">No video matched this module's requirements.</p>
                <p className="mt-1 text-xs text-slate-500">
                  The system did not relax the AI duration constraint just to return an unrelated video.
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
