import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Playlist = {
  playlistId: string;
  title: string;
  description: string;
  channelTitle: string;
  itemCount: number;
  thumbnail: string;
  url: string;
};

type Props = {
  query: string;
};

export default function StructuredPlaylists({ query }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setPlaylists([]);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    apiFetch(`/api/discovery/search?q=${encodeURIComponent(normalized)}`)
      .then((data) => {
        if (!cancelled) setPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setPlaylists([]);
          setError(err instanceof Error ? err.message : "Unable to search YouTube courses");
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
          <span>Finding structured YouTube courses for "{query}"...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-medium text-red-700">Could not load YouTube courses.</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Structured playlists
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Courses for "{query}"
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            YouTube playlists organized as ordered learning courses.
          </p>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:block">
          {playlists.length} found
        </span>
      </div>

      {playlists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-medium text-slate-800">No structured playlists found</p>
          <p className="mt-1 text-sm text-slate-500">
            Try a broader search such as "MERN stack", "Python", or "JavaScript".
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
            <article
              key={playlist.playlistId}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Link to={`/playlists/${playlist.playlistId}`} className="block">
                <div className="relative aspect-video overflow-hidden bg-slate-100">
                  {playlist.thumbnail ? (
                    <img
                      src={playlist.thumbnail}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <PlayCircle className="h-10 w-10 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs font-semibold text-white">
                    <PlayCircle className="h-3.5 w-3.5" />
                    {playlist.itemCount} lessons
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="line-clamp-2 text-base font-semibold leading-6 text-slate-900">
                    {playlist.title}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {playlist.channelTitle || "YouTube"}
                  </p>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                    {playlist.description || "Structured video lessons from YouTube."}
                  </p>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-sm font-semibold text-blue-600">
                      View course
                    </span>
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
