import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, CourseLevel } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { Search, BookOpen, Filter, X, Sparkles, Loader2, TrendingUp, Play, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

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
  const [courses, setCourses] = useState<Course[]>([]);
  const [popularCourses, setPopularCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [popularLoading, setPopularLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { session } = useAuth();
  const navigate = useNavigate();
  const [aiStarting, setAiStarting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRoadmap, setAiRoadmap] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState('Get job-ready');
  const [aiStudyTime, setAiStudyTime] = useState(60);
  const [aiKnownSkills, setAiKnownSkills] = useState('');

  useEffect(() => {
    async function fetchCourses() {
      setLoading(true);
      try {
        setCatalogError("");
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (selectedLevel !== 'all') params.set('level', selectedLevel);
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        if (catalogQuery.trim()) params.set('q', catalogQuery.trim());

        const data = await apiFetch(`/api/courses?${params.toString()}`);
        const rows = data.courses || data.items || [];
        setCourses(rows.map(mapCourse));
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
    async function fetchPopularCourses() {
      setPopularLoading(true);
      try {
        const params = new URLSearchParams({ page: '1', limit: '6', sort: 'popular' });
        if (selectedLevel !== 'all') params.set('level', selectedLevel);
        if (selectedCategory !== 'all') params.set('category', selectedCategory);

        const data = await apiFetch(`/api/courses?${params.toString()}`);
        const rows = data.courses || data.items || [];
        setPopularCourses(rows.map(mapCourse));
      } catch {
        setPopularCourses([]);
      } finally {
        setPopularLoading(false);
      }
    }

    fetchPopularCourses();
  }, [selectedLevel, selectedCategory]);

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
      });
      setAiRoadmap(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI roadmap generation failed');
    } finally {
      setAiLoading(false);
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
      <section className="relative overflow-hidden rounded-[32px] bg-slate-950 px-5 py-7 text-white shadow-[0_24px_70px_rgba(13,18,32,.14)] sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-200">
              <Sparkles className="h-3.5 w-3.5" />
              AI-powered learning discovery
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-extrabold tracking-[-.03em] sm:text-4xl lg:text-5xl">
              Find the right course. Build the right path.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Explore the catalog, discover learner-favorite courses, or let AI turn a topic into a prerequisite-ordered learning roadmap.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Discovery modes</span>
              <Sparkles className="h-4 w-4 text-blue-300" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
              <div className="rounded-xl bg-white/10 px-3 py-2.5 text-white">Course catalog</div>
              <div className="rounded-xl bg-blue-500/20 px-3 py-2.5 text-blue-100">Build with AI</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative mt-8 rounded-2xl border border-white/10 bg-white p-2 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl bg-slate-50 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
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
              className="h-12 justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
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
          <div className="relative overflow-hidden bg-slate-950 px-5 py-7 text-white sm:px-7 lg:px-9">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-300">AI Course Ready</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {aiRoadmap.course.title || aiRoadmap.canonicalTopic}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  {aiRoadmap.course.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-white/10 px-3 py-1.5">
                    {aiRoadmap.course.modules?.length || 0} modules
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5">
                    {aiRoadmap.course.duration || 'Self-paced'}
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-emerald-200">
                    Video lessons included
                  </span>
                  <span className="rounded-full bg-purple-500/15 px-3 py-1.5 text-purple-200">
                    Projects included
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {aiRoadmap.course?._id && (
                  <Link
                    to={`/courses/${aiRoadmap.course._id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Course
                  </Link>
                )}

                <button
                  type="button"
                  disabled={aiStarting || !aiRoadmap.course?._id}
                  onClick={async () => {
                    const courseId = aiRoadmap.course?._id || aiRoadmap.course?.id;
                    if (!courseId) return;

                    setAiStarting(true);
                    setAiError(null);

                    try {
                      try {
                        await apiFetch(`/api/enrollments/course/${courseId}`);
                      } catch {
                        await apiFetch(`/api/enrollments/${courseId}`, { method: 'POST' });
                      }

                      navigate(`/learn/${courseId}`);
                    } catch (err) {
                      setAiError(err instanceof Error ? err.message : 'Unable to start the AI course');
                    } finally {
                      setAiStarting(false);
                    }
                  }}
                  className="btn-primary justify-center"
                >
                  {aiStarting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Opening course...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Learning
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAiRoadmap(null)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          {aiRoadmap.personalization && (
            <div className="mx-5 mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:mx-7">
              <p className="text-sm font-extrabold text-slate-900">Personalized for you</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">
                  {aiRoadmap.personalization.studyTimeMinutesPerDay} min/day
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">
                  Goal: {aiRoadmap.personalization.goals?.[0] || 'Balanced learning'}
                </span>
                {(aiRoadmap.personalization.skippedSkills || []).map((skill: string) => (
                  <span key={skill} className="rounded-full bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700">
                    Known: {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="bfs-eyebrow">Actual course content</p>
                <h3 className="mt-2 text-xl font-extrabold text-slate-950">Modules, video lessons and projects</h3>
              </div>
              <p className="text-xs text-slate-500">The same content opens in the unified Course Player.</p>
            </div>

            <div className="mt-5 space-y-3">
              {(aiRoadmap.course.modules || []).map((module: any, moduleIndex: number) => {
                const tutorialLessons = (module.lessons || []).filter((lesson: any) => lesson.type === 'tutorial');
                const projectLessons = (module.lessons || []).filter((lesson: any) => lesson.type === 'project');
                const videoLessons = tutorialLessons.filter((lesson: any) => lesson.tutorial?.videos?.length);

                return (
                  <div key={module.title || moduleIndex} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-extrabold text-blue-700">
                          {module.order || moduleIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900">{module.title}</h4>
                          <p className="mt-1 text-xs text-slate-500">{module.description}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-2 text-[11px] font-bold">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                          {videoLessons.length} video
                        </span>
                        <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">
                          {projectLessons.length} project
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {(module.lessons || []).map((lesson: any, lessonIndex: number) => {
                        const video = lesson.tutorial?.videos?.[0];

                        return (
                          <div key={lesson.id || lesson._id || lessonIndex} className="p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                              {video?.thumbnail ? (
                                <img
                                  src={video.thumbnail}
                                  alt=""
                                  className="aspect-video w-full shrink-0 rounded-xl object-cover sm:h-20 sm:w-32"
                                />
                              ) : (
                                <div className="flex aspect-video w-full shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 sm:h-20 sm:w-32">
                                  {lesson.type === 'project' ? (
                                    <CheckCircle2 className="h-6 w-6 text-purple-400" />
                                  ) : (
                                    <Play className="h-6 w-6" />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">
                                    {lesson.type}
                                  </span>
                                  {video && (
                                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                      Video ready
                                    </span>
                                  )}
                                </div>

                                <p className="mt-2 font-semibold text-slate-900">{lesson.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                  {lesson.description}
                                </p>

                                {video && (
                                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                                    <span>{video.channelTitle || 'YouTube'}</span>
                                    <a
                                      href={video.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-semibold text-blue-600 hover:text-blue-700"
                                    >
                                      Open video
                                    </a>
                                  </div>
                                )}

                                {lesson.tutorial?.videos?.length > 1 && (
                                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                                    + {lesson.tutorial.videos.length - 1} additional resource{lesson.tutorial.videos.length - 1 === 1 ? '' : 's'}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white" />
              ))}
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="No matching courses"
                description="Try another search term or use Build with AI to create a personalized learning path."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-blue-600">
                <TrendingUp className="h-4 w-4" />
                Popular with learners
              </div>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Most Enrolled Courses</h2>
              <p className="mt-1 text-sm text-slate-500">Courses with the highest active and completed enrollments.</p>
            </div>
          </div>

          {popularLoading ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white" />
              ))}
            </div>
          ) : popularCourses.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="No popular courses yet"
                description="Published courses will appear here as learners enroll."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {popularCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
