export type CourseSearchVideo = { durationSeconds?: number | null };
export type CourseSearchPlaylist = { itemCount?: number | null };

export const MIN_COMPLETE_COURSE_VIDEO_SECONDS = 3 * 60 * 60;
export const MIN_COMPLETE_COURSE_PLAYLIST_ITEMS = 8;

const BROAD_COURSE_TOPICS = /\b(python|javascript|typescript|java|programming|coding|web development|data analytics|data science|machine learning|sql|react|node\.?js|full.?stack|aws|azure|cloud computing)\b/i;
const SPECIFIC_SKILL_TERMS = /\b(functions?|loops?|variables?|lists?|dictionaries|tuples?|sets?|classes?|inheritance|recursion|pandas|numpy|dataframes?|arrays?|api endpoints?|authentication|routing|debugging|syntax|operators|regex|regular expressions|file handling|exception handling)\b/i;

export function isBroadCourseSearch(query: string): boolean {
  const normalized = String(query || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  const wordCount = normalized.split(" ").filter(Boolean).length;
  return wordCount <= 5 && BROAD_COURSE_TOPICS.test(normalized) && !SPECIFIC_SKILL_TERMS.test(normalized);
}

export function filterCourseSearchFallbackResults<TVideo extends CourseSearchVideo, TPlaylist extends CourseSearchPlaylist>(
  query: string,
  videos: TVideo[],
  playlists: TPlaylist[]
): { videos: TVideo[]; playlists: TPlaylist[]; requiresCompleteCourse: boolean } {
  const requiresCompleteCourse = isBroadCourseSearch(query);
  const minimumVideoSeconds = requiresCompleteCourse ? MIN_COMPLETE_COURSE_VIDEO_SECONDS : 0;
  const minimumPlaylistItems = requiresCompleteCourse ? MIN_COMPLETE_COURSE_PLAYLIST_ITEMS : 2;

  return {
    videos: videos.filter((video) => Number(video.durationSeconds || 0) >= minimumVideoSeconds),
    playlists: playlists.filter((playlist) => Number(playlist.itemCount || 0) >= minimumPlaylistItems),
    requiresCompleteCourse
  };
}
