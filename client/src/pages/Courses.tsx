import { useEffect, useState, useMemo, useRef, useCallback, type FormEvent } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, CourseLevel, LessonType, QuizContent, TutorialContent } from '@/types';
import CourseCard from '@/components/CourseCard';
import { CourseGridSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import { Search, BookOpen, Filter, X, Sparkles, Loader2, ChevronDown, ChevronRight, Play, CircleHelp, FolderKanban, GraduationCap, ExternalLink } from 'lucide-react';
import YouTubeSearchFallback from '@/components/YouTubeSearchFallback';
import { routes } from "@/lib/routes";
import { getNicheQuestions, getPurposeQuestions, getSkillChecklist } from "@/data/buildWithAiQuestionPacks";
import { getRoadmapDurationSummary } from "@/lib/roadmapDuration.js";

// The progressive intake is opt-in for local/staged testing and must match server INTENT_V2.
const INTENT_V2 = import.meta.env.VITE_INTENT_V2 === "true";
const ASYNC_ROADMAP = import.meta.env.VITE_ASYNC_ROADMAP === "true";
type IntentQuestion = { id: string; type: "single" | "multi" | "text" | "paste" | "checklist" | "time"; text: string; options?: string[]; allowText?: boolean; optional: boolean; when?: string; why?: string; changes?: string[] };
type IntentProfile = { topic?: string; domain?: string; scope?: "narrow" | "broad"; goal?: "job_ready" | "exam" | "project" | "learn" | null; level?: CourseLevel; knownSkills?: string[]; minutesPerDay?: number; language?: string; targetRole?: string | null; targetCompany?: string | null; examName?: string | null; examDate?: string | null; syllabusText?: string | null; projectIdea?: string | null; deadline?: string | null; outcome?: string; preferences?: Record<string, string> };
type IntentParse = { valid: boolean; profile: IntentProfile | null; confidences: Record<string, number>; domain: string; scope: string; options: { roles: string[]; exams: string[]; projectIdeas: string[] }; questionPlan: IntentQuestion[]; assumed?: boolean; assumptions?: { field: string; value: unknown }[]; inferredGoal?: string; fallback?: boolean };

const levels: CourseLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

const BUILD_WITH_AI_LANGUAGES = [
  { code: "en", label: "English" }, { code: "hi", label: "Hindi" }, { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" }, { code: "ta", label: "Tamil" }, { code: "te", label: "Telugu" },
  { code: "bn", label: "Bengali" }, { code: "kn", label: "Kannada" }, { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" }, { code: "ur", label: "Urdu" }, { code: "or", label: "Odia" },
  { code: "es", label: "Spanish" }, { code: "fr", label: "French" }, { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" }, { code: "ja", label: "Japanese" }, { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" }
] as const;

const COURSE_DEPTH_OPTIONS = [
  { value: "short", label: "Short course", duration: "About 8–15 hours", description: "A focused introduction to the essentials, fundamentals and most important concepts." },
  { value: "medium", label: "Medium course", duration: "About 25–45 hours", description: "Core concepts, useful tools, guided practice and selected real-world projects." },
  { value: "complete", label: "Complete course", duration: "Subject-based · comprehensive", description: "Prerequisites, foundations, the relevant ecosystem or full stack, advanced topics, projects and assessments." }
] as const;


type RawCourse = {
  _id?: string;
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  category?: string;
  level?: CourseLevel;
  duration?: string | number;
  thumbnail?: string | null;
  learningOutcomes?: string[];
  learning_outcomes?: string[];
  modules?: Course["modules"];
  isPublished?: boolean;
  enrollmentCount?: number;
  enrollment_count?: number;
  ratingAverage?: number;
  rating_average?: number;
  ratingCount?: number;
  rating_count?: number;
  reviewStats?: { average?: number; count?: number };
  stats?: { average?: number; count?: number };
  cardMetadata?: Course["cardMetadata"];
  generation?: { mode?: string; sourceResourceType?: string | null; query?: string };
  moduleCount?: number;
  lessonCount?: number;
  pricing?: Course["pricing"];
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type SearchEnrollmentRow = {
  status?: string;
  course?: string | { _id?: string; id?: string } | null;
  course_id?: string;
  courseId?: string;
};

type AiLesson = {
  id?: string;
  _id?: string;
  title: string;
  description?: string;
  type: LessonType;
  tutorial?: { videos?: NonNullable<TutorialContent["videos"]> };
  quiz?: Partial<QuizContent>;
};

type AiModule = {
  id?: string;
  _id?: string;
  canonicalSkillId?: string;
  skillIds?: string[];
  title: string;
  description?: string;
  order?: number;
  lessons?: AiLesson[];
};

type AiSkillGraphNode = {
  id: string;
  name: string;
  prerequisites?: string[];
};

type AiRoadmap = {
  skillGraph?: AiSkillGraphNode[];
  query?: string;
  status?: string;
  draftId?: string;
  roadmapId?: string | null;
  course: {
    _id?: string;
    id?: string;
    title: string;
    description?: string;
    level?: CourseLevel;
    duration?: string;
    isPublished?: boolean;
    modules?: AiModule[];
  };
  schedule?: {
    scheduleWarning?: string | null;
    minutesPerDay?: number;
    studyDaysPerWeek?: number;
    requiredDailyMinutes?: number;
    availableDays?: number | null;
    deadline?: string | null;
    estimatedMinutes?: number;
  };
  personalization?: {
    studyTimeMinutesPerDay?: number;
    estimatedStudyMinutes?: number;
    courseDepth?: "short" | "medium" | "complete" | string;
    courseDepthLabel?: string;
    selfPaced?: boolean;
    resourceVideoMinutes?: number;
    resourceLanguage?: string;
    resourceLanguages?: string[];
    resourceCoverage?: {
      tutorialLessonCount?: number;
      lessonsWithResources?: number;
      uniqueVideoCount?: number;
      coverageRatio?: number;
    };
    goals?: string[];
    skippedSkills?: string[];
    rationale?: string[];
  };
};

type SearchDiscovery = {
  mode?: string;
  query: string;
  courseRecommendations?: Parameters<typeof YouTubeSearchFallback>[0]["courses"];
  playlists?: Parameters<typeof YouTubeSearchFallback>[0]["playlists"];
  curatedResources?: Parameters<typeof YouTubeSearchFallback>[0]["curatedResources"];
  curationMeta?: Parameters<typeof YouTubeSearchFallback>[0]["curationMeta"];
  youtubeError?: string;
};

function parseStudyMinutes(value: string | number | undefined, fallback = 60): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(15, Math.min(720, Math.round(value)));
  const text = String(value || "").trim().toLowerCase();
  if (!text) return Math.max(15, Math.min(720, Number(fallback) || 60));
  if (/3\s*\+/.test(text)) return 180;
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/);
  if (minuteMatch) return Math.max(15, Math.min(720, Math.round(Number(minuteMatch[1]))));
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hour)/);
  if (hourMatch) return Math.max(15, Math.min(720, Math.round(Number(hourMatch[1]) * 60)));
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.max(15, Math.min(720, Math.round(numeric))) : Math.max(15, Math.min(720, Number(fallback) || 60));
}

function parseAnswerList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(/[,|]/).map((item) => item.trim()).filter(Boolean))];
}

type CatalogUrlState = { query: string; level: CourseLevel | "all"; category: string; sort: "recent" | "popular" | "title"; page: number };

function readCatalogUrlState(search: string): CatalogUrlState {
  const params = new URLSearchParams(search);
  const level = params.get("level");
  const sort = params.get("sort");
  const requestedPage = Number(params.get("page") || 1);
  return {
    query: (params.get("q") || "").trim(),
    level: levels.includes(level as CourseLevel) ? level as CourseLevel : "all",
    category: (params.get("category") || "").trim() || "all",
    sort: sort === "popular" || sort === "title" ? sort : "recent",
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1,
  };
}


type ExploreSnapshot = {
  version: 1;
  savedAt: number;
  pathname: string;
  search: string;
  scrollY: number;
  courses: Course[];
  youtubeDiscovery: SearchDiscovery | null;
};
const EXPLORE_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const EXPLORE_SNAPSHOT_PREFIX = "bfs-explore-snapshot:v1:";
function exploreSnapshotKey(entryKey: string, search: string): string {
  return EXPLORE_SNAPSHOT_PREFIX + encodeURIComponent(entryKey || "default") + ":" + encodeURIComponent(search || "");
}
function readExploreSnapshot(entryKey: string, pathname: string, search: string): ExploreSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(exploreSnapshotKey(entryKey, search));
    if (!raw) return null;
    const value = JSON.parse(raw) as ExploreSnapshot;
    if (value.version !== 1 || value.pathname !== pathname || value.search !== search || !Array.isArray(value.courses) || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > EXPLORE_SNAPSHOT_TTL_MS) return null;
    return value;
  } catch { return null; }
}
function writeExploreSnapshot(entryKey: string, snapshot: ExploreSnapshot): void {
  try {
    const key = exploreSnapshotKey(entryKey, snapshot.search);
    window.sessionStorage.setItem(key, JSON.stringify(snapshot));
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const candidate = window.sessionStorage.key(index);
      if (candidate?.startsWith(EXPLORE_SNAPSHOT_PREFIX)) keys.push(candidate);
    }
    keys.sort((a, b) => {
      try { return (JSON.parse(window.sessionStorage.getItem(b) || "{}").savedAt || 0) - (JSON.parse(window.sessionStorage.getItem(a) || "{}").savedAt || 0); }
      catch { return 0; }
    });
    keys.slice(12).forEach((candidate) => window.sessionStorage.removeItem(candidate));
  } catch { /* Storage may be unavailable or full; Explore remains functional. */ }
}

function mapCourse(raw: RawCourse): Course {
  return {
    id: String(raw._id ?? raw.id),
    title: raw.title || "Untitled course",
    slug: raw.slug || "",
    description: raw.description || "",
    category: raw.category || "Uncategorized",
    level: raw.level || "Beginner",
    duration: String(raw.duration ?? ''),
    thumbnail: raw.thumbnail ?? null,
    learning_outcomes: raw.learningOutcomes ?? raw.learning_outcomes ?? [],
    modules: raw.modules ?? [],
    is_published: raw.isPublished ?? true,
    enrollment_count: raw.enrollmentCount ?? raw.enrollment_count,
    enrollmentCount: raw.enrollmentCount ?? raw.enrollment_count,
    ratingAverage: Number(raw.ratingAverage ?? raw.rating_average ?? raw.reviewStats?.average ?? raw.stats?.average ?? 0),
    ratingCount: Number(raw.ratingCount ?? raw.rating_count ?? raw.reviewStats?.count ?? raw.stats?.count ?? 0),
    cardMetadata: raw.cardMetadata && typeof raw.cardMetadata === "object" ? raw.cardMetadata : undefined,
    generation: raw.generation && typeof raw.generation === "object" ? {
      mode: ["normal", "ai", "module", "discovery"].includes(raw.generation.mode || "") ? raw.generation.mode as NonNullable<Course["generation"]>["mode"] : undefined,
      sourceResourceType: ["video", "playlist", "series"].includes(raw.generation.sourceResourceType || "") ? raw.generation.sourceResourceType as NonNullable<Course["generation"]>["sourceResourceType"] : null,
      query: String(raw.generation.query ?? ""),
    } : undefined,
    module_count: Number.isFinite(Number(raw.moduleCount)) ? Number(raw.moduleCount) : undefined,
    lesson_count: Number.isFinite(Number(raw.lessonCount)) ? Number(raw.lessonCount) : undefined,
    pricing: raw.pricing,
    created_by: raw.createdBy ?? null,
    created_at: raw.createdAt ?? '',
    updated_at: raw.updatedAt ?? '',
  };
}

export default function Courses() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const initialSnapshot = readExploreSnapshot(location.key, location.pathname, location.search);
  const hasInitialSnapshot = useRef(Boolean(initialSnapshot));
  const [courses, setCourses] = useState<Course[]>(initialSnapshot?.courses || []);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!initialSnapshot);
  const [catalogError, setCatalogError] = useState("");
  const [youtubeDiscovery, setYoutubeDiscovery] = useState<SearchDiscovery | null>(initialSnapshot?.youtubeDiscovery || null);
  const [youtubePlaylistsLoading, setYoutubePlaylistsLoading] = useState(false);
  const [youtubePlaylistError, setYoutubePlaylistError] = useState("");
  const initialCatalogState = readCatalogUrlState(location.search);
  const [searchQuery, setSearchQuery] = useState(initialCatalogState.query);
  const [catalogQuery, setCatalogQuery] = useState(initialCatalogState.query);
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | 'all'>(initialCatalogState.level);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCatalogState.category);
  const [catalogSort, setCatalogSort] = useState<"recent" | "popular" | "title">(initialCatalogState.sort);
  const [catalogPage, setCatalogPage] = useState(initialCatalogState.page);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  const catalogPageSize = 12;

  useEffect(() => {
    if (!initialSnapshot || navigationType !== "POP") return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, initialSnapshot.scrollY || 0), behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
    // Restore once for this history entry; later URL changes must not replay an old scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const revalidateOnHistoryReturn = () => {
      if (window.location.pathname !== "/explore") return;
      // The Explore component may be retained while another route is shown. A
      // popstate event still signals a history return even when it is not remounted.
      hasInitialSnapshot.current = true;
      setCatalogRetryKey((current) => current + 1);
    };
    const revalidateOnPageRestore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A document restored from the back/forward cache resumes its previous React
      // tree, so explicitly refresh the public catalogue after the browser restores it.
      hasInitialSnapshot.current = true;
      setCatalogRetryKey((current) => current + 1);
    };
    window.addEventListener("popstate", revalidateOnHistoryReturn);
    window.addEventListener("pageshow", revalidateOnPageRestore);
    return () => {
      window.removeEventListener("popstate", revalidateOnHistoryReturn);
      window.removeEventListener("pageshow", revalidateOnPageRestore);
    };
  }, []);

  useEffect(() => {
    const entryKey = location.key;
    const pathname = location.pathname;
    const search = location.search;
    return () => {
      if (loading) return;
      writeExploreSnapshot(entryKey, {
        version: 1,
        savedAt: Date.now(),
        pathname,
        search,
        scrollY: Math.max(0, window.scrollY || 0),
        courses,
        youtubeDiscovery,
      });
    };
  }, [courses, loading, location.key, location.pathname, location.search, youtubeDiscovery]);

  const updateCatalogUrl = useCallback((updates: Partial<CatalogUrlState>, options: { replace?: boolean } = {}) => {
    const params = new URLSearchParams(location.search);
    const current = readCatalogUrlState(location.search);
    const next = { ...current, ...updates };
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) params.delete(key);
      else params.set(key, value);
    };
    setOrDelete("q", next.query.trim(), "");
    setOrDelete("level", next.level, "all");
    setOrDelete("category", next.category, "all");
    setOrDelete("sort", next.sort, "recent");
    setOrDelete("page", String(next.page), "1");
    const search = params.toString();
    const nextSearch = search ? `?${search}` : "";
    if (nextSearch !== location.search) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: options.replace ?? false, state: location.state });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const next = readCatalogUrlState(location.search);
    setCatalogQuery(next.query);
    setSearchQuery(next.query);
    setSelectedLevel(next.level);
    setSelectedCategory(next.category);
    setCatalogSort(next.sort);
    setCatalogPage(next.page);

    const params = new URLSearchParams(location.search);
    const canonical = new URLSearchParams(params);
    const canonicalSet = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) canonical.delete(key);
      else canonical.set(key, value);
    };
    canonicalSet("q", next.query, "");
    canonicalSet("level", next.level, "all");
    canonicalSet("category", next.category, "all");
    canonicalSet("sort", next.sort, "recent");
    canonicalSet("page", String(next.page), "1");
    if (canonical.toString() !== params.toString()) {
      const search = canonical.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true, state: location.state });
    }
  }, [location.pathname, location.search, location.state, navigate]);
  const { session } = useAuth();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRoadmap, setAiRoadmap] = useState<AiRoadmap | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const aiDialogRef = useRef<HTMLElement | null>(null);
  const aiLoadingRef = useRef(false);
  const [aiTopic, setAiTopic] = useState('');
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentResult, setIntentResult] = useState<IntentParse | null>(null);
  const [intentAnswers, setIntentAnswers] = useState<Record<string, string>>({});
  const [intentConfirmedFields, setIntentConfirmedFields] = useState<string[]>([]);
  const markIntentAnswer = (key: string, value: string) => {
    setIntentAnswers((previous) => ({ ...previous, [key]: value }));
    setIntentConfirmedFields((previous) => previous.includes(key) ? previous : [...previous, key]);
  };
  const [retiredIntentQuestionIds, setRetiredIntentQuestionIds] = useState<string[]>([]);
  const [intentWizardStep, setIntentWizardStep] = useState(1);

  const [aiGoal, setAiGoal] = useState<string>('Explore a personal interest');
  const [aiGoalTouched, setAiGoalTouched] = useState(false);
  const [aiLevelTouched, setAiLevelTouched] = useState(false);
    const [aiLevel, setAiLevel] = useState<CourseLevel>('Beginner');
  const [aiStudyTime, setAiStudyTime] = useState(60);
  const [aiStudyDays, setAiStudyDays] = useState("5");
  const [aiScope, setAiScope] = useState<"narrow" | "broad">("broad");
  const [aiLanguagePref, setAiLanguagePref] = useState("en");
  const [aiLessonStyle, setAiLessonStyle] = useState("Project-first");
  const [aiKnownSkills, setAiKnownSkills] = useState('');
  const [aiCourseDepth, setAiCourseDepth] = useState<"short" | "medium" | "complete">("complete");
  const [aiResourceLanguages, setAiResourceLanguages] = useState<string[]>(["en", "hi"]);

  const [aiEnrolling, setAiEnrolling] = useState(false);
  const [aiEnrollError, setAiEnrollError] = useState<string | null>(null);
  const [expandedAiModules, setExpandedAiModules] = useState<Set<number>>(new Set([0]));
  const [curationFeedbackSent, setCurationFeedbackSent] = useState<Record<string, string>>({});
  const sendCurationFeedback = async (event: "helpful" | "outdated" | "wrong_level", module: AiModule, video: NonNullable<TutorialContent["videos"]>[number]) => {
    const resourceId = String(video.videoId || "");
    if (!resourceId) return;
    try {
      await apiFetch("/api/ai/curation-feedback", {
        method: "POST",
        body: JSON.stringify({
          event,
          query: aiTopic.trim() || aiRoadmap?.course.title || "AI learning roadmap",
          resourceId,
          resourceType: "video",
          skillId: module.canonicalSkillId || module.skillIds?.[0] || module.title,
          courseId: aiRoadmap?.course._id || aiRoadmap?.course.id || undefined
        })
      });
      setCurationFeedbackSent((previous) => ({ ...previous, [resourceId]: event }));
    } catch {
      setAiError("Your resource feedback could not be saved. You can keep using the roadmap.");
    }
  };


  useEffect(() => {
    if (!ASYNC_ROADMAP || !session) return;
    const draftId = window.localStorage.getItem('bfs_async_roadmap_draft');
    if (!draftId) return;
    let cancelled = false;
    let timer: number | undefined;
    const resumeBuild = async () => {
      try {
        while (!cancelled) {
          const status = await apiFetch<{ status: string; result?: AiRoadmap; errorMessage?: string }>(`/api/ai/roadmap/${encodeURIComponent(draftId)}?_=${Date.now()}`);
          if (cancelled) return;
          if (status.result) setAiRoadmap(status.result);
          if (status.status === 'ready' || status.status === 'failed') {
            window.localStorage.removeItem('bfs_async_roadmap_draft');
            if (status.status === 'failed') setAiError(status.errorMessage || 'The roadmap build failed. Please try again.');
            return;
          }
          await new Promise<void>((resolve) => { timer = window.setTimeout(resolve, 1200); });
        }
      } catch {
        if (!cancelled) setAiError('Could not resume the roadmap build. You can retry from Build with AI.');
      }
    };
    void resumeBuild();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [session]);

  useEffect(() => {
    async function fetchCourses() {
      setLoading(!hasInitialSnapshot.current);
      try {
        setCatalogError("");
        setYoutubeDiscovery(null);
        setYoutubePlaylistsLoading(false);
        setYoutubePlaylistError("");
        const allRows: RawCourse[] = [];
        let page = 1;
        let batch: RawCourse[] = [];
        let searchDiscovery: SearchDiscovery | null = null;
        do {
          const params = new URLSearchParams({ page: String(page), limit: '50', sort: catalogSort === "popular" ? "popular" : "recent" });
          if (selectedLevel !== 'all') params.set('level', selectedLevel);
          if (selectedCategory !== 'all') params.set('category', selectedCategory);
          if (catalogQuery.trim()) params.set('q', catalogQuery.trim());
          const response: { courses?: RawCourse[]; items?: RawCourse[]; discovery?: SearchDiscovery; total?: number; pages?: number } = await apiFetch(`/api/courses?${params.toString()}`, {
            showFeatureUpgrade: Boolean(catalogQuery.trim()),
            ...(hasInitialSnapshot.current || navigationType === "POP" ? { cache: "no-store" as const } : {}),
          });
          batch = response.courses || response.items || [];
          if (response.discovery) searchDiscovery = response.discovery;
          allRows.push(...batch);
          page += 1;
        } while (batch.length === 50 && page <= 200);
        setCourses(allRows.map(mapCourse));
        hasInitialSnapshot.current = false;

        if (
          searchDiscovery?.mode === 'youtube_fallback' ||
          searchDiscovery?.mode === 'youtube_supplementary'
        ) {
          const discovery = searchDiscovery;
          setYoutubeDiscovery(discovery);
          setYoutubePlaylistError(String(discovery.youtubeError || ""));

          if (Array.isArray(discovery.curatedResources)) {
            // The curation engine returns one ranked video/playlist/series list.
            // Do not run the legacy playlist fetch and reintroduce duplicate categories.
            setYoutubePlaylistsLoading(false);
          } else {
            setYoutubePlaylistsLoading(true);
            try {
              const playlistData = await apiFetch(
                `/api/discovery/search?q=${encodeURIComponent(discovery.query)}`,
                { showFeatureUpgrade: Boolean(catalogQuery.trim()) }
              );
              setYoutubeDiscovery({
                ...discovery,
                playlists: playlistData.playlists || [],
              });
            } catch (playlistError) {
              setYoutubePlaylistError(
                playlistError instanceof Error
                  ? playlistError.message
                  : "Unable to load YouTube playlists"
              );
            } finally {
              setYoutubePlaylistsLoading(false);
            }
          }
        } else {
          setYoutubeDiscovery(null);
          setYoutubePlaylistsLoading(false);
          setYoutubePlaylistError("");
        }
      } catch (error) {
        // Keep the last rendered catalogue on revalidation failure. A first-load request
        // already starts with an empty array, so there is nothing to clear in that case.
        if (allRows.length > 0) setCourses(allRows.map(mapCourse));
        setCatalogError(error instanceof Error ? error.message : "Unable to search courses");
      } finally {
        hasInitialSnapshot.current = false;
        setLoading(false);
      }
    }

    fetchCourses();
  }, [selectedLevel, selectedCategory, catalogQuery, catalogSort, catalogRetryKey]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setEnrolledCourseIds(new Set());
      setSavedCourseIds(new Set());
      return;
    }

    Promise.all([
      apiFetch('/api/enrollments'),
      apiFetch('/api/saved-courses'),
    ]).then(([enrollmentData, savedData]) => {
      if (!active) return;
      const enrolledIds = (enrollmentData.enrollments || [])
        .filter((item: SearchEnrollmentRow) => ['active', 'completed'].includes(String(item.status || '').toLowerCase()))
        .map((item: SearchEnrollmentRow) => String(typeof item.course === "object" && item.course !== null ? item.course._id ?? item.course.id ?? "" : item.course ?? item.course_id ?? item.courseId ?? ''))
        .filter(Boolean);
      const savedIds = (savedData.savedCourses || [])
        .map((item: SearchEnrollmentRow) => String(typeof item.course === "object" && item.course !== null ? item.course._id ?? item.course.id ?? "" : item.course ?? item.courseId ?? ''))
        .filter(Boolean);
      setEnrolledCourseIds(new Set(enrolledIds));
      setSavedCourseIds(new Set(savedIds));
    }).catch(() => {
      if (!active) return;
      setEnrolledCourseIds(new Set());
      setSavedCourseIds(new Set());
    });

    return () => { active = false; };
  }, [session]);

  const categories = useMemo(() => {
    const cats = new Set(courses.map((c) => c.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [courses]);

  const filteredCourses = useMemo(() => courses, [courses]);
  const sortedCourses = useMemo(() => {
    const rows = [...filteredCourses];
    if (catalogSort === "title") {
      return rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    }
    const timestamp = (value: string | undefined) => {
      const parsed = new Date(value || "").getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    if (catalogSort === "popular") {
      return rows.sort((a, b) =>
        Number(b.enrollment_count || 0) - Number(a.enrollment_count || 0)
        || Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0)
        || timestamp(b.created_at) - timestamp(a.created_at)
      );
    }
    return rows.sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at));
  }, [filteredCourses, catalogSort]);
  const catalogPageCount = Math.max(1, Math.ceil(sortedCourses.length / catalogPageSize));
  const currentCatalogPage = Math.min(catalogPage, catalogPageCount);
  const visibleCourses = sortedCourses.slice(
    (currentCatalogPage - 1) * catalogPageSize,
    currentCatalogPage * catalogPageSize
  );
  const catalogPagination = sortedCourses.length > catalogPageSize ? (
    <nav aria-label="Course pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <p className="text-sm text-slate-500">
        Showing {(currentCatalogPage - 1) * catalogPageSize + 1}–{Math.min(currentCatalogPage * catalogPageSize, sortedCourses.length)} of {sortedCourses.length} courses
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous course page"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => updateCatalogUrl({ page: Math.max(1, currentCatalogPage - 1) })}
          disabled={currentCatalogPage <= 1}
        >Previous</button>
        <span aria-live="polite" className="min-w-24 text-center text-sm font-semibold text-slate-700">Page {currentCatalogPage} of {catalogPageCount}</span>
        <button
          type="button"
          aria-label="Next course page"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => updateCatalogUrl({ page: Math.min(catalogPageCount, currentCatalogPage + 1) })}
          disabled={currentCatalogPage >= catalogPageCount}
        >Next</button>
      </div>
    </nav>
  ) : null;

  const hasFilters = selectedLevel !== 'all' || selectedCategory !== 'all' || catalogQuery.trim().length > 0;

  const clearFilters = () => {
    setAiRoadmap(null);
    setAiError(null);
    updateCatalogUrl({ query: "", level: "all", category: "all", sort: "recent", page: 1 });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("build") !== "1") return;
    const requestedTopic = searchQuery.trim() || catalogQuery.trim();
    setAiTopic(requestedTopic);
    setAiOpen(true);
    setAiError(null);
    setAiRoadmap(null);
    setIntentResult(null);
    setIntentAnswers({});
    setIntentWizardStep(1);
    setAiGoal("Explore a personal interest");
    setAiGoalTouched(false);
    setAiLevel("Beginner");
    setAiLevelTouched(false);
    setAiCourseDepth("complete");
    setAiResourceLanguages(["en", "hi"]);
    setAiStudyTime(60);
    setAiStudyDays("5");
    setAiScope("broad");
    setAiLanguagePref("en");
    setAiLessonStyle("Project-first");
    setAiKnownSkills("");
    params.delete("build");
    const remaining = params.toString();
    navigate({ pathname: location.pathname, search: remaining ? "?" + remaining : "" }, { replace: true });
  }, [location.pathname, location.search, navigate, catalogQuery, searchQuery]);

  useEffect(() => {
    if (!aiOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !aiLoadingRef.current) {
        setAiOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = aiDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [aiOpen]);

  const startIntentFlow = async () => {
    const query = aiTopic.trim();
    if (query.length < 2) {
      setAiError('Add a subject, skill, question, or outcome to build a plan.');
      return;
    }
    if (!session) {
      setAiError('Sign in to generate a personalized AI roadmap.');
      return;
    }
    setIntentLoading(true);
    setAiError(null);
    try {
      const result = await apiFetch('/api/intent/parse', {
        method: 'POST',
        body: JSON.stringify({ query }),
        showFeatureUpgrade: true,
      }) as IntentParse;
      const retired = await apiFetch<{ retiredQuestionIds?: string[] }>('/api/intent/questions/retired').catch(() => ({ retiredQuestionIds: [] }));
      const retiredIds = Array.isArray(retired.retiredQuestionIds) ? retired.retiredQuestionIds : [];
      setRetiredIntentQuestionIds(retiredIds);
      const alreadyAnswered = (questionId: string) => {
        const profile = result.profile || {};
        const preferences = profile.preferences || {};
        if (preferences[questionId] !== undefined && String(preferences[questionId]).trim()) return true;
        if (["role", "targetRole", "aiRole"].includes(questionId) && profile.targetRole) return true;
        if (["company", "targetCompany"].includes(questionId) && profile.targetCompany) return true;
        if (["examType", "targetExamName"].includes(questionId) && profile.examName) return true;
        if (questionId === "examDate" && profile.examDate) return true;
        if (questionId === "syllabus" && profile.syllabusText) return true;
        if (questionId === "projectIdea" && profile.projectIdea) return true;
        if (questionId === "deadline" && profile.deadline) return true;
        return false;
      };
      const niche = getNicheQuestions(query).filter((question) => !retiredIds.includes(question.id) && !alreadyAnswered(question.id));
      const skillOptions = getSkillChecklist(query);
      const enrichedPlan = (result.questionPlan || []).map((question) => {
        if (question.id === "knownSkills" && skillOptions.length) {
          return { ...question, type: "checklist" as const, options: skillOptions, why: "Tick only skills you can already use; those stages will be skipped.", changes: ["starting skills", "roadmap order"] };
        }
        if (question.id === "goal") {
          return { ...question, options: [...(question.options || []), "Freelancing", "Switch careers", "Personal interest"] };
        }
        return question;
      });
      const coreExtras: IntentQuestion[] = [
        { id: "studyDays", type: "single", text: "How many days each week can you study?", options: ["2 days", "3 days", "4 days", "5 days", "6 days", "7 days"], optional: true, why: "This turns your daily time into a realistic weekly study schedule.", changes: ["schedule"] },
        { id: "lessonStyle", type: "single", text: "How do you prefer to learn?", options: ["Short videos and frequent practice", "Long, detailed tutorials", "Project-first", "Theory first, then practice"], optional: true, why: "This changes resource length and the balance between explanation and hands-on work.", changes: ["resources", "projects"] },
        { id: "deadline", type: "text", text: "Do you have a target date to finish this learning path?", optional: true, why: "A target date helps pace the weekly workload without overloading your schedule.", changes: ["schedule"] }
      ];
      const hasAiDomainClarifiers = enrichedPlan.some((question) => question.id.startsWith("domain_"));
      const customDomainFallback: IntentQuestion[] = niche.length || hasAiDomainClarifiers ? [] : [
        { id: "custom_focus", type: "single", text: `Which core sub-area of ${query} do you want to focus on first?`, options: ["Practical fundamentals", "Advanced techniques", "Project-based applications", "Not sure, pick for me"], optional: true, why: "This narrows resource curation and determines the first skills in your roadmap.", changes: ["resource curation", "skills path"] },
        { id: "custom_tool", type: "single", text: `Do you have a specific tool, platform or framework for ${query}?`, options: ["Standard / beginner setup", "Industry-standard tools", "Browser-based tools only", "Not sure, pick for me"], optional: true, why: "This tailors setup guides and tutorials to the tools you can actually access.", changes: ["environment setup", "resources"] }
      ];
      const parsedGoal = String(result.profile?.goal || result.inferredGoal || "learn");
      const purposePackId = String(intentAnswers.goalPurpose || (parsedGoal === "job_ready" ? "career" : parsedGoal === "exam" ? "exam" : parsedGoal === "project" ? "project" : "hobby"));
      const purposePacks = getPurposeQuestions(purposePackId).filter((question) => !retiredIds.includes(question.id) && !alreadyAnswered(question.id));
      const selectedPackQuestionIds = new Set([...purposePacks, ...niche].map((question) => question.id));
      const merged = [
        ...purposePacks,
        ...niche.filter((question) => !purposePacks.some((purposeQuestion) => purposeQuestion.id === question.id)),
        ...customDomainFallback,
        ...enrichedPlan.filter((question) =>
          !selectedPackQuestionIds.has(question.id) &&
          !(question.id === "role" && purposePacks.some((packQuestion) => packQuestion.id === "targetRole")) &&
          !(question.id === "examType" && niche.some((packQuestion) => packQuestion.id === "targetExamName"))
        ),
        ...coreExtras.filter((question) => !selectedPackQuestionIds.has(question.id) && !alreadyAnswered(question.id))
      ];
      setIntentResult({ ...result, questionPlan: merged });
        if (!result.valid) {
        setIntentAnswers({});
        setIntentConfirmedFields([]);
        setAiError('That does not look like a learning topic yet. Try Python, Data Analytics, an exam name, or a project idea.');
        return;
      }
      setIntentConfirmedFields(["topic"]);
      const profile = result.profile || {};
      const timeLabels: Record<number, string> = {
        15: "15 min", 30: "30 min", 60: "1 hour", 90: "1.5 hours", 120: "2 hours",
        180: "3+ hours", 210: "3-4 hours", 300: "5+ hours"
      };
      const goalChoices: Record<string, { goal: string; purpose: string }> = {
        "Career or professional growth": { goal: "job_ready", purpose: "career" },
        "Prepare for an exam or certification": { goal: "exam", purpose: "exam" },
        "Create a project or deliverable": { goal: "project", purpose: "project" },
        "Build practical skills": { goal: "learn", purpose: "hobby" },
        "Master the fundamentals": { goal: "learn", purpose: "hobby" },
        "Explore a personal interest": { goal: "learn", purpose: "hobby" },
        "Freelancing": { goal: "project", purpose: "freelance" },
        "Career switch": { goal: "job_ready", purpose: "career_switch" }
      };
      const selectedGoalChoice = goalChoices[aiGoal] || goalChoices["Build practical skills"];
      const inferredGoal = String(profile.goal || result.inferredGoal || "learn");
      const selectedGoal = aiGoalTouched ? selectedGoalChoice.goal : inferredGoal;
      const selectedPurpose = intentAnswers.goalPurpose || (aiGoalTouched
        ? selectedGoalChoice.purpose
        : inferredGoal === "job_ready" ? "career" : inferredGoal === "exam" ? "exam" : inferredGoal === "project" ? "project" : "hobby");
      const parsedKnownSkills = Array.isArray(profile.knownSkills) ? profile.knownSkills.join(", ") : "";
      const parsedLanguageCode = ["en", "hi", "mr"].includes(String(profile.language || "en"))
        ? String(profile.language || "en")
        : "en";
      const parsedStudyMinutes = Number(profile.minutesPerDay || 60);
      const mergedAnswers: Record<string, string> = {
        role: String(profile.targetRole || ""),
        company: String(profile.targetCompany || ""),
        examType: String(profile.examName || ""),
        examDate: String(profile.examDate || ""),
        syllabus: String(profile.syllabusText || ""),
        projectIdea: String(profile.projectIdea || ""),
        depth: intentAnswers.depth || (Number(result.confidences?.scope ?? 0) >= 0.8 ? String(profile.scope || aiScope) : aiScope),
        level: intentAnswers.level || (Number(result.confidences?.level ?? 0) >= 0.8 ? String(profile.level || aiLevel) : aiLevel),
        time: timeLabels[Number(profile.minutesPerDay || 60)] || "1 hour",
        language: parsedLanguageCode,
        knownSkills: parsedKnownSkills,
        deadline: String(profile.deadline || ""),
        goal: selectedGoal,
        goalPurpose: selectedPurpose,
        studyDays: String(profile.preferences?.studyDays || aiStudyDays),
        lessonStyle: String(profile.preferences?.lessonStyle || aiLessonStyle),
        ...Object.fromEntries(Object.entries(profile.preferences || {}).map(([key, value]) => [key, String(value)])),
        ...intentAnswers
      };
      setIntentAnswers({
        ...mergedAnswers,
        goal: mergedAnswers.goal || selectedGoal,
        goalPurpose: mergedAnswers.goalPurpose || selectedPurpose,
        depth: mergedAnswers.depth || aiScope,
        level: mergedAnswers.level || aiLevel,
        time: mergedAnswers.time || timeLabels[Number(aiStudyTime)] || "1 hour",
        language: mergedAnswers.language || aiLanguagePref,
        knownSkills: mergedAnswers.knownSkills || aiKnownSkills || parsedKnownSkills,
        studyDays: mergedAnswers.studyDays || aiStudyDays,
        lessonStyle: mergedAnswers.lessonStyle || aiLessonStyle
      });
      if (profile.level && !aiLevelTouched) setAiLevel(profile.level as CourseLevel);
      if (!aiKnownSkills && parsedKnownSkills) setAiKnownSkills(parsedKnownSkills);
      if (!intentAnswers.time && Number.isFinite(parsedStudyMinutes)) setAiStudyTime(parsedStudyMinutes);
      if (!intentAnswers.language) setAiLanguagePref(parsedLanguageCode);
      if (profile.preferences?.studyDays && !intentAnswers.studyDays) setAiStudyDays(String(profile.preferences.studyDays));
      if (profile.preferences?.lessonStyle && !intentAnswers.lessonStyle) setAiLessonStyle(String(profile.preferences.lessonStyle));
      const goalValues: Record<string, string> = { job_ready: 'Career or professional growth', exam: 'Prepare for an exam or certification', project: 'Create a project or deliverable', learn: 'Explore a personal interest' };
      if (profile.goal && !aiGoalTouched) setAiGoal(goalValues[profile.goal] || 'Build practical skills');
      setIntentWizardStep(2);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Unable to parse this learning intent.');
    } finally {
      setIntentLoading(false);
    }
  };

  const intentGoal = String(Object.prototype.hasOwnProperty.call(intentAnswers, 'goal') ? intentAnswers.goal : (intentResult?.profile?.goal || intentResult?.inferredGoal || 'learn'));
  const intentPurpose = String(intentAnswers.goalPurpose || (intentGoal === "job_ready" ? "career" : intentGoal === "exam" ? "exam" : intentGoal === "project" ? "project" : "hobby"));
  const coreQuestionIds = new Set(["goal", "depth", "knownSkills", "time", "language", "studyDays", "lessonStyle", "deadline"]);
  const activeIntentQuestions = (intentResult?.questionPlan || []).filter((question) =>
    !retiredIntentQuestionIds.includes(question.id) &&
    !coreQuestionIds.has(question.id) &&
    (!question.when || question.when === 'goal=' + intentGoal || question.when === 'purpose=' + intentPurpose)
  ).slice(0, 4);
  const purposeQuestionIds = new Set([
    "role", "company", "targetRole", "companyType", "jobTimeline", "examType", "examDate", "syllabus", "projectIdea",
    "portfolioStatus", "clientAcquisition", "freelanceClient", "freelancePortfolio", "freelanceService",
    "switchExperience", "switchTarget", "currentBackground", "examPreparationType", "examTimeline",
    "projectAudience", "hobbyFocus", "learningMotivation"
  ]);
  const selectedPurposePackQuestions = getPurposeQuestions(intentPurpose)
    .filter((question) => !retiredIntentQuestionIds.includes(question.id));
  const purposeIntentQuestions = [
    ...selectedPurposePackQuestions,
    ...activeIntentQuestions.filter((question) =>
      purposeQuestionIds.has(question.id) &&
      !selectedPurposePackQuestions.some((packQuestion) => packQuestion.id === question.id)
    )
  ].slice(0, 4);
  const nicheIntentQuestions = activeIntentQuestions.filter((question) => !purposeQuestionIds.has(question.id) && !coreQuestionIds.has(question.id));
  const visibleWizardQuestions = intentWizardStep === 2 ? purposeIntentQuestions : intentWizardStep === 3 ? nicheIntentQuestions : [];
  const visibleWizardQuestionKey = visibleWizardQuestions.map((question) => question.id).join("|");
  const trackIntentQuestionEvent = useCallback((question: IntentQuestion, event: "shown" | "answered" | "skipped" | "abandoned", position = Math.max(0, (intentResult?.questionPlan || []).findIndex((item) => item.id === question.id))) => {
    if (!session || !aiTopic.trim()) return;
    const purposeQuestion = [
      "role", "company", "targetRole", "jobTimeline", "examType", "examDate", "syllabus", "projectIdea",
      "portfolioStatus", "clientAcquisition", "freelanceClient", "freelancePortfolio", "freelanceService",
      "switchExperience", "switchTarget", "currentBackground", "examPreparationType", "examTimeline", "projectAudience",
      "hobbyFocus", "learningMotivation"
    ].includes(question.id);
    void apiFetch('/api/intent/events', {
      method: 'POST',
      body: JSON.stringify({
        questionId: question.id,
        packId: purposeQuestion ? `purpose_${intentPurpose}` : `domain_${intentResult?.domain || "general"}`,
        event,
        position: Math.max(0, Math.min(20, position))
      })
    }).catch(() => {});
  }, [session, aiTopic, intentResult?.questionPlan, intentPurpose, intentResult?.domain]);
  const intentWasOpenRef = useRef(false);
  useEffect(() => {
    if (aiOpen) {
      intentWasOpenRef.current = true;
      return;
    }
    if (intentWasOpenRef.current && intentResult?.valid) {
      visibleWizardQuestions
        .filter((question) => !String(intentAnswers[question.id] || "").trim())
        .forEach((question, index) => trackIntentQuestionEvent(question, "abandoned", index));
    }
    intentWasOpenRef.current = false;
  }, [aiOpen, intentResult?.valid, visibleWizardQuestionKey, trackIntentQuestionEvent, intentAnswers]);
  useEffect(() => {
    if (!aiOpen || !intentResult?.valid) return;
    visibleWizardQuestions.forEach((question, index) => trackIntentQuestionEvent(question, "shown", index));
  }, [aiOpen, intentResult?.valid, intentWizardStep, visibleWizardQuestionKey, trackIntentQuestionEvent]);
  const generateAiRoadmap = async () => {
    // The ref closes the same-render double-click window before React can
    // re-render the disabled Generate button.
    if (aiLoadingRef.current) return;
    const topic = aiTopic.trim();
    if (topic.length < 2) {
      setAiError("Enter a topic with at least 2 characters.");
      return;
    }
    if (!session) {
      setAiError("Sign in to generate a personalized AI roadmap.");
      return;
    }
    const selectedLanguages = [...new Set(aiResourceLanguages.filter((code) =>
      BUILD_WITH_AI_LANGUAGES.some((language) => language.code === code)
    ))].slice(0, 4);
    if (!selectedLanguages.length) {
      setAiError("Select at least one language for learning resources.");
      return;
    }

    const normalizedTopic = topic.toLowerCase();
    const inferredTopicGoal = /\b(exam|certification|certificate|entrance test|competitive exam)\b/.test(normalizedTopic)
      ? "exam"
      : /\b(job|career|interview|placement|developer role)\b/.test(normalizedTopic)
        ? "job_ready"
        : /\b(project|portfolio|build an app|build a website|build a system)\b/.test(normalizedTopic)
          ? "project"
          : "learn";
    const parsedProfile = intentResult?.profile || {};
    const readAnswer = (key: string) => String(intentAnswers[key] || "").trim();
    const goalAliases: Record<string, string> = {
      "career or professional growth": "job_ready",
      "career or work growth": "job_ready",
      "job-ready": "job_ready",
      "exam or certification": "exam",
      "prepare for an exam or certification": "exam",
      "create something": "project",
      "create a project or deliverable": "project",
      "build practical skills": "learn",
      "master the fundamentals": "learn",
      "explore a personal interest": "learn"
    };
    const rawGoal = readAnswer("goal") || String(parsedProfile.goal || intentResult?.inferredGoal || inferredTopicGoal);
    const inferredGoal = ["job_ready", "exam", "project", "learn"].includes(rawGoal)
      ? rawGoal
      : goalAliases[rawGoal.toLowerCase()] || inferredTopicGoal;
    const goalLabels: Record<string, string> = {
      job_ready: "Career or work growth",
      exam: "Exam or certification",
      project: "Create something",
      learn: "Build practical skills"
    };
    const courseDepthLabel = COURSE_DEPTH_OPTIONS.find((option) => option.value === aiCourseDepth)?.label || "Complete course";
    const studyMinutes = parseStudyMinutes(readAnswer("time") || parsedProfile.minutesPerDay, aiStudyTime);
    const studyDaysValue = readAnswer("studyDays") || String(parsedProfile.preferences?.studyDays || aiStudyDays);
    const studyDaysPerWeek = Math.max(2, Math.min(7, Number(studyDaysValue.match(/\d+/)?.[0]) || 5));
    const knownSkills = parseAnswerList(readAnswer("knownSkills") || parsedProfile.knownSkills);
    const selectedLevel = (readAnswer("level") || aiLevel || parsedProfile.level || "Beginner") as CourseLevel;
    const depthAnswer = readAnswer("depth").toLowerCase();
    const learningScope = /quick|short|narrow|overview/.test(depthAnswer)
      ? "narrow"
      : /complete|broad|full/.test(depthAnswer)
        ? "broad"
        : aiCourseDepth === "short"
          ? "narrow"
          : aiCourseDepth === "complete"
            ? "broad"
            : parsedProfile.scope || "narrow";
    // The order selected in the review UI is authoritative; parser defaults must not silently
    // re-introduce a language that the learner removed from their selected language list.
    const effectiveLanguages = selectedLanguages;
    const preferredLanguage = effectiveLanguages[0] || "en";
    const selectedRole = readAnswer("role") || readAnswer("targetRole") || parsedProfile.targetRole || null;
    const selectedCompany = readAnswer("company") || readAnswer("targetCompany") || parsedProfile.targetCompany || null;
    const selectedExam = readAnswer("examType") || parsedProfile.examName || null;
    const selectedExamDate = readAnswer("examDate") || parsedProfile.examDate || null;
    const selectedSyllabus = readAnswer("syllabus") || parsedProfile.syllabusText || null;
    const selectedProject = readAnswer("projectIdea") || parsedProfile.projectIdea || null;
    const selectedDeadline = readAnswer("deadline") || parsedProfile.deadline || null;
    const selectedLessonStyle = readAnswer("lessonStyle") || aiLessonStyle;
    const profile = {
      topic,
      level: selectedLevel,
      goals: [goalLabels[inferredGoal]],
      studyTimeMinutesPerDay: studyMinutes,
      language: preferredLanguage,
      knownSkills,
      intentProfile: {
        ...parsedProfile,
        topic,
        domain: intentResult?.domain || parsedProfile.domain || "general",
        scope: learningScope,
        goal: inferredGoal,
        level: selectedLevel,
        knownSkills,
        minutesPerDay: studyMinutes,
        deadline: selectedDeadline,
        language: preferredLanguage,
        targetRole: selectedRole,
        targetCompany: selectedCompany,
        examName: selectedExam,
        examDate: selectedExamDate,
        syllabusText: selectedSyllabus,
        projectIdea: selectedProject,
        outcome: readAnswer("outcome") || parsedProfile.outcome || "",
        preferences: {
          ...(parsedProfile.preferences || {}),
          courseDepth: aiCourseDepth,
          courseDepthLabel,
          studyDays: String(studyDaysPerWeek),
          lessonStyle: selectedLessonStyle,
          resourceLanguages: effectiveLanguages.join(","),
          selfPaced: selectedDeadline ? "false" : "true"
        }
      }
    };

    setAiLoading(true);
    aiLoadingRef.current = true;
    setAiError(null);
    try {
      let data: AiRoadmap | undefined;
      if (ASYNC_ROADMAP) {
        const draft = await apiFetch<{ draftId: string }>("/api/ai/roadmap/draft", {
          method: "POST", body: JSON.stringify({ profile }), showFeatureUpgrade: true
        });
        window.localStorage.setItem("bfs_async_roadmap_draft", draft.draftId);
        const started = await apiFetch<{ draftId: string; status: string; errorMessage?: string; roadmapId?: string | null; modules?: AiModule[]; course?: unknown }>("/api/ai/roadmap", {
          method: "POST", body: JSON.stringify({ draftId: draft.draftId, profile }), showFeatureUpgrade: true
        });
        setAiRoadmap({
          status: started.status || "building",
          query: topic,
          course: { title: topic + " learning roadmap", modules: started.modules || [] },
          draftId: draft.draftId
        });
        let current = started;
        while (current.status !== "ready") {
          if (current.status === "failed") throw new Error(current.errorMessage || "Roadmap build failed. Please retry.");
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          const polled = await apiFetch<{ draftId: string; status: string; errorMessage?: string; result?: AiRoadmap }>(`/api/ai/roadmap/${encodeURIComponent(draft.draftId)}?_${Date.now()}`);
          current = polled;
          if (polled.status === "failed") throw new Error(polled.errorMessage || "Roadmap build failed. Please retry.");
          if (polled.result) setAiRoadmap(polled.result);
          if (polled.status === "ready" && polled.result) data = polled.result;
        }
        if (!data) throw new Error("Roadmap build ended without a result. Please retry.");
        window.localStorage.removeItem("bfs_async_roadmap_draft");
      } else {
        data = await apiFetch<AiRoadmap>("/api/ai/roadmap", {
          method: "POST", body: JSON.stringify(profile), showFeatureUpgrade: true
        });
      }
      setAiRoadmap(data);
      setExpandedAiModules(new Set([0]));
      setAiEnrollError(null);
      setAiOpen(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI roadmap generation failed");
    } finally {
      aiLoadingRef.current = false;
      setAiLoading(false);
    }
  };

  const checkGeneratedCourseStatus = async () => {
    const courseId = String(aiRoadmap?.course?._id ?? aiRoadmap?.course?.id ?? "");
    if (!courseId || courseId === "undefined" || courseId === "null") return;
    setAiEnrolling(true);
    setAiEnrollError(null);
    try {
      const data = await apiFetch("/api/courses/" + encodeURIComponent(courseId));
      setAiRoadmap((current) => current ? {
        ...current,
        course: {
          ...current.course,
          ...data.course,
          isPublished: Boolean(data.course?.isPublished),
          ...(data.course?.isPublished ? { aiReviewStatus: "approved" } : {})
        }
      } : current);
      setAiEnrollError(null);
    } catch {
      setAiEnrollError("This course is not available yet. Content approval and the required readiness/publication checks must pass before enrollment.");
    } finally {
      setAiEnrolling(false);
    }
  };

  const enrollGeneratedCourse = async () => {
    const courseId = String(aiRoadmap?.course?._id ?? aiRoadmap?.course?.id ?? '');
    if (!courseId || courseId === 'undefined' || courseId === 'null') {
      setAiEnrollError('This generated course has no saved course ID. Build it again and retry.');
      return;
    }
    setAiEnrolling(true);
    setAiEnrollError(null);
    try {
      await apiFetch(`/api/enrollments/${courseId}`, { method: 'POST' });
      navigate(routes.learn(courseId));
    } catch (err) {
      try {
        const existing = await apiFetch(`/api/enrollments/course/${courseId}`);
        if (existing?.enrollment?.status === 'active' || existing?.enrollment?.status === 'completed') {
          navigate(routes.learn(courseId));
          return;
        }
      } catch {
        // Keep the original enrollment error for display.
      }
      setAiEnrollError(err instanceof Error ? err.message : 'Unable to enroll in this course.');
    } finally {
      setAiEnrolling(false);
    }
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    setAiRoadmap(null);
    setAiError(null);
    updateCatalogUrl({ query, page: 1 });
  };

  const roadmapDuration = aiRoadmap ? getRoadmapDurationSummary({
    estimatedStudyMinutes: Number(aiRoadmap.schedule?.estimatedMinutes ?? aiRoadmap.personalization?.estimatedStudyMinutes ?? 0),
    minutesPerDay: Number(aiRoadmap.schedule?.minutesPerDay ?? aiRoadmap.personalization?.studyTimeMinutesPerDay ?? 0),
    studyDaysPerWeek: Number(aiRoadmap.schedule?.studyDaysPerWeek ?? 0),
    videoRuntimeMinutes: Number(aiRoadmap.personalization?.resourceVideoMinutes ?? 0)
  }) : null;

  return (
    <div className="bfs-shell bfs-catalog-shell py-6 sm:py-8">
      <section aria-labelledby="course-search-heading" className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
          <div className="shrink-0 sm:w-44">
            <h1 id="course-search-heading" className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
              Find a course
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">Search topics or build with AI</p>
          </div>
          <form onSubmit={handleSearch} className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-300 focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/15"
                  placeholder="Search courses, skills, or topics"
                  aria-label="Search courses"
                />
              </div>
              <button type="submit" className="btn-primary h-11 justify-center rounded-xl px-5 sm:min-w-24">
                <Search className="h-4 w-4" />
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  const requestedTopic = searchQuery.trim() || catalogQuery.trim();
                  setAiTopic(requestedTopic);
                  setAiOpen(true);
                  setAiError(null);
                  setAiRoadmap(null);
                  setIntentResult(null);
                  setIntentAnswers({});
                  setIntentConfirmedFields(requestedTopic.trim().length >= 2 ? ["topic"] : []);
                  setIntentWizardStep(1);
                  setAiGoal("Explore a personal interest");
                  setAiGoalTouched(false);
                  setAiLevel("Beginner");
                  setAiLevelTouched(false);
                  setAiCourseDepth("complete");
                  setAiResourceLanguages(["en", "hi"]);
                  setAiStudyTime(60);
                  setAiStudyDays("5");
                  setAiScope("broad");
                  setAiLanguagePref("en");
                  setAiLessonStyle("Project-first");
                  setAiKnownSkills("");
                }}
                disabled={aiLoading}
                className="btn-secondary h-11 justify-center rounded-xl px-4 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    Build with AI
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section aria-label="Course filters" className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Filter className="h-4 w-4 text-slate-400" />
            Refine your results
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedLevel}
              onChange={(e) => updateCatalogUrl({ level: e.target.value as CourseLevel | 'all', page: 1 })}
              className="input-field h-10 w-full py-1 text-sm sm:w-auto"
              aria-label="Filter by level"
            >
              <option value="all">All Levels</option>
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => updateCatalogUrl({ category: e.target.value, page: 1 })}
              className="input-field h-10 w-full py-1 text-sm sm:w-auto"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              aria-label="Sort courses"
              value={catalogSort}
              onChange={(e) => updateCatalogUrl({ sort: e.target.value as "recent" | "popular" | "title", page: 1 })}
              className="input-field h-10 w-full py-1 text-sm sm:w-auto"
            >
              <option value="recent">Recently added</option>
              <option value="popular">Most popular</option>
              <option value="title">Title A–Z</option>
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {catalogError && (
        <div role="alert" aria-live="assertive" className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>Course catalogue unavailable: {catalogError}</p>
          <button
            type="button"
            className="inline-flex w-fit items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-50"
            onClick={() => { setCatalogRetryKey((key) => key + 1); setCatalogError(""); }}
            disabled={loading}
          >Retry loading courses</button>
        </div>
      )}

      {aiOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-2 backdrop-blur-[2px] sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !aiLoading) setAiOpen(false);
          }}
        >
          <section
            ref={aiDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-builder-title"
            aria-describedby="ai-builder-description"
            className="flex max-h-[min(84dvh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                    Roadmap Studio
                    
                  </p>
                  <h2 id="ai-builder-title" className="mt-0.5 text-base font-semibold text-slate-900 sm:text-lg">Create your learning course</h2>
                  <p id="ai-builder-description" className="mt-0.5 text-[11px] text-slate-600">{INTENT_V2 ? "Start with a topic. AI will ask only what it needs to personalize your roadmap." : "Choose a course depth, experience level and resource languages"}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="hidden text-right text-[10px] text-slate-600 sm:block">
                  <span>Quick setup</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiOpen(false)}
                  disabled={aiLoading}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                  aria-label="Close AI learning planner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="h-1 w-full bg-white">
              <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-4 py-3 sm:px-5">
              <div className="mx-auto w-full max-w-2xl space-y-5">
  <div>
    <label htmlFor="ai-topic" className="mb-2 block text-sm font-semibold text-slate-900">What do you want to learn?</label>
    <input
      id="ai-topic"
      autoFocus
      maxLength={200}
      value={aiTopic}
      onChange={(event) => setAiTopic(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && aiTopic.trim().length >= 2) {
          event.preventDefault();
          if (INTENT_V2) void startIntentFlow();
          else void generateAiRoadmap();
        }
      }}
      placeholder="e.g. Data Science, MERN Stack, Java Full Stack, Python…"
      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
    />
    <p className="mt-1.5 text-xs text-slate-500">Enter a subject, skill, technology stack or exam. We’ll handle the course structure.</p>
  </div>

  {(!INTENT_V2 || !intentResult?.valid) && (
  <>
  <fieldset className="space-y-2.5">
    <legend className="text-sm font-semibold text-slate-900">How much of the subject should the course cover?</legend>
    <div className="grid gap-2">
      {COURSE_DEPTH_OPTIONS.map((option) => {
        const selected = aiCourseDepth === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setAiCourseDepth(option.value)}
            className={`rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
              selected ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/20" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{option.label}</span>
              {option.value === "complete" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Recommended · Default</span>}
              <span className="ml-auto text-xs font-medium text-slate-500">{option.duration}</span>
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">{option.description}</span>
          </button>
        );
      })}
    </div>
    <p className="text-xs text-slate-500">Time is an estimate, not a deadline. A complete Data Science path targets 70–100 hours.</p>
  </fieldset>

  <fieldset className="space-y-2">
    <legend className="text-sm font-semibold text-slate-900">Your current experience</legend>
    <div className="grid grid-cols-3 gap-2">
      {([
        { value: "Beginner", label: "New to this" },
        { value: "Intermediate", label: "Know the basics" },
        { value: "Advanced", label: "Experienced" }
      ] as const).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={aiLevel === option.value}
          onClick={() => setAiLevel(option.value)}
          className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
            aiLevel === option.value ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
        >{option.label}</button>
      ))}
    </div>
    <p className="text-xs text-slate-500">Complete courses still include prerequisites. Your experience adjusts the starting pace.</p>
  </fieldset>

  <fieldset className="space-y-2.5">
    <legend className="text-sm font-semibold text-slate-900">Languages for learning resources</legend>
    <p className="text-xs text-slate-500">Select up to four. English and Hindi are selected by default; we prioritise the languages in the order selected.</p>
    <div className="flex flex-wrap gap-2">
      {BUILD_WITH_AI_LANGUAGES.map((language) => {
        const selected = aiResourceLanguages.includes(language.code);
        return (
          <button
            key={language.code}
            type="button"
            aria-pressed={selected}
            onClick={() => setAiResourceLanguages((current) =>
              selected ? current.filter((code) => code !== language.code) : [...current, language.code].slice(0, 4)
            )}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
              selected ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >{selected ? "✓ " : ""}{language.label}</button>
        );
      })}
    </div>
    <p className="text-xs text-slate-500">{aiResourceLanguages.length} of 4 languages selected.</p>
  </fieldset>
  </>
  )}

  {INTENT_V2 && intentResult?.valid && (intentWizardStep === 2 || intentWizardStep === 3) && (
    <section aria-label="Adaptive learning questions" className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">{intentWizardStep === 2 ? "Step 1 · Learning goal" : "Step 2 · Personalization"}</p>
        <h3 className="mt-1 text-base font-bold text-slate-900">{intentWizardStep === 2 ? "A few questions to tailor your path" : "Refine your learning experience"}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Skip optional questions when you are unsure. Your answers can be reviewed before the roadmap is generated.</p>
      </div>
      {visibleWizardQuestions.length === 0 ? (
        <p className="rounded-xl bg-white p-3 text-sm text-slate-700">No additional questions are needed for this step. Continue to the next step.</p>
      ) : visibleWizardQuestions.map((question) => {
        const currentAnswer = String(intentAnswers[question.id] || "");
        const selectedValues = parseAnswerList(currentAnswer);
        const isMulti = question.type === "multi" || question.type === "checklist";
        const hasOptions = Array.isArray(question.options) && question.options.length > 0;
        return (
          <fieldset key={question.id} className="space-y-2 rounded-xl border border-white bg-white p-3">
            <legend className="px-1 text-sm font-semibold text-slate-900">
              {question.text}
              {question.optional && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">Optional</span>}
            </legend>
            {question.why && <p className="text-xs leading-5 text-slate-500">{question.why}</p>}
            {hasOptions && isMulti && (
              <div className="flex flex-wrap gap-2">
                {question.options!.map((option) => {
                  const selected = selectedValues.includes(option);
                  return (
                    <button key={option} type="button" aria-pressed={selected}
                      onClick={() => {
                        const current = parseAnswerList(intentAnswers[question.id]);
                        const next = current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
                        markIntentAnswer(question.id, next.join(", "));
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                      {selected ? "✓ " : ""}{option}
                    </button>
                  );
                })}
              </div>
            )}
            {hasOptions && !isMulti && (
              <div className="flex flex-wrap gap-2">
                {question.options!.map((option) => {
                  const selected = currentAnswer === option;
                  return (
                    <button key={option} type="button" aria-pressed={selected}
                      onClick={() => markIntentAnswer(question.id, option)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                      {selected ? "✓ " : ""}{option}
                    </button>
                  );
                })}
              </div>
            )}
            {(!hasOptions || question.type === "text" || question.type === "paste") && (
              question.type === "paste" ? (
                <textarea rows={4} value={currentAnswer}
                  onChange={(event) => markIntentAnswer(question.id, event.target.value)}
                  placeholder="Add details here (optional)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"/>
              ) : (
                <input type="text" value={currentAnswer}
                  onChange={(event) => markIntentAnswer(question.id, event.target.value)}
                  placeholder="Type your answer (optional)"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"/>
              )
            )}
          </fieldset>
        );
      })}
    </section>
  )}

  {INTENT_V2 && intentResult?.valid && intentWizardStep === 4 && (
    <section aria-label="Review your learning profile" className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Final step · Review</p>
        <h3 className="mt-1 text-base font-bold text-slate-900">Review your learning profile</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">AI-inferred values are provisional. Correct anything that does not describe you before generating the roadmap.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-white p-3">
          <p className="text-xs font-bold text-emerald-800">Confirmed by you</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {["topic", ...intentConfirmedFields.filter((field) => field !== "topic")].map((field) => {
              const labels: Record<string, string> = { topic: "Learning topic", goal: "Learning goal", level: "Experience level", depth: "Course depth", knownSkills: "Existing skills", time: "Daily study time", studyDays: "Study days", language: "Resource languages", role: "Target role", company: "Target company", examType: "Exam", examDate: "Exam date", syllabus: "Syllabus", projectIdea: "Project idea", deadline: "Target date", lessonStyle: "Learning style" };
              const value = field === "topic" ? aiTopic
                : field === "level" ? aiLevel
                : field === "depth" ? aiCourseDepth
                : field === "language" ? aiResourceLanguages.map((code) => BUILD_WITH_AI_LANGUAGES.find((item) => item.code === code)?.label || code).join(", ")
                : intentAnswers[field] || "Confirmed";
              return <li key={field}><span className="font-semibold">{labels[field] || field}:</span> {value}</li>;
            })}
          </ul>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-900">AI-inferred assumptions</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {(intentResult.assumptions || []).map((assumption) => (
              <li key={assumption.field}><span className="font-semibold">{assumption.field.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}:</span> {Array.isArray(assumption.value) ? assumption.value.join(", ") : String(assumption.value ?? "Not specified")}</li>
            ))}
            {!intentResult.assumptions?.length && !intentConfirmedFields.includes("goal") && (
              <li>Learning goal: {String(intentResult.inferredGoal || "General learning")} (provisional until you confirm it below)</li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-700">Not provided yet</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {[
              { label: "Learning goal", value: intentResult.profile?.goal || intentResult.inferredGoal },
              { label: "Known skills", value: (intentResult.profile?.knownSkills || []).join(", ") || intentAnswers.knownSkills },
              { label: "Target role", value: intentResult.profile?.targetRole || intentAnswers.role },
              { label: "Target company", value: intentResult.profile?.targetCompany || intentAnswers.company },
              { label: "Exam or certification", value: intentResult.profile?.examName || intentAnswers.examType },
              { label: "Project idea", value: intentResult.profile?.projectIdea || intentAnswers.projectIdea },
              { label: "Target date", value: intentResult.profile?.deadline || intentAnswers.deadline }
            ].filter((item) => !String(item.value || "").trim()).map((item) => <li key={item.label}>{item.label}</li>)}
          </ul>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-slate-700">
          Learning goal
          <select value={String(intentAnswers.goal || intentResult.profile?.goal || intentResult.inferredGoal || "learn")}
            onChange={(event) => markIntentAnswer("goal", event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="learn">Learn a skill</option><option value="job_ready">Become job-ready</option><option value="exam">Prepare for an exam</option><option value="project">Build a project</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700">
          Current experience
          <select value={String(intentAnswers.level || aiLevel)}
            onChange={(event) => { setAiLevel(event.target.value as CourseLevel); setAiLevelTouched(true); markIntentAnswer("level", event.target.value); }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700">
          Course depth
          <select value={aiCourseDepth} onChange={(event) => { const value = event.target.value as "short" | "medium" | "complete"; setAiCourseDepth(value); markIntentAnswer("depth", value === "short" ? "Quick overview" : value === "complete" ? "Complete learning path" : "Medium course"); }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="short">Short</option><option value="medium">Medium</option><option value="complete">Complete</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700">
          Study minutes per day
          <select value={String(aiStudyTime)}
            onChange={(event) => { const value = Number(event.target.value); setAiStudyTime(value); markIntentAnswer("time", value >= 180 ? "3+ hours" : value >= 120 ? "2 hours" : value >= 90 ? "1.5 hours" : value >= 60 ? "1 hour" : value >= 30 ? "30 min" : "15 min"); }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700">
          Study days per week
          <select value={String(Number(String(intentAnswers.studyDays || aiStudyDays).match(/\d+/)?.[0]) || 5)}
            onChange={(event) => { setAiStudyDays(event.target.value); markIntentAnswer("studyDays", event.target.value + " days"); }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900">
            <option value="2">2 days</option><option value="3">3 days</option><option value="4">4 days</option><option value="5">5 days</option><option value="6">6 days</option><option value="7">7 days</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">
          Skills you already know
          <input value={String(intentAnswers.knownSkills || (Array.isArray(intentResult.profile?.knownSkills) ? intentResult.profile.knownSkills.join(", ") : ""))}
            onChange={(event) => markIntentAnswer("knownSkills", event.target.value)}
            placeholder="e.g. HTML, CSS, JavaScript"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900"/>
        </label>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-700">Resource languages (selected alternatives are explicit learner choices)</p>
        <div className="flex flex-wrap gap-2">
          {BUILD_WITH_AI_LANGUAGES.map((language) => {
            const selected = aiResourceLanguages.includes(language.code);
            return <button key={language.code} type="button" aria-pressed={selected}
              onClick={() => { setAiResourceLanguages((current) => selected ? current.filter((code) => code !== language.code) : [...current, language.code].slice(0, 4)); setIntentConfirmedFields((fields) => fields.includes("language") ? fields : [...fields, "language"]); }}
              className={`rounded-full border px-3 py-2 text-xs font-semibold ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700"}`}>
              {selected ? "✓ " : ""}{language.label}
            </button>;
          })}
        </div>
      </div>
    </section>
  )}

  {aiError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">{aiError}</div>}
</div>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <button
                type="button"
                onClick={() => {
                  if (INTENT_V2 && intentResult?.valid && intentWizardStep > 2) {
                    setIntentWizardStep((step) => Math.max(2, step - 1));
                    return;
                  }
                  if (INTENT_V2 && intentResult?.valid && intentWizardStep === 2) {
                    setIntentResult(null);
                    setIntentAnswers({});
                    setIntentConfirmedFields(["topic"]);
                    setIntentWizardStep(1);
                    return;
                  }
                  setAiOpen(false);
                }}
                disabled={aiLoading}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50"
              >
                {INTENT_V2 && intentResult?.valid && intentWizardStep > 2 ? "Back" : INTENT_V2 && intentResult?.valid && intentWizardStep === 2 ? "Edit topic" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!INTENT_V2) {
                    void generateAiRoadmap();
                    return;
                  }
                  if (!intentResult?.valid) {
                    if (aiTopic.trim().length < 2) { setAiError("Enter a topic with at least 2 characters."); return; }
                    void startIntentFlow();
                    return;
                  }
                  if (intentWizardStep < 4) {
                    if (intentWizardStep === 2 || intentWizardStep === 3) {
                      visibleWizardQuestions
                        .filter((question) => !String(intentAnswers[question.id] || "").trim())
                        .forEach((question, index) => trackIntentQuestionEvent(question, "skipped", index));
                    }
                    setIntentWizardStep((step) => Math.min(4, step + 1));
                    return;
                  }
                  void generateAiRoadmap();
                }}
                disabled={aiLoading || intentLoading || !aiTopic.trim()}
                className="btn-primary h-11 justify-center rounded-lg px-5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoading || intentLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {intentLoading ? "Analyzing your learning goal…" : "Building your course…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {!INTENT_V2 ? "Generate course" : !intentResult?.valid ? "Analyze topic" : intentWizardStep === 4 ? "Generate course" : intentWizardStep === 3 ? "Review profile" : "Continue"}
                  </>
                )}
              </button>
            </footer>
          </section>
        </div>
      )}

      {aiError && !aiOpen && (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {aiError}
        </div>
      )}

      {catalogError && (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Course search failed: {catalogError}
        </div>
      )}

      {aiRoadmap?.course && (
        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-950 px-5 py-6 text-white sm:px-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-300">AI-generated complete course</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight">{aiRoadmap.course.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{aiRoadmap.course.description}</p>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="text-slate-300">Estimated learning effort</p>
                    <p className="mt-1 text-sm font-bold text-white">{roadmapDuration?.studyHoursLabel || "Not estimated"}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="text-slate-300">Estimated completion timeline</p>
                    <p className="mt-1 text-sm font-bold text-white">{roadmapDuration?.weeksLabel || "Study schedule needed"}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="text-slate-300">Study schedule</p>
                    <p className="mt-1 text-sm font-bold text-white">{roadmapDuration?.scheduleLabel || "Not specified"}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="text-slate-300">Selected video runtime</p>
                    <p className="mt-1 text-sm font-bold text-white">{roadmapDuration?.videoRuntimeLabel || "Not available"}</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-300">Based on returned resource metadata; not a verification of video content.</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {aiRoadmap.course.isPublished ? (
                  <button type="button" onClick={() => navigate(routes.course(String(aiRoadmap.course._id ?? aiRoadmap.course.id)))} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-100 transition hover:bg-white/10">
                    <ExternalLink className="h-4 w-4" /> Course details
                  </button>
                ) : (
                  <span className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300">Details unlock after approval</span>
                )}
                <button onClick={() => { setAiRoadmap(null); setAiEnrollError(null); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white">Close</button>
              </div>
            </div>
          </div>

          {!aiRoadmap.course.isPublished && (
            <div role="status" className="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:mx-7">
              <p className="font-bold text-slate-900">Course access is not enabled yet</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                This generated roadmap is a preview only. Enrollment and course-player access unlock when the required approval and publication checks are complete. Public courses must pass readiness checks; approval by itself does not bypass them.
              </p>
              <button type="button" className="btn-secondary mt-3" onClick={() => void checkGeneratedCourseStatus()} disabled={aiEnrolling}>
                {aiEnrolling ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking status…</> : "Check access status"}
              </button>
            </div>
          )}

          {aiRoadmap.schedule?.scheduleWarning && (
            <div role="alert" className="mx-5 mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:mx-7">
              <p className="font-bold text-amber-950">Your target schedule may be unrealistic</p>
              <p className="mt-1 text-sm leading-6 text-amber-900">{aiRoadmap.schedule.scheduleWarning}</p>
              {Number(aiRoadmap.schedule.requiredDailyMinutes) > 0 && (
                <p className="mt-2 text-sm font-semibold text-amber-950">
                  Estimated time required: {Math.ceil(Number(aiRoadmap.schedule.requiredDailyMinutes))} minutes per study day.
                </p>
              )}
              <p className="mt-1 text-xs leading-5 text-amber-800">You can adjust your daily study time or target date and regenerate a more achievable plan.</p>
            </div>
          )}

          {aiRoadmap.personalization && (
            <div className="m-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:m-7">
              <p className="text-sm font-extrabold text-slate-900">Why this course was generated</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">{aiRoadmap.personalization.courseDepthLabel || "Self-paced course"}</span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Self-paced · no completion deadline</span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Goal: {aiRoadmap.personalization.goals?.[0] || 'Balanced learning'}</span>
                {Number.isFinite(Number(aiRoadmap.personalization.estimatedStudyMinutes)) && Number(aiRoadmap.personalization.estimatedStudyMinutes) > 0 && (
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Planned learning: {Math.round(Number(aiRoadmap.personalization.estimatedStudyMinutes ?? 0) / 60 * 10) / 10} hours</span>
                )}
                {Number.isFinite(Number(aiRoadmap.personalization.resourceVideoMinutes)) && (
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Selected video runtime (metadata): {Math.round(Number(aiRoadmap.personalization.resourceVideoMinutes ?? 0) / 60 * 10) / 10} hours</span>
                )}
                {(aiRoadmap.personalization.skippedSkills || []).map((skill: string) => <span key={skill} className="rounded-full bg-green-50 px-3 py-1.5 font-bold text-green-700">Skipped: {skill}</span>)}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {aiRoadmap.personalization.estimatedStudyMinutes
                  ? "Estimated study time includes learning activities, quizzes and hands-on practice; video watch time is measured separately. "
                  : ""}
                {aiRoadmap.personalization.resourceCoverage
                  ? `${aiRoadmap.personalization.resourceCoverage.lessonsWithResources || 0}/${aiRoadmap.personalization.resourceCoverage.tutorialLessonCount || 0} tutorial lessons have resources · ${aiRoadmap.personalization.resourceCoverage.uniqueVideoCount || 0} distinct videos.`
                  : ""}
                {aiRoadmap.personalization.resourceLanguages?.length
                  ? ` Preferred resource languages: ${aiRoadmap.personalization.resourceLanguages.map((code) => BUILD_WITH_AI_LANGUAGES.find((language) => language.code === code)?.label || code).join(", ")}.`
                  : ` Preferred resource language: ${aiRoadmap.personalization.resourceLanguage || "requested"}.`}
                {" "}{aiRoadmap.personalization.rationale?.join(' ')}
              </p>
            </div>
          )}

          <div className="px-5 pb-7 sm:px-7">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Learning path</p>
                <h3 className="mt-1 text-xl font-extrabold text-slate-900">Course modules and lessons</h3>
                <p className="mt-1 text-sm text-slate-500">Expand a module to see tutorials, MCQ quizzes, projects, and assessments.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">MCQ questions are generated when you open each quiz in the course player.</span>
            </div>

            <div className="space-y-3">
              {(() => {
                const skillGraphById = new Map((aiRoadmap.skillGraph || []).map((skill) => [skill.id, skill] as const));
                return (aiRoadmap.course.modules || []).map((module, moduleIndex: number) => {
                const expanded = expandedAiModules.has(moduleIndex);
                const prerequisiteIds = module.title === "Final Capstone Projects"
                  ? []
                  : Array.from(new Set((module.skillIds || []).flatMap((skillId) => skillGraphById.get(skillId)?.prerequisites || [])));
                const prerequisiteNames = prerequisiteIds.map((skillId) =>
                  skillGraphById.get(skillId)?.name || skillId.replace(/[-_]+/g, " ")
                );
                const lessons = module.lessons || [];
                const tutorialCount = lessons.filter((lesson) => lesson.type === 'tutorial').length;
                const quizCount = lessons.filter((lesson) => lesson.type === 'quiz').length;
                const projectCount = lessons.filter((lesson) => lesson.type === 'project').length;
                return (
                  <div key={module._id || module.id || module.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <button type="button" onClick={() => setExpandedAiModules((previous) => {
                      const next = new Set(previous);
                      if (next.has(moduleIndex)) next.delete(moduleIndex);
                      else next.add(moduleIndex);
                      return next;
                    })} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50" aria-expanded={expanded}>
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-extrabold text-blue-700">{module.order || moduleIndex + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-900">{module.title}</span>
                        <span className="mt-1 block text-xs text-slate-500">{lessons.length} activities · {tutorialCount} tutorials · {quizCount} quizzes · {projectCount} projects</span>
                        {module.description && <span className="mt-1 block text-xs leading-5 text-slate-500">{module.description}</span>}
                        {prerequisiteNames.length > 0 && <span className="mt-1 block text-xs font-semibold text-indigo-700">Prerequisites: {prerequisiteNames.join(", ")}</span>}
                      </span>
                      {expanded ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />}
                    </button>
                    {expanded && (
                      <div className="border-t border-slate-100">
                        {lessons.map((lesson, lessonIndex: number) => {
                          const isTutorial = lesson.type === 'tutorial';
                          const isQuiz = lesson.type === 'quiz';
                          const videos = lesson.tutorial?.videos || [];
                          const questionCount = lesson.quiz?.questionCount || (lesson.quiz?.scope === 'module' ? 8 : 5);
                          const Icon = isTutorial ? Play : isQuiz ? CircleHelp : FolderKanban;
                          return (
                            <div key={lesson._id || lesson.id || `${moduleIndex}-${lessonIndex}`} className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                              <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${isTutorial ? 'bg-blue-50 text-blue-600' : isQuiz ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'}`}><Icon className="h-4 w-4" /></span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-800">{lessonIndex + 1}. {lesson.title}</p>
                                {lesson.description && <p className="mt-1 text-xs leading-5 text-slate-500">{lesson.description}</p>}
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{isTutorial ? 'Tutorial' : isQuiz ? 'MCQ quiz' : 'Practical project'}</span>
                                  {isQuiz && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{questionCount} questions · pass {lesson.quiz?.passingScore || 70}%</span>}
                                  {isTutorial && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{videos.length ? `${videos.length} video resources attached` : 'Video resources load when available'}</span>}
                                  {lesson.type === 'project' && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Hands-on practice</span>}
                                </div>
                                {isTutorial && videos.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {videos.slice(0, 3).map((video) => (
                                      <div key={video.videoId || video.url || video.title} className="rounded-xl bg-slate-50 p-2.5">
                                        <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-medium text-blue-700 hover:underline"><Play className="h-3 w-3 flex-shrink-0" /><span className="line-clamp-2">{video.title || 'Open tutorial video'}</span></a>
                                        {video.defaultAudioLanguage && <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">YouTube audio metadata: {BUILD_WITH_AI_LANGUAGES.find((language) => language.code === String(video.defaultAudioLanguage).split("-")[0].toLowerCase())?.label || video.defaultAudioLanguage}</span>}
                                        {video.videoId && <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                          {(["helpful", "outdated", "wrong_level"] as const).map((event) => (
                                            <button key={event} type="button" disabled={Boolean(curationFeedbackSent[video.videoId!])} onClick={() => void sendCurationFeedback(event, module, video)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60">
                                              {curationFeedbackSent[video.videoId!] ? (curationFeedbackSent[video.videoId!] === event ? "Thanks for feedback" : "Feedback saved") : event === "wrong_level" ? "Wrong level" : event === "outdated" ? "Outdated" : "Helpful"}
                                            </button>
                                          ))}
                                        </div>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
                });
              })()}
            </div>

            {aiEnrollError && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{aiEnrollError}</div>}
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold text-slate-900">{aiRoadmap.course.isPublished ? "Ready to start learning?" : "Learning access is locked"}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {aiRoadmap.course.isPublished
                    ? "Enroll to track progress, take generated MCQ quizzes, and continue learning from My Learning."
                    : "The generated outline is a preview only. Enrollment is enabled after the content approval and publication workflow is complete."}
                </p>
              </div>
              {aiRoadmap.course.isPublished ? (
                <button type="button" onClick={enrollGeneratedCourse} disabled={aiEnrolling} className="btn-primary min-w-48 justify-center">
                  {aiEnrolling ? <><Loader2 className="h-4 w-4 animate-spin" /> Enrolling...</> : <><GraduationCap className="h-4 w-4" /> Enroll and start learning</>}
                </button>
              ) : (
                <button type="button" onClick={() => void checkGeneratedCourseStatus()} disabled={aiEnrolling} className="btn-secondary min-w-48 justify-center">
                  {aiEnrolling ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : "Check approval status"}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {catalogQuery.trim() ? (
        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="bfs-eyebrow">Search results</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Courses for “{catalogQuery}”
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredCourses.length} course{filteredCourses.length === 1 ? '' : 's'} match your current filters.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 rounded-2xl">
              <CourseGridSkeleton count={6} />
            </div>
          ) : catalogError ? null : (
            <div className="mt-5 rounded-2xl">
              {visibleCourses.length > 0 && (
                <div className="bfs-course-results-grid grid gap-4">
                  {visibleCourses.map((course) => (
                    <CourseCard key={course.id} course={course} showActions initiallySaved={savedCourseIds.has(course.id)} initiallyEnrolled={enrolledCourseIds.has(course.id)} />
                  ))}
                </div>
              )}

              {catalogPagination}

              {youtubeDiscovery && (
                <YouTubeSearchFallback
                  query={youtubeDiscovery.query}
                  courses={youtubeDiscovery.courseRecommendations || []}
                  playlists={youtubeDiscovery.playlists || []}
                  curatedResources={Array.isArray(youtubeDiscovery.curatedResources) ? youtubeDiscovery.curatedResources : undefined}
                  curationMeta={youtubeDiscovery.curationMeta || null}
                  loadingPlaylists={youtubePlaylistsLoading}
                  error={youtubePlaylistError || youtubeDiscovery.youtubeError || ""}
                  hasLocalResults={filteredCourses.length > 0}
                />
              )}

              {filteredCourses.length === 0 && !youtubeDiscovery && (
                <div className="py-8">
                  <EmptyState
                    icon={<BookOpen className="h-8 w-8" />}
                    title="No matching courses"
                    description="Try another search term or use Build with AI to create a personalized learning path."
                  />
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="bfs-eyebrow">Explore the catalog</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">All available courses</h2>
              <p className="mt-1 text-sm text-slate-500">{filteredCourses.length} published course{filteredCourses.length === 1 ? '' : 's'} available. Browse the full catalog, not only popular courses.</p>
            </div>
          </div>
          {loading ? (
            <div className="bfs-course-results-grid mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => <div key={item} className="h-[420px] animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
            </div>
          ) : catalogError ? null : filteredCourses.length === 0 ? (
            <div className="mt-5"><EmptyState icon={<BookOpen className="h-8 w-8" />} title="No courses available" description="Published courses will appear here. Try changing your filters or search." /></div>
          ) : (
            <>
              <div className="bfs-course-results-grid mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleCourses.map((course) => <CourseCard key={course.id} course={course} showActions />)}
              </div>
              {catalogPagination}
            </>
          )}
        </section>
      )}
    </div>
  );
}
