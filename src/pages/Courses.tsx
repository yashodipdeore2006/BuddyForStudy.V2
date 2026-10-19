import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, CourseLevel } from '@/types';
import CourseCard from '@/components/CourseCard';
import { CourseGridSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { Search, BookOpen, Filter, X, Sparkles, Loader2, ChevronDown, ChevronRight, Play, CircleHelp, FolderKanban, GraduationCap, ExternalLink } from 'lucide-react';
import YouTubeSearchFallback from '@/components/YouTubeSearchFallback';

const levels: CourseLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

function mapCourse(raw: any): Course {
  return {
    id: String(raw._id ?? raw.id),
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    category: raw.category,
    level: raw.level,
    duration: String(raw.duration ?? ''),
    thumbnail: raw.thumbnail ?? null,
    learning_outcomes: raw.learningOutcomes ?? [],
    modules: raw.modules ?? [],
    is_published: raw.isPublished ?? true,
    enrollment_count: raw.enrollmentCount,
    pricing: raw.pricing,
    created_by: raw.createdBy ?? null,
    created_at: raw.createdAt ?? '',
    updated_at: raw.updatedAt ?? '',
  };
}

export default function Courses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [youtubeDiscovery, setYoutubeDiscovery] = useState<any>(null);
  const [youtubePlaylistsLoading, setYoutubePlaylistsLoading] = useState(false);
  const [youtubePlaylistError, setYoutubePlaylistError] = useState("");
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { session } = useAuth();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRoadmap, setAiRoadmap] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState('Get job-ready');
  const [aiStudyTime, setAiStudyTime] = useState(60);
  const [aiKnownSkills, setAiKnownSkills] = useState('');
  const [aiUsage, setAiUsage] = useState<any>(null);
  const [aiEnrolling, setAiEnrolling] = useState(false);
  const [aiEnrollError, setAiEnrollError] = useState<string | null>(null);
  const [expandedAiModules, setExpandedAiModules] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    async function fetchCourses() {
      setLoading(true);
      try {
        setCatalogError("");
        setYoutubeDiscovery(null);
        setYoutubePlaylistsLoading(false);
        setYoutubePlaylistError("");
        const allRows: any[] = [];
        let page = 1;
        let batch: any[] = [];
        let lastResponse: any = null;
        do {
          const params = new URLSearchParams({ page: String(page), limit: '50' });
          if (selectedLevel !== 'all') params.set('level', selectedLevel);
          if (selectedCategory !== 'all') params.set('category', selectedCategory);
          if (catalogQuery.trim()) params.set('q', catalogQuery.trim());
          lastResponse = await apiFetch(`/api/courses?${params.toString()}`, { showFeatureUpgrade: Boolean(catalogQuery.trim()) });
          batch = lastResponse.courses || lastResponse.items || [];
          allRows.push(...batch);
          page += 1;
        } while (batch.length === 50 && page <= 200);
        setCourses(allRows.map(mapCourse));

        if (
          lastResponse?.discovery?.mode === 'youtube_fallback' ||
          lastResponse?.discovery?.mode === 'youtube_supplementary'
        ) {
          const discovery = lastResponse.discovery;
          setYoutubeDiscovery(discovery);
          setYoutubePlaylistsLoading(true);
          setYoutubePlaylistError("");

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
  }, [selectedLevel, selectedCategory, catalogQuery]);

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
        .filter((item: any) => ['active', 'completed'].includes(String(item.status || '').toLowerCase()))
        .map((item: any) => String(item.course?._id ?? item.course?.id ?? item.course ?? item.course_id ?? item.courseId ?? ''))
        .filter(Boolean);
      const savedIds = (savedData.savedCourses || [])
        .map((item: any) => String(item.course?._id ?? item.course?.id ?? item.course ?? item.courseId ?? ''))
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

  const hasFilters = selectedLevel !== 'all' || selectedCategory !== 'all' || catalogQuery.trim().length > 0;

  const clearFilters = () => {
    setSearchQuery('');
    setCatalogQuery('');
    setSelectedLevel('all');
    setSelectedCategory('all');
    setAiRoadmap(null);
    setAiError(null);
  };

  useEffect(() => {
    if (!aiOpen || !session) {
      setAiUsage(null);
      return;
    }

    apiFetch('/api/ai/usage')
      .then((data) => setAiUsage(data))
      .catch(() => setAiUsage(null));
  }, [aiOpen, session]);

  const generateAiRoadmap = async () => {
    const topic = searchQuery.trim();
    if (!topic) {
      setAiError('Enter a course or topic first, then choose Build with AI.');
      return;
    }
    if (!session) {
      setAiError('Sign in to generate a personalized AI roadmap.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const data = await apiFetch('/api/ai/roadmap', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          level: selectedLevel === 'all' ? 'Beginner' : selectedLevel,
          goals: [aiGoal],
          studyTimeMinutesPerDay: aiStudyTime,
          knownSkills: aiKnownSkills.split(',').map((item) => item.trim()).filter(Boolean),
        }),
        showFeatureUpgrade: true,
      });
      setAiRoadmap(data);
      setExpandedAiModules(new Set([0]));
      setAiEnrollError(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI roadmap generation failed');
    } finally {
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
      setAiRoadmap((current: any) => current ? {
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
      navigate(`/learn/${courseId}`);
    } catch (err) {
      try {
        const existing = await apiFetch(`/api/enrollments/course/${courseId}`);
        if (existing?.enrollment?.status === 'active' || existing?.enrollment?.status === 'completed') {
          navigate(`/learn/${courseId}`);
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
    <div className="bfs-shell py-8 sm:py-10">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white px-5 py-7 text-slate-950 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        
        

        <div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI-powered learning discovery
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-medium tracking-[-.03em] sm:text-4xl lg:text-5xl">
              Find the right course. Build the right path.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Explore the catalog, discover learner-favorite courses, or let AI turn a topic into a prerequisite-ordered learning roadmap.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[.14em] text-slate-600">Discovery modes</span>
              <Sparkles className="h-4 w-4 text-slate-700" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
              <div className="rounded-full bg-slate-950 px-3 py-2.5 text-white">Course catalog</div>
              <div className="rounded-full border border-slate-300 bg-white px-3 py-2.5 text-slate-950">Build with AI</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative mt-8 rounded-full border border-slate-200 bg-white p-2">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-full border-0 bg-slate-50 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                placeholder="Search for MERN, Python, Data Science, Java..."
                aria-label="Search courses"
              />
            </div>

            <button type="submit" className="btn-primary h-12 justify-center lg:min-w-28">
              <Search className="h-4 w-4" />
              Search
            </button>

            <button
              type="button"
              onClick={() => { setAiOpen(true); setAiError(null); }}
              disabled={aiLoading}
              className="btn-secondary h-12 justify-center px-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Build with AI
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
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

      {aiOpen && (
        <section className="mt-5 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-purple-50 shadow-sm">
          {aiUsage && (
            <div className="border-b border-blue-100/80 bg-white/70 px-5 py-4 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">{aiUsage.plan?.name || "Current"} plan AI allowance</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {aiUsage.features?.aiCourseBuilder ? "AI Course Builder available" : "AI Course Builder unavailable"}
                    {" · "}
                    {aiUsage.features?.personalizedRoadmaps ? "personalized" : "standard"}
                    {" · "}
                    {aiUsage.features?.projectBasedLearning ? "projects included" : "projects excluded"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">Builds/month: {aiUsage.plan?.limits?.ai_course_builds_per_month ?? "—"}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Quizzes/month: {aiUsage.plan?.limits?.ai_quiz_generations_per_month ?? "—"}</span>
                </div>
              </div>
            </div>
          )}

          <div className="border-b border-blue-100/80 px-5 py-5 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">AI Learning Architect</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Build a roadmap around your goal</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Tell AI what you want to achieve, how much time you have, and what you already know. Your existing personalization flow stays exactly the same.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                aria-label="Close AI builder"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:p-7 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-600">
              <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-[11px] text-blue-700">1</span> Goal</span>
              <select value={aiGoal} onChange={(e) => setAiGoal(e.target.value)} className="input-field mt-2 h-11 w-full text-sm">
                <option>Get job-ready</option>
                <option>Build real projects</option>
                <option>Prepare for interviews</option>
                <option>Learn for exams</option>
                <option>Master the fundamentals</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-600">
              <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-[11px] text-blue-700">2</span> Study time</span>
              <select value={aiStudyTime} onChange={(e) => setAiStudyTime(Number(e.target.value))} className="input-field mt-2 h-11 w-full text-sm">
                <option value={30}>30 minutes/day</option>
                <option value={60}>1 hour/day</option>
                <option value={90}>1.5 hours/day</option>
                <option value={120}>2 hours/day</option>
                <option value={180}>3 hours/day</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-600">
              <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-[11px] text-blue-700">3</span> Known skills</span>
              <input value={aiKnownSkills} onChange={(e) => setAiKnownSkills(e.target.value)} className="input-field mt-2 h-11 w-full text-sm" placeholder="HTML, CSS, JavaScript" />
            </label>
          </div>

          <div className="flex flex-col gap-4 border-t border-blue-100/80 bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Current topic</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">{searchQuery.trim() || 'Enter a topic in the search box above'}</p>
            </div>

            <button type="button" onClick={generateAiRoadmap} disabled={aiLoading} className="btn-primary justify-center">
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building your path...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Build Personalized Roadmap
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {aiError && (
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
                    {(aiRoadmap.course.modules || []).reduce((sum: number, module: any) => sum + (module.lessons || []).length, 0)} lessons and assessments
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5">{aiRoadmap.course.duration || 'Self-paced'}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {aiRoadmap.course.isPublished ? (
                  <button type="button" onClick={() => navigate(`/courses/${String(aiRoadmap.course._id ?? aiRoadmap.course.id)}`)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-100 transition hover:bg-white/10">
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
              {(aiRoadmap.course.modules || []).map((module: any, moduleIndex: number) => {
                const expanded = expandedAiModules.has(moduleIndex);
                const lessons = module.lessons || [];
                const tutorialCount = lessons.filter((lesson: any) => lesson.type === 'tutorial').length;
                const quizCount = lessons.filter((lesson: any) => lesson.type === 'quiz').length;
                const projectCount = lessons.filter((lesson: any) => lesson.type === 'project').length;
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
                        {lessons.map((lesson: any, lessonIndex: number) => {
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
                                    {videos.slice(0, 3).map((video: any) => <a key={video.videoId || video.url || video.title} href={video.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-medium text-blue-700 hover:underline"><Play className="h-3 w-3 flex-shrink-0" /><span className="line-clamp-2">{video.title || 'Open tutorial video'}</span></a>)}
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
            <div className="mt-5 max-h-[72vh] overflow-y-auto rounded-2xl pr-2 lg:max-h-[74vh]">
              <CourseGridSkeleton count={6} />
            </div>
          ) : (
            <div className="mt-5 max-h-[72vh] overflow-y-auto rounded-2xl pr-2 lg:max-h-[74vh]">
              {filteredCourses.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCourses.map((course) => (
                    <CourseCard key={course.id} course={course} showActions initiallySaved={savedCourseIds.has(course.id)} initiallyEnrolled={enrolledCourseIds.has(course.id)} />
                  ))}
                </div>
              )}

              {youtubeDiscovery && (
                <YouTubeSearchFallback
                  query={youtubeDiscovery.query}
                  courses={youtubeDiscovery.courseRecommendations || []}
                  playlists={youtubeDiscovery.playlists || []}
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
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => <div key={item} className="h-[420px] animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
            </div>
          ) : catalogError ? (
            <div role="alert" className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">{catalogError}</div>
          ) : filteredCourses.length === 0 ? (
            <div className="mt-5"><EmptyState icon={<BookOpen className="h-8 w-8" />} title="No courses available" description="Published courses will appear here. Try changing your filters or search." /></div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredCourses.map((course) => <CourseCard key={course.id} course={course} showActions />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
