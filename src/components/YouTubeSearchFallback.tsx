import { BookOpen, ExternalLink, ListVideo, PlayCircle } from "lucide-react";

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

export default function YouTubeSearchFallback({
  query,
  courses,
  playlists,
  loadingPlaylists = false,
  error = "",
}: Props) {
  const hasAnything = courses.length > 0 || playlists.length > 0;

  if (!hasAnything && !loadingPlaylists && !error) {
    return (
      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-800">No BuddyForStudy or YouTube results found</p>
        <p className="mt-1 text-sm text-slate-500">
          Try a broader term or use Build with AI.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-6">
      <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
            YouTube discovery
          </p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
            No matching BuddyForStudy course yet
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            We searched YouTube for “{query}” and selected high-quality long-form learning resources.
            These are recommendations, not automatically saved BuddyForStudy courses.
          </p>
        </div>

        {courses.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-blue-600" />
              <h4 className="font-bold text-slate-900">Top course videos</h4>
            </div>

            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <a
                  key={course.videoId}
                  href={course.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="relative aspect-video overflow-hidden bg-slate-100">
                    {course.thumbnail ? (
                      <img
                        src={course.thumbnail}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <PlayCircle className="h-10 w-10 text-slate-300" />
                      </div>
                    )}
                    <span className="absolute bottom-2 right-2 rounded-md bg-slate-950/85 px-2 py-1 text-[11px] font-bold text-white">
                      {course.duration}
                    </span>
                  </div>

                  <div className="p-4">
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
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                      Open on YouTube
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7">
          <div className="flex items-center gap-2">
            <ListVideo className="h-4 w-4 text-blue-600" />
            <h4 className="font-bold text-slate-900">YouTube playlists</h4>
          </div>

          {loadingPlaylists ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Loading relevant playlists...
            </div>
          ) : playlists.length > 0 ? (
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {playlists.slice(0, 6).map((playlist) => (
                <a
                  key={playlist.playlistId}
                  href={playlist.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {playlist.thumbnail ? (
                      <img src={playlist.thumbnail} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ListVideo className="h-7 w-7 text-slate-300" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-bold text-slate-900">{playlist.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{playlist.channelTitle}</p>
                    <p className="mt-2 text-[11px] text-slate-400">{playlist.itemCount} videos</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">
                      Open playlist
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              No relevant playlists were returned.
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
            Playlist discovery: {error}
          </p>
        )}
      </div>
    </section>
  );
}
