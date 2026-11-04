import { useEffect, useState, useMemo, useRef, useCallback, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, CourseLevel, LessonType, QuizContent, TutorialContent } from '@/types';
import CourseCard from '@/components/CourseCard';
import { CourseGridSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import { Search, BookOpen, Filter, X, Sparkles, Loader2, ChevronDown, ChevronRight, Play, CircleHelp, FolderKanban, GraduationCap, ExternalLink } from 'lucide-react';
import YouTubeSearchFallback from '@/components/YouTubeSearchFallback';
import { routes } from "@/lib/routes";
import { getNicheQuestions, getNicheDisclaimer, getPurposeQuestions, getSkillChecklist } from "@/data/buildWithAiQuestionPacks";

const INTENT_V2 = import.meta.env.VITE_INTENT_V2 === "true";
const ASYNC_ROADMAP = import.meta.env.VITE_ASYNC_ROADMAP === "true";
type IntentQuestion = { id: string; type: "single" | "multi" | "text" | "paste" | "checklist" | "time"; text: string; options?: string[]; allowText?: boolean; optional: boolean; when?: string; why?: string; changes?: string[] };
type IntentProfile = { topic?: string; domain?: string; scope?: "narrow" | "broad"; goal?: "job_ready" | "exam" | "project" | "learn" | null; level?: CourseLevel; knownSkills?: string[]; minutesPerDay?: number; language?: string; targetRole?: string | null; targetCompany?: string | null; examName?: string | null; examDate?: string | null; syllabusText?: string | null; projectIdea?: string | null; deadline?: string | null; outcome?: string; preferences?: Record<string, string> };
type IntentParse = { valid: boolean; profile: IntentProfile | null; confidences: Record<string, number>; domain: string; scope: string; options: { roles: string[]; exams: string[]; projectIdeas: string[] }; questionPlan: IntentQuestion[]; assumed?: boolean; assumptions?: { field: string; value: unknown }[]; inferredGoal?: string; fallback?: boolean };

const levels: CourseLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

const AI_GOAL_OPTIONS = [
  { value: 'Build practical skills', label: 'Build practical skills', description: 'Learn by doing and applying' },
  { value: 'Career or professional growth', label: 'Career or work growth', description: 'Advance in a role or change direction' },
  { value: 'Prepare for an exam or certification', label: 'Exam or certification', description: 'Prepare for a structured assessment' },
  { value: 'Create a project or deliverable', label: 'Create something', description: 'Make a project, portfolio, or tangible result' },
  { value: 'Master the fundamentals', label: 'Learn the fundamentals', description: 'Build a clear foundation from the start' },
  { value: 'Explore a personal interest', label: 'Personal interest', description: 'Learn for curiosity or everyday life' },
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

type AiRoadmap = {
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
  personalization?: {
    studyTimeMinutesPerDay?: number;
    goals?: string[];
    skippedSkills?: string[];
    rationale?: string[];
  };
};

type AiUsage = {
  plan?: { name?: string; limits?: { ai_course_builds_per_month?: number | null } };
  features?: { aiCourseBuilder?: boolean };
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [youtubeDiscovery, setYoutubeDiscovery] = useState<SearchDiscovery | null>(null);
  const [youtubePlaylistsLoading, setYoutubePlaylistsLoading] = useState(false);
  const [youtubePlaylistError, setYoutubePlaylistError] = useState("");
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [catalogSort, setCatalogSort] = useState<"recent" | "popular" | "title">("recent");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  const catalogPageSize = 12;
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
  const [intentQuestionIndex, setIntentQuestionIndex] = useState(0);
  const [intentAnswers, setIntentAnswers] = useState<Record<string, string>>({});
  const [retiredIntentQuestionIds, setRetiredIntentQuestionIds] = useState<string[]>([]);
  const [intentWizardStep, setIntentWizardStep] = useState(1);

  const [aiGoal, setAiGoal] = useState<string>('Build practical skills');
  const [aiGoalTouched, setAiGoalTouched] = useState(false);
  const [aiLevelTouched, setAiLevelTouched] = useState(false);
  const [aiCustomGoal, setAiCustomGoal] = useState('');
  const [aiLevel, setAiLevel] = useState<CourseLevel>('Beginner');
  const [aiStudyTime, setAiStudyTime] = useState(60);
  const [aiStudyDays, setAiStudyDays] = useState("5");
  const [aiScope, setAiScope] = useState<"narrow" | "broad">("broad");
  const [aiLanguagePref, setAiLanguagePref] = useState("en");
  const [aiLessonStyle, setAiLessonStyle] = useState("Project-first");
  const [aiKnownSkills, setAiKnownSkills] = useState('');
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
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
          const status = await apiFetch<{ status: string; result?: AiRoadmap }>(`/api/ai/roadmap/${encodeURIComponent(draftId)}?_=${Date.now()}`);
          if (cancelled) return;
          if (status.result) setAiRoadmap(status.result);
          if (status.status === 'ready' || status.status === 'failed') {
            window.localStorage.removeItem('bfs_async_roadmap_draft');
            if (status.status === 'failed') setAiError('The roadmap build failed. Please try again.');
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
      setLoading(true);
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
          const response: { courses?: RawCourse[]; items?: RawCourse[]; discovery?: SearchDiscovery; total?: number; pages?: number } = await apiFetch(`/api/courses?${params.toString()}`, { showFeatureUpgrade: Boolean(catalogQuery.trim()) });
          batch = response.courses || response.items || [];
          if (response.discovery) searchDiscovery = response.discovery;
          allRows.push(...batch);
          page += 1;
        } while (batch.length === 50 && page <= 200);
        setCourses(allRows.map(mapCourse));

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
        setCourses([]);
        setCatalogError(error instanceof Error ? error.message : "Unable to search courses");
      } finally {
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
          onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}
          disabled={currentCatalogPage <= 1}
        >Previous</button>
        <span aria-live="polite" className="min-w-24 text-center text-sm font-semibold text-slate-700">Page {currentCatalogPage} of {catalogPageCount}</span>
        <button
          type="button"
          aria-label="Next course page"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => setCatalogPage((page) => Math.min(catalogPageCount, page + 1))}
          disabled={currentCatalogPage >= catalogPageCount}
        >Next</button>
      </div>
    </nav>
  ) : null;

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogQuery, selectedLevel, selectedCategory, catalogSort]);

  const hasFilters = selectedLevel !== 'all' || selectedCategory !== 'all' || catalogQuery.trim().length > 0;

  const clearFilters = () => {
    setSearchQuery('');
    setCatalogQuery('');
    setSelectedLevel('all');
    setSelectedCategory('all');
    setCatalogSort("recent");
    setCatalogPage(1);
    setAiRoadmap(null);
    setAiError(null);
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
    setIntentQuestionIndex(0);
    setIntentWizardStep(1);
    setAiCustomGoal("");
    setAiGoal("Build practical skills");
    setAiGoalTouched(false);
    setAiLevel("Beginner");
    setAiLevelTouched(false);
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
    if (!aiOpen || !session) {
      setAiUsage(null);
      return;
    }

    apiFetch('/api/ai/usage')
      .then((data) => setAiUsage(data))
      .catch(() => setAiUsage(null));
  }, [aiOpen, session]);

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
        const preferences = result.profile?.preferences || {};
        if (preferences[questionId] !== undefined && String(preferences[questionId]).trim()) return true;
        if (questionId === "targetRole" && result.profile?.targetRole) return true;
        if (questionId === "deadline" && result.profile?.deadline) return true;
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
      const parsedGoal = String(result.profile?.goal || result.inferredGoal || "learn");
      const selectedPurpose = String(intentAnswers.goalPurpose || (parsedGoal === "job_ready" ? "career" : parsedGoal === "exam" ? "exam" : parsedGoal === "project" ? "project" : "hobby"));
      const purposePacks = getPurposeQuestions(selectedPurpose).filter((question) => !retiredIds.includes(question.id) && !alreadyAnswered(question.id));
      const selectedPackQuestionIds = new Set([...purposePacks, ...niche].map((question) => question.id));
      const merged = [
        ...purposePacks,
        ...niche.filter((question) => !purposePacks.some((purposeQuestion) => purposeQuestion.id === question.id)),
        ...enrichedPlan.filter((question) =>
          !selectedPackQuestionIds.has(question.id) &&
          !(question.id === "role" && purposePacks.some((packQuestion) => packQuestion.id === "targetRole")) &&
          !(question.id === "examType" && niche.some((packQuestion) => packQuestion.id === "targetExamName"))
        ),
        ...coreExtras.filter((question) => !selectedPackQuestionIds.has(question.id) && !alreadyAnswered(question.id))
      ];
      setIntentResult({ ...result, questionPlan: merged });
      setIntentQuestionIndex(0);
      if (!result.valid) {
        setIntentAnswers({});
        setAiError('That does not look like a learning topic yet. Try Python, Data Analytics, an exam name, or a project idea.');
        return;
      }
      const profile = result.profile || {};
      const timeLabels: Record<number, string> = {
        15: "15 min", 30: "30 min", 60: "1 hour", 120: "2 hours",
        180: "3+ hours", 210: "3-4 hours", 300: "5+ hours"
      };
      const goalChoices: Record<string, { goal: string; purpose: string }> = {
        "Career or professional growth": { goal: "job_ready", purpose: "career" },
        "Prepare for an exam or certification": { goal: "exam", purpose: "exam" },
        "Create a project or deliverable": { goal: "project", purpose: "project" },
        "Build practical skills": { goal: "learn", purpose: "hobby" },
        "Master the fundamentals": { goal: "learn", purpose: "hobby" },
        "Explore a personal interest": { goal: "learn", purpose: "hobby" }
      };
      const selectedGoalChoice = goalChoices[aiGoal] || goalChoices["Build practical skills"];
      const inferredGoal = String(profile.goal || result.inferredGoal || "learn");
      const selectedGoal = aiGoalTouched ? selectedGoalChoice.goal : inferredGoal;
      const selectedPurpose = intentAnswers.goalPurpose || (aiGoalTouched
        ? selectedGoalChoice.purpose
        : inferredGoal === "job_ready" ? "career" : inferredGoal === "exam" ? "exam" : inferredGoal === "project" ? "project" : "hobby");
      const parsedKnownSkills = Array.isArray(profile.knownSkills) ? profile.knownSkills.join(", ") : "";
      const parsedLanguage = ({ en: "English", hi: "Hindi", mr: "Marathi" } as Record<string, string>)[String(profile.language || "en")] || String(profile.language || "English");
      const mergedAnswers: Record<string, string> = {
        role: String(profile.targetRole || ""),
        company: String(profile.targetCompany || ""),
        examType: String(profile.examName || ""),
        examDate: String(profile.examDate || ""),
        syllabus: String(profile.syllabusText || ""),
        projectIdea: String(profile.projectIdea || ""),
        depth: String(profile.scope || "broad"),
        level: String(profile.level || aiLevel),
        time: timeLabels[Number(profile.minutesPerDay || 60)] || "1 hour",
        language: parsedLanguage,
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
      if (profile.preferences?.studyDays && !intentAnswers.studyDays) setAiStudyDays(String(profile.preferences.studyDays));
      if (profile.preferences?.lessonStyle && !intentAnswers.lessonStyle) setAiLessonStyle(String(profile.preferences.lessonStyle));
      const goalValues: Record<string, string> = { job_ready: 'Career or professional growth', exam: 'Prepare for an exam or certification', project: 'Create a project or deliverable', learn: 'Build practical skills' };
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
  ).slice(0, 8);
  const purposeQuestionIds = new Set([
    "role", "company", "targetRole", "jobTimeline", "examType", "examDate", "syllabus", "projectIdea",
    "portfolioStatus", "clientAcquisition", "freelancePortfolio", "freelanceService",
    "switchExperience", "switchTarget", "examPreparationType", "examTimeline",
    "projectAudience", "hobbyFocus", "learningMotivation"
  ]);
  const purposeIntentQuestions = activeIntentQuestions.filter((question) => purposeQuestionIds.has(question.id));
  const nicheIntentQuestions = activeIntentQuestions.filter((question) => !purposeQuestionIds.has(question.id) && !coreQuestionIds.has(question.id));
  const visibleWizardQuestions = intentWizardStep === 2 ? purposeIntentQuestions : intentWizardStep === 3 ? nicheIntentQuestions : [];
  const visibleWizardQuestionKey = visibleWizardQuestions.map((question) => question.id).join("|");
  const trackIntentQuestionEvent = useCallback((question: IntentQuestion, event: "shown" | "answered" | "skipped" | "abandoned", position = intentQuestionIndex) => {
    if (!session || !aiTopic.trim()) return;
    void apiFetch('/api/intent/events', {
      method: 'POST',
      body: JSON.stringify({
        questionId: question.id,
        packId: question.id.startsWith('domain_') ? 'dynamic_domain' : 'core_or_niche',
        event,
        position: Math.max(0, Math.min(20, position))
      })
    }).catch(() => {});
  }, [session, aiTopic, intentQuestionIndex]);
  const clearIntentAssumption = (field: string) => {
    setIntentResult((current) => {
      if (!current?.assumptions?.length) return current;
      const assumptions = current.assumptions.filter((item) => item.field !== field);
      return { ...current, assumptions, assumed: assumptions.length > 0 };
    });
  };
  const assumptionFieldForQuestion: Record<string, string> = {
    goal: "goal", depth: "scope", role: "targetRole", company: "targetCompany",
    examType: "examName", examDate: "examDate", syllabus: "syllabusText",
    projectIdea: "projectIdea", time: "minutesPerDay", language: "language",
    knownSkills: "knownSkills", deadline: "deadline"
  };
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
  const chooseIntentOption = (question: IntentQuestion, value: string, advance = true) => {
    if (question.id !== "knownSkills") trackIntentQuestionEvent(question, "answered");
    if (value === "Not sure, pick for me" && question.id !== "knownSkills") {
      clearIntentAssumption(assumptionFieldForQuestion[question.id] || question.id);
      setIntentAnswers((previous) => {
        const next = { ...previous };
        if (question.id === "goal") {
          next.goal = "learn";
          next.goalPurpose = "hobby";
        } else if (question.id === "depth") next.depth = "narrow";
        else if (question.id === "language") next.language = "en";
        else if (question.id === "time") next.time = "1 hour";
        else next[question.id] = "";
        return next;
      });
      if (advance) {
        if (question.id === "goal") setIntentQuestionIndex(0);
        else setIntentQuestionIndex((index) => Math.min(index + 1, activeIntentQuestions.length));
      }
      return;
    }
    if (question.id === "knownSkills") {
      if (value === "Not sure, pick for me") {
        clearIntentAssumption("knownSkills");
        setIntentAnswers((previous) => ({ ...previous, knownSkills: "" }));
        if (advance) setIntentQuestionIndex((index) => Math.min(index + 1, activeIntentQuestions.length));
        return;
      }
      const selected = String(intentAnswers.knownSkills || "").split(",").map((item) => item.trim()).filter(Boolean);
      const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
      setIntentAnswers((previous) => ({ ...previous, knownSkills: next.join(", ") }));
      return;
    }
    const purposeMap: Record<string, { goal: string; purpose: string }> = {
      "Job-ready": { goal: "job_ready", purpose: "career" },
      "Exam or certification": { goal: "exam", purpose: "exam" },
      "Build a project": { goal: "project", purpose: "project" },
      "Learn a skill": { goal: "learn", purpose: "hobby" },
      "Freelancing": { goal: "project", purpose: "freelance" },
      "Switch careers": { goal: "job_ready", purpose: "career_switch" },
      "Personal interest": { goal: "learn", purpose: "hobby" }
    };
    const mapped = question.id === 'goal'
      ? purposeMap[value]?.goal || value
      : question.id === 'depth'
        ? (value === 'Complete learning path' ? 'broad' : 'narrow')
        : question.id === 'language'
          ? ({ English: 'en', Hindi: 'hi', Marathi: 'mr' } as Record<string, string>)[value] || value
          : question.id === 'level'
            ? ({ "New to this": "Beginner", "Know the basics": "Intermediate", "Experienced — go deeper": "Advanced" } as Record<string, string>)[value] || value
            : value;
    if (question.id === "level") setAiLevel(mapped as CourseLevel);
    clearIntentAssumption(assumptionFieldForQuestion[question.id] || question.id);
    setIntentAnswers((previous) => ({
      ...previous,
      [question.id]: mapped,
      ...(question.id === "goal" && purposeMap[value] ? { goalPurpose: purposeMap[value].purpose } : {})
    }));
    if (advance) {
      if (question.id === 'goal') setIntentQuestionIndex(0);
      else setIntentQuestionIndex((index) => Math.min(index + 1, activeIntentQuestions.length));
    }
  };

  const isIntentOptionSelected = (question: IntentQuestion, option: string) => {
    if (option === "Not sure, pick for me") return false;
    if (question.id === "knownSkills") return String(intentAnswers.knownSkills || "").split(",").map((item) => item.trim()).includes(option);
    if (question.id === "goal") {
      const purpose = String(intentAnswers.goalPurpose || "");
      if (purpose === "freelance" && option === "Freelancing") return true;
      if (purpose === "career_switch" && option === "Switch careers") return true;
      if (purpose === "hobby" && option === "Personal interest") return true;
      const goal = String(intentAnswers.goal || intentResult?.profile?.goal || "");
      const labels: Record<string, string> = { job_ready: "Job-ready", exam: "Exam or certification", project: "Build a project", learn: "Learn a skill" };
      return labels[goal] === option;
    }
    const answer = String(intentAnswers[question.id] ?? "");
    if (question.id === "depth") return (answer || String(intentResult?.profile?.scope || "")) === (option === "Complete learning path" ? "broad" : "narrow");
    if (question.id === "language") {
      const language = answer || String(intentResult?.profile?.language || "");
      return ({ en: "English", hi: "Hindi", mr: "Marathi" } as Record<string, string>)[language] === option || language === option;
    }
    if (question.id === "time") {
      const minutes = answer || String(intentResult?.profile?.minutesPerDay || "");
      const labels: Record<string, string> = { "15": "15 min", "30": "30 min", "60": "1 hour", "120": "2 hours", "180": "3+ hours" };
      return labels[minutes] === option || minutes === option;
    }
    if (answer) return answer === option;
    return String(intentResult?.profile?.preferences?.[question.id] || "") === option;
  };

  const commitIntentTextAnswer = (question: IntentQuestion, advance = true) => {
    const rawAnswer = String(intentAnswers[question.id] || '').trim();
    trackIntentQuestionEvent(question, rawAnswer ? "answered" : "skipped");
    if (rawAnswer) clearIntentAssumption(assumptionFieldForQuestion[question.id] || question.id);
    if (question.id === 'role' && rawAnswer) {
      const tokens = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9+#.]+/).filter((token) => token.length > 1));
      const answerTokens = tokens(rawAnswer);
      const candidates = intentResult?.options.roles || [];
      const ranked = candidates.map((candidate) => {
        const candidateTokens = tokens(candidate);
        const overlap = [...answerTokens].filter((token) => candidateTokens.has(token)).length;
        const score = overlap / Math.max(1, new Set([...answerTokens, ...candidateTokens]).size);
        return { candidate, score };
      }).sort((a, b) => b.score - a.score);
      // Prefer an AI-suggested role only when the typed answer has meaningful lexical overlap.
      const best = ranked[0];
      const answer = best && (best.score >= 0.25 || best.candidate.toLowerCase() === rawAnswer.toLowerCase())
        ? best.candidate
        : rawAnswer;
      setIntentAnswers((previous) => ({ ...previous, [question.id]: answer }));
    }
    if (advance) setIntentQuestionIndex((index) => Math.min(index + 1, activeIntentQuestions.length));
  };

  const renderIntentQuestion = (question: IntentQuestion, accent: "purpose" | "niche") => {
    const currentAnswer = String(intentAnswers[question.id] || "");
    const options = question.options?.length
      ? (question.options.includes("Not sure, pick for me") ? question.options : [...question.options, "Not sure, pick for me"])
      : [];
    const selectedClass = accent === "purpose"
      ? "border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-500/20"
      : "border-pink-500 bg-pink-50 text-pink-900 ring-1 ring-pink-500/20";
    const idleClass = "border-slate-200 bg-white text-slate-700 hover:border-violet-400 hover:bg-violet-50";
    return (
      <section key={question.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{question.text}</h3>
          {question.optional && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Optional</span>}
        </div>
        {question.why && <p className="text-xs leading-5 text-slate-500">Why we ask: {question.why}</p>}
        {options.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.slice(0, 9).map((option) => {
              const selected = isIntentOptionSelected(question, option);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseIntentOption(question, option, false)}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${selected ? selectedClass : idleClass}`}
                >
                  {selected ? "✓ " : ""}{option}
                </button>
              );
            })}
          </div>
        )}
        {(question.type === "text" || question.type === "paste" || question.allowText) && (
          <div className="space-y-2">
            <textarea
              rows={question.type === "paste" ? 5 : 2}
              maxLength={question.id === "syllabus" ? 20000 : 1200}
              value={currentAnswer}
              onChange={(event) => {
                setIntentAnswers((previous) => ({ ...previous, [question.id]: event.target.value }));
                if (event.target.value.trim()) clearIntentAssumption(assumptionFieldForQuestion[question.id] || question.id);
              }}
              placeholder={question.id === "syllabus" ? "Paste syllabus units here…" : "Type an answer (optional)…"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
            />
            <button type="button" onClick={() => commitIntentTextAnswer(question, false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Save answer
            </button>
          </div>
        )}
        {question.changes?.length ? (
          <p className="text-[11px] text-slate-500">Changes: <span className="font-semibold text-slate-600">{question.changes.join(", ")}</span></p>
        ) : null}
      </section>
    );
  };

  const generateAiRoadmap = async () => {
    if (INTENT_V2 && intentResult && !intentResult.valid) {
      setAiError('Change the topic to a learnable subject or outcome before building a roadmap.');
      return;
    }
    if (INTENT_V2 && !intentResult) {
      await startIntentFlow();
      return;
    }
    const topic = aiTopic.trim();
    if (!topic) {
      setAiError('Add a subject, skill, question, or outcome to build a plan.');
      return;
    }
    if (!session) {
      setAiError('Sign in to generate a personalized AI roadmap.');
      return;
    }
    setAiLoading(true);
    aiLoadingRef.current = true;
    setAiError(null);
    try {
      const selectedGoal = String(intentAnswers.goal || intentResult?.profile?.goal || intentResult?.inferredGoal || 'learn');
      const legacyGoal = ({ job_ready: 'Career or work growth', exam: 'Exam or certification', project: 'Create something', learn: 'Build practical skills' } as Record<string, string>)[selectedGoal] || aiGoal;
      const intentProfile = INTENT_V2 && intentResult?.valid ? {
        ...intentResult.profile,
        level: String(intentAnswers.level || intentResult.profile?.level || aiLevel) as CourseLevel,
        topic,
        goal: selectedGoal,
        targetRole: String(intentAnswers.role || intentAnswers.targetRole || intentAnswers.aiRole || intentResult.profile?.targetRole || '') || null,
        targetCompany: String(intentAnswers.company ?? intentResult.profile?.targetCompany ?? '') || null,
        examName: String(intentAnswers.examType || intentAnswers.targetExamName || intentResult.profile?.examName || '') || null,
        examDate: String(intentAnswers.examDate ?? intentResult.profile?.examDate ?? '') || null,
        syllabusText: String(intentAnswers.syllabus ?? intentResult.profile?.syllabusText ?? '') || null,
        projectIdea: String(intentAnswers.projectIdea ?? intentResult.profile?.projectIdea ?? '') || null,
        scope: intentAnswers.depth ? (intentAnswers.depth === 'broad' || intentAnswers.depth === 'Complete learning path' ? 'broad' : 'narrow') : (intentResult.profile?.scope || 'narrow'),
        minutesPerDay: ({ '15 min': 15, '30 min': 30, '1 hour': 60, '2 hours': 120, '3+ hours': 180, '3-4 hours': 210, '5+ hours': 300 } as Record<string, number>)[String(intentAnswers.time || '')] || Number(intentResult.profile?.minutesPerDay || aiStudyTime),
        language: String(intentAnswers.language || intentResult.profile?.language || 'en'),
        knownSkills: String(intentAnswers.knownSkills ?? aiKnownSkills).split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 50),
        outcome: aiCustomGoal.trim(),
        deadline: String(intentAnswers.deadline ?? intentResult.profile?.deadline ?? '') || null,
        preferences: Object.fromEntries(['buildTarget', 'dsaNeeded', 'includeDsa', 'mathComfort', 'studyDays', 'lessonStyle', 'goalPurpose', 'jobTimeline', 'portfolioStatus', 'clientAcquisition', 'freelancePortfolio', 'freelanceService', 'switchExperience', 'switchTarget', 'examPreparationType', 'examTimeline', 'projectAudience', 'hobbyFocus', 'marketingChannel', 'aiRole', 'creativeTool', 'primaryTool', 'labAccess', 'cloudVendor', 'languageGoal', 'langGoal', 'officeToolVersion', 'officeTask', 'creativeMedium', 'instrumentOwned', 'financeGoal', 'marketRegion', 'investingStyle', 'fitnessEquipment', 'practiceSetup', 'targetExamName'].filter((key) => intentAnswers[key]).map((key) => [key, String(intentAnswers[key])]))
      } : undefined;
      const profile = {
        topic,
        level: intentProfile?.level || aiLevel,
        goals: INTENT_V2 ? [legacyGoal, aiCustomGoal.trim()].filter(Boolean) : [aiGoal, aiCustomGoal.trim()].filter(Boolean),
        studyTimeMinutesPerDay: intentProfile?.minutesPerDay || aiStudyTime,
        knownSkills: intentProfile?.knownSkills || aiKnownSkills.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 50),
        ...(intentProfile ? { intentProfile } : {})
      };
      let data;
      if (ASYNC_ROADMAP) {
        const draft = await apiFetch<{ draftId: string }>('/api/ai/roadmap/draft', {
          method: 'POST', body: JSON.stringify({ profile }), showFeatureUpgrade: true
        });
        window.localStorage.setItem('bfs_async_roadmap_draft', draft.draftId);
        const started = await apiFetch<{ draftId: string; status: string; roadmapId?: string | null; modules?: AiModule[]; course?: unknown }>('/api/ai/roadmap', {
          method: 'POST', body: JSON.stringify({ draftId: draft.draftId, profile }), showFeatureUpgrade: true
        });
        setAiRoadmap({
          status: started.status || 'building',
          query: topic,
          course: { title: topic + ' learning roadmap', modules: started.modules || [] },
          draftId: draft.draftId
        });
        let current = started;
        while (current.status !== 'ready') {
          if (current.status === 'failed') throw new Error('Roadmap build failed. Please retry.');
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          const polled = await apiFetch<{ draftId: string; status: string; result?: AiRoadmap }>(`/api/ai/roadmap/${encodeURIComponent(draft.draftId)}?_=${Date.now()}`);
          current = polled;
          if (polled.result) setAiRoadmap(polled.result);
          if (polled.status === 'ready' && polled.result) {
            data = polled.result;
            break;
          }
        }
        if (!data) throw new Error('Roadmap build ended without a result. Please retry.');
        window.localStorage.removeItem('bfs_async_roadmap_draft');
      } else {
        data = await apiFetch('/api/ai/roadmap', {
          method: 'POST', body: JSON.stringify(profile), showFeatureUpgrade: true
        });
      }
      setAiRoadmap(data);
      setExpandedAiModules(new Set([0]));
      setAiEnrollError(null);
      setAiOpen(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI roadmap generation failed');
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
    setCatalogQuery(query);
    setAiRoadmap(null);
    setAiError(null);
  };

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
                  setIntentQuestionIndex(0);
                  setIntentWizardStep(1);
                  setAiCustomGoal("");
                  setAiGoal("Build practical skills");
                  setAiGoalTouched(false);
                  setAiLevel("Beginner");
                  setAiLevelTouched(false);
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
              onChange={(e) => setSelectedLevel(e.target.value as CourseLevel | 'all')}
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
              onChange={(e) => setSelectedCategory(e.target.value)}
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
              onChange={(e) => { setCatalogSort(e.target.value as "recent" | "popular" | "title"); setCatalogPage(1); }}
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-6"
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
            className="flex max-h-[min(94dvh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-violet-700">AI learning planner</p>
                <h2 id="ai-builder-title" className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                  Create your learning roadmap
                </h2>
                <p id="ai-builder-description" className="mt-1 text-sm leading-5 text-slate-600">
                  A guided four-step setup that adapts to your goal, learning domain and starting skills.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                disabled={aiLoading}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                aria-label="Close AI learning planner"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {aiUsage && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs sm:px-6">
                <span className="font-semibold text-slate-700">
                  {aiUsage.plan?.name || 'Current'} plan
                  {aiUsage.features?.aiCourseBuilder ? ' · AI builder available' : ' · Check plan access'}
                </span>
                <span className="text-slate-500">
                  Builds/month: {aiUsage.plan?.limits?.ai_course_builds_per_month ?? '—'}
                </span>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              {INTENT_V2 ? (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                  <div className="space-y-5 xl:col-span-7">
                    {intentResult && !intentResult.valid && (
                      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        We could not confidently identify this as a learning topic. Edit the topic below and try again.
                        <button type="button" className="ml-2 font-semibold underline" onClick={() => { setIntentResult(null); setAiError(null); setIntentWizardStep(1); }}>Retry topic</button>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Build with AI · Adaptive intake</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">Step {intentWizardStep} of 4</p>
                        </div>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">About 8 focused answers</span>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Form progress">
                        {[
                          { number: 1, label: "Core" },
                          { number: 2, label: "Purpose" },
                          { number: 3, label: "Domain" },
                          { number: 4, label: "Review" }
                        ].map((item) => (
                          <div key={item.number} className="space-y-1.5">
                            <div className={\`h-1.5 rounded-full ${intentWizardStep >= item.number ? "bg-violet-600" : "bg-slate-100"}\`} />
                            <p className={\`text-[10px] font-semibold ${intentWizardStep === item.number ? "text-violet-700" : intentWizardStep > item.number ? "text-slate-700" : "text-slate-400"}\`}>{item.number}. {item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {intentWizardStep === 1 && (
                      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="border-b border-slate-100 pb-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Layer 1 · Core foundation</p>
                          <h3 className="mt-1 text-xl font-bold text-slate-950">What do you want to learn?</h3>
                          <p className="mt-1 text-sm text-slate-500">Set your outcome, starting point and realistic study schedule.</p>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="ai-topic" className="block text-sm font-semibold text-slate-800">Topic or course name</label>
                          <input
                            id="ai-topic"
                            autoFocus
                            maxLength={200}
                            value={aiTopic}
                            onChange={(event) => {
                              setAiTopic(event.target.value);
                              if (intentResult) {
                                setIntentResult(null);
                                setIntentAnswers({});
                                setIntentWizardStep(1);
                              }
                            }}
                            placeholder="e.g. React and Node.js, Python, Data Analytics, AWS…"
                            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                          />
                          <p className="text-xs text-slate-500">We use this topic to detect the learning domain and load relevant questions.</p>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="ai-outcome" className="block text-sm font-semibold text-slate-800">In one sentence, what should you be able to do at the end?</label>
                          <textarea
                            id="ai-outcome"
                            rows={2}
                            maxLength={500}
                            value={aiCustomGoal}
                            onChange={(event) => setAiCustomGoal(event.target.value)}
                            placeholder="e.g. Build and deploy a full-stack application and prepare for developer interviews…"
                            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                          />
                          <p className="text-[11px] text-slate-500">Why we ask: this shapes the course projects, resource searches and final capstone.</p>
                        </div>

                        <fieldset className="space-y-2">
                          <legend className="text-sm font-semibold text-slate-800">Why are you learning it?</legend>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {[
                              { id: "job_ready", purpose: "career", label: "Job / Career", goal: "Career or professional growth" },
                              { id: "exam", purpose: "exam", label: "Exam / Certification", goal: "Prepare for an exam or certification" },
                              { id: "project", purpose: "project", label: "Build a project", goal: "Create a project or deliverable" },
                              { id: "learn", purpose: "hobby", label: "Practical skills", goal: "Build practical skills" },
                              { id: "project", purpose: "freelance", label: "Freelancing", goal: "Create a project or deliverable" },
                              { id: "job_ready", purpose: "career_switch", label: "Career switch", goal: "Career or professional growth" },
                              { id: "learn", purpose: "hobby", label: "Personal interest", goal: "Explore a personal interest" }
                            ].map((option) => {
                              const selected = String(intentAnswers.goal || intentResult?.profile?.goal || (aiGoalTouched ? "" : "learn")) === option.id
                                && String(intentAnswers.goalPurpose || (intentResult?.profile?.goal === "job_ready" ? "career" : intentResult?.profile?.goal === "exam" ? "exam" : intentResult?.profile?.goal === "project" ? "project" : aiGoalTouched ? "" : "hobby")) === option.purpose;
                              return (
                                <button
                                  key={option.label}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => {
                                    setAiGoal(option.goal);
                                    setAiGoalTouched(true);
                                    setIntentAnswers((previous) => ({ ...previous, goal: option.id, goalPurpose: option.purpose }));
                                  }}
                                  className={selected
                                    ? "min-h-12 rounded-xl border border-violet-500 bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-900 ring-1 ring-violet-500/20"
                                    : "min-h-12 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50"}
                                >
                                  {selected ? "✓ " : ""}{option.label}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-semibold text-slate-800">Starting level</legend>
                            <div className="grid grid-cols-3 gap-2">
                              {levels.map((level) => (
                                <button
                                  key={level}
                                  type="button"
                                  aria-pressed={aiLevel === level}
                                  onClick={() => {
                                    setAiLevel(level);
                                    setAiLevelTouched(true);
                                    setIntentAnswers((previous) => ({ ...previous, level }));
                                  }}
                                  className={aiLevel === level
                                    ? "rounded-lg border border-violet-500 bg-violet-50 px-2 py-2.5 text-xs font-semibold text-violet-900"
                                    : "rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-xs font-semibold text-slate-600 hover:border-violet-400"}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-semibold text-slate-800">How far do you want to go?</legend>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { value: "narrow", label: "Quick overview" },
                                { value: "broad", label: "Complete learning path" }
                              ].map((option) => {
                                const selected = String(intentAnswers.depth || aiScope) === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => {
                                      setAiScope(option.value as "narrow" | "broad");
                                      setIntentAnswers((previous) => ({ ...previous, depth: option.value }));
                                    }}
                                    className={selected
                                      ? "rounded-lg border border-violet-500 bg-violet-50 px-2 py-2.5 text-xs font-semibold text-violet-900"
                                      : "rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-xs font-semibold text-slate-600 hover:border-violet-400"}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-sm font-semibold text-slate-800">What can you already do?</label>
                            <span className="text-[10px] font-medium text-slate-500">Select all that apply</span>
                          </div>
                          {getSkillChecklist(aiTopic).length > 0 ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {getSkillChecklist(aiTopic).map((skill) => {
                                const selected = aiKnownSkills.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).includes(skill);
                                return (
                                  <button
                                    key={skill}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => {
                                      const current = aiKnownSkills.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
                                      const next = current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill];
                                      const value = next.join(", ");
                                      setAiKnownSkills(value);
                                      setIntentAnswers((previous) => ({ ...previous, knownSkills: value }));
                                    }}
                                    className={selected
                                      ? "flex items-center justify-between rounded-lg border border-violet-500 bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-900"
                                      : "flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-violet-400"}
                                  >
                                    <span>{skill}</span>
                                    {selected && <span aria-hidden="true">✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <textarea
                              rows={2}
                              maxLength={1200}
                              value={aiKnownSkills}
                              onChange={(event) => {
                                setAiKnownSkills(event.target.value);
                                setIntentAnswers((previous) => ({ ...previous, knownSkills: event.target.value }));
                              }}
                              placeholder="List any subjects, concepts, tools or experience you already have. Leave blank to start from scratch."
                              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                            />
                          )}
                          <p className="text-[11px] text-slate-500">Known skills will be used to skip introductory lessons where appropriate.</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label htmlFor="ai-study-time-v2" className="block text-sm font-semibold text-slate-800">
                            Time per day
                            <select
                              id="ai-study-time-v2"
                              value={aiStudyTime}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                const labels: Record<number, string> = { 60: "1 hour", 120: "2 hours", 210: "3-4 hours", 300: "5+ hours" };
                                setAiStudyTime(value);
                                setIntentAnswers((previous) => ({ ...previous, time: labels[value] }));
                              }}
                              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                            >
                              <option value={60}>1 Hour / day</option>
                              <option value={120}>2 Hours / day</option>
                              <option value={210}>3–4 Hours / day</option>
                              <option value={300}>Full-time (5+ hrs)</option>
                            </select>
                          </label>
                          <label htmlFor="ai-study-days-v2" className="block text-sm font-semibold text-slate-800">
                            Days per week
                            <select
                              id="ai-study-days-v2"
                              value={aiStudyDays}
                              onChange={(event) => {
                                setAiStudyDays(event.target.value);
                                setIntentAnswers((previous) => ({ ...previous, studyDays: event.target.value }));
                              }}
                              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                            >
                              {["2", "3", "4", "5", "6", "7"].map((days) => <option key={days} value={days}>{days} days / week</option>)}
                            </select>
                          </label>
                          <label htmlFor="ai-language-v2" className="block text-sm font-semibold text-slate-800">
                            Resource language
                            <select
                              id="ai-language-v2"
                              value={intentAnswers.language || aiLanguagePref}
                              onChange={(event) => {
                                setAiLanguagePref(event.target.value);
                                setIntentAnswers((previous) => ({ ...previous, language: event.target.value }));
                              }}
                              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                            >
                              <option value="en">English</option>
                              <option value="hi">Hindi</option>
                              <option value="mr">Marathi</option>
                            </select>
                          </label>
                          <label htmlFor="ai-lesson-style-v2" className="block text-sm font-semibold text-slate-800">
                            Learning style
                            <select
                              id="ai-lesson-style-v2"
                              value={intentAnswers.lessonStyle || aiLessonStyle}
                              onChange={(event) => {
                                setAiLessonStyle(event.target.value);
                                setIntentAnswers((previous) => ({ ...previous, lessonStyle: event.target.value }));
                              }}
                              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                            >
                              <option value="Project-first">Project-first (build as you learn)</option>
                              <option value="Theory-first">Theory first, then practice</option>
                              <option value="Short-videos">Short videos with frequent practice</option>
                              <option value="Detailed tutorials">Long, detailed tutorials</option>
                            </select>
                          </label>
                          <label htmlFor="ai-deadline-v2" className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                            Target completion date <span className="font-normal text-slate-500">Optional</span>
                            <input
                              id="ai-deadline-v2"
                              type="date"
                              value={intentAnswers.deadline || ""}
                              onChange={(event) => setIntentAnswers((previous) => ({ ...previous, deadline: event.target.value }))}
                              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                            />
                          </label>
                        </div>
                      </section>
                    )}

                    {intentWizardStep === 2 && (
                      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="border-b border-slate-100 pb-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-purple-700">Layer 2 · Purpose pack</p>
                          <h3 className="mt-1 text-xl font-bold text-slate-950">Context and objectives</h3>
                          <p className="mt-1 text-sm text-slate-500">These questions depend on whether you are learning for a job, exam, project, freelancing or personal interest.</p>
                        </div>
                        {purposeIntentQuestions.length ? (
                          <div className="space-y-3">{purposeIntentQuestions.map((question) => renderIntentQuestion(question, "purpose"))}</div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                            No additional purpose questions are needed. Your goal and core preferences are enough to continue.
                          </div>
                        )}
                      </section>
                    )}

                    {intentWizardStep === 3 && (
                      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="border-b border-slate-100 pb-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-pink-700">Layer 3 · Domain pack</p>
                          <h3 className="mt-1 text-xl font-bold text-slate-950">Domain-specific fine tuning</h3>
                          <p className="mt-1 text-sm text-slate-500">Choose the tools, focus areas and practice setup that best match this subject.</p>
                        </div>
                        {getNicheDisclaimer(aiTopic) && (
                          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                            <span className="font-semibold">Safety and learning note:</span> {getNicheDisclaimer(aiTopic)}
                          </div>
                        )}
                        {nicheIntentQuestions.length ? (
                          <div className="space-y-3">{nicheIntentQuestions.map((question) => renderIntentQuestion(question, "niche"))}</div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                            No extra domain questions are required for this topic. The AI will use your topic, outcome and core preferences.
                          </div>
                        )}
                      </section>
                    )}

                    {intentWizardStep === 4 && (
                      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="border-b border-slate-100 pb-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Final strategy · Review</p>
                          <h3 className="mt-1 text-xl font-bold text-slate-950">Your personalized blueprint</h3>
                          <p className="mt-1 text-sm text-slate-500">Review the choices that will guide course structure, resource selection and project design.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            { label: "Topic and level", value: aiTopic + " · " + aiLevel },
                            { label: "Outcome", value: aiCustomGoal || "Build a practical understanding" },
                            { label: "Learning purpose", value: String(intentAnswers.goalPurpose || intentPurpose).replace(/_/g, " ") },
                            { label: "Depth", value: String(intentAnswers.depth || aiScope) === "broad" ? "Complete learning path" : "Quick overview" },
                            { label: "Study schedule", value: aiStudyTime + " minutes/day · " + aiStudyDays + " days/week" },
                            { label: "Learning style", value: String(intentAnswers.lessonStyle || aiLessonStyle) },
                            { label: "Language", value: String(intentAnswers.language || aiLanguagePref) }
                          ].map((item) => (
                            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-violet-800">Active roadmap modifiers</h4>
                          <ul className="space-y-2 text-xs text-slate-700">
                            <li>✓ Prior knowledge: {aiKnownSkills || "No prior skills selected; start from the foundations."}</li>
                            <li>✓ Resource search: query language and learning style will guide resource curation.</li>
                            <li>✓ Practice design: selected purpose and domain answers will shape projects and assessments.</li>
                            <li>✓ Schedule: study time and days per week will guide lesson pacing.</li>
                          </ul>
                        </div>
                        {Object.keys(intentAnswers).some((key) => Boolean(intentAnswers[key])) && (
                          <details className="rounded-xl border border-slate-200 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Review all additional answers</summary>
                            <dl className="mt-3 space-y-2">
                              {Object.entries(intentAnswers).filter(([key, value]) => Boolean(value) && !["knownSkills"].includes(key)).map(([key, value]) => (
                                <div key={key} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                                  <dt className="font-medium text-slate-500">{key.replace(/([A-Z])/g, " $1")}</dt>
                                  <dd className="max-w-[65%] text-right font-semibold text-slate-800">{String(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </section>
                    )}

                    {aiError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">{aiError}</div>}
                  </div>

                  <aside className="space-y-4 xl:col-span-5">
                    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-200">Live form schema</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">Structured preview of the roadmap inputs</p>
                        </div>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">Synced</span>
                      </div>
                      <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-4 text-[10px] leading-5 text-slate-300">{JSON.stringify({
                        layer1_core: {
                          topic: aiTopic,
                          endGoal: aiCustomGoal,
                          priorSkills: aiKnownSkills.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
                          startingLevel: aiLevel,
                          depth: intentAnswers.depth || aiScope,
                          primaryPurpose: intentAnswers.goalPurpose || intentPurpose,
                          schedule: {
                            minutesPerDay: aiStudyTime,
                            daysPerWeek: aiStudyDays,
                            learningStyle: intentAnswers.lessonStyle || aiLessonStyle,
                            language: intentAnswers.language || aiLanguagePref
                          }
                        },
                        layer2_purposePack: {
                          purpose: intentPurpose,
                          answers: Object.fromEntries(Object.entries(intentAnswers).filter(([key]) => purposeQuestionIds.has(key)))
                        },
                        layer3_domainPack: {
                          topic: aiTopic,
                          answers: Object.fromEntries(Object.entries(intentAnswers).filter(([key]) => !purposeQuestionIds.has(key) && !coreQuestionIds.has(key)))
                        }
                      }, null, 2)}</pre>
                      <div className="grid grid-cols-2 gap-2 border-t border-slate-700 p-3 text-[10px] text-slate-400">
                        <div className="flex justify-between rounded-lg bg-slate-800 px-2 py-2"><span>Active step</span><strong className="text-slate-100">{intentWizardStep} / 4</strong></div>
                        <div className="flex justify-between rounded-lg bg-slate-800 px-2 py-2"><span>Domain</span><strong className="text-slate-100">{intentResult?.domain || "Pending"}</strong></div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                      <p className="text-sm font-semibold text-violet-950">What happens next?</p>
                      <p className="mt-1 text-xs leading-5 text-violet-900">BuddyForStudy will turn these choices into a structured learning roadmap, then curate relevant learning resources for its modules.</p>
                    </div>
                  </aside>
                </div>
              ) : (

                <>
              <div>
                <label htmlFor="ai-topic" className="mb-1.5 block text-sm font-semibold text-slate-800">
                  What do you want to learn or achieve?
                </label>
                <input
                  id="ai-topic"
                  autoFocus
                  maxLength={200}
                  value={aiTopic}
                  onChange={(event) => setAiTopic(event.target.value)}
                  placeholder="e.g. data analytics, conversational Spanish, nutrition, project management…"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void generateAiRoadmap();
                    }
                  }}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
                <p className="mt-1 text-xs text-slate-500">A subject, skill, question, exam, hobby, or real-world outcome all work.</p>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-800">What is your main goal?</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {AI_GOAL_OPTIONS.map((option) => {
                    const selected = aiGoal === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setAiGoal(option.value)}
                        className={`min-h-[76px] rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600/30 ${
                          selected
                            ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                        <span className="mt-1 block text-xs leading-4 text-slate-600">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
                <label htmlFor="ai-custom-goal" className="mt-3 block text-xs font-semibold text-slate-700">
                  Anything specific you want the plan to help you do? <span className="font-normal text-slate-500">Optional</span>
                </label>
                <textarea
                  id="ai-custom-goal"
                  rows={2}
                  maxLength={500}
                  value={aiCustomGoal}
                  onChange={(event) => setAiCustomGoal(event.target.value)}
                  placeholder="Describe your target, deadline, context, or what success looks like…"
                  className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor="ai-level" className="block text-sm font-semibold text-slate-800">
                  Where are you starting from?
                  <select
                    id="ai-level"
                    value={aiLevel}
                    onChange={(event) => setAiLevel(event.target.value as CourseLevel)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                  >
                    <option value="Beginner">New to this</option>
                    <option value="Intermediate">Know the basics</option>
                    <option value="Advanced">Experienced — go deeper</option>
                  </select>
                </label>
                <label htmlFor="ai-study-time" className="block text-sm font-semibold text-slate-800">
                  Time you can spend each day
                  <select
                    id="ai-study-time"
                    value={aiStudyTime}
                    onChange={(event) => setAiStudyTime(Number(event.target.value))}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                    <option value={240}>4 hours</option>
                    <option value={360}>6 hours</option>
                    <option value={480}>8 hours</option>
                    <option value={720}>12 hours</option>
                  </select>
                </label>
              </div>

              <div>
                <label htmlFor="ai-prior-knowledge" className="block text-sm font-semibold text-slate-800">
                  What do you already know or have experience with? <span className="font-normal text-slate-500">Optional</span>
                </label>
                <textarea
                  id="ai-prior-knowledge"
                  rows={2}
                  maxLength={1200}
                  value={aiKnownSkills}
                  onChange={(event) => setAiKnownSkills(event.target.value)}
                  placeholder="Subjects, concepts, languages, tools, experience, prerequisites—or leave blank to start from scratch."
                  className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
              </div>

              {aiError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                  {aiError}
                </div>
              )}
                </>

              )}
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <button
                type="button"
                onClick={() => {
                  if (INTENT_V2 && intentResult?.valid && intentWizardStep > 1) {
                    setIntentWizardStep((step) => Math.max(1, step - 1));
                    return;
                  }
                  setAiOpen(false);
                }}
                disabled={aiLoading}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                {INTENT_V2 && intentResult?.valid && intentWizardStep > 1 ? "Back" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!INTENT_V2) {
                    void generateAiRoadmap();
                    return;
                  }
                  if (!intentResult || !intentResult.valid) {
                    void startIntentFlow();
                    return;
                  }
                  if (intentWizardStep < 4) {
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
                    {intentLoading ? "Analyzing your learning goal…" : "Generating your roadmap…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {!INTENT_V2 ? "Build personalized plan" : !intentResult || !intentResult.valid ? "Analyze topic and continue" : intentWizardStep === 4 ? "Generate roadmap" : intentWizardStep === 3 ? "Review roadmap" : "Continue"}
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
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-white/10 px-3 py-1.5">{aiRoadmap.course.level || 'Beginner'}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5">{aiRoadmap.course.modules?.length || 0} modules</span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5">
                    {(aiRoadmap.course.modules || []).reduce((sum, module) => sum + (module.lessons || []).length, 0)} lessons and assessments
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5">{aiRoadmap.course.duration || 'Self-paced'}</span>
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

          {aiRoadmap.personalization && (
            <div className="m-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:m-7">
              <p className="text-sm font-extrabold text-slate-900">Why this course was generated</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">{aiRoadmap.personalization.studyTimeMinutesPerDay} min/day</span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Goal: {aiRoadmap.personalization.goals?.[0] || 'Balanced learning'}</span>
                {(aiRoadmap.personalization.skippedSkills || []).map((skill: string) => <span key={skill} className="rounded-full bg-green-50 px-3 py-1.5 font-bold text-green-700">Skipped: {skill}</span>)}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">{aiRoadmap.personalization.rationale?.join(' ')}</p>
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
              {(aiRoadmap.course.modules || []).map((module, moduleIndex: number) => {
                const expanded = expandedAiModules.has(moduleIndex);
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
              })}
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
