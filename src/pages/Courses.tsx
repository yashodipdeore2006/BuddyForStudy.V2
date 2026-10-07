import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, CourseLevel } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { Search, BookOpen, Filter, X, Sparkles, Loader2, TrendingUp } from 'lucide-react';
import StructuredPlaylists from '@/components/StructuredPlaylists';

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
  const [popularLoading, setPopularLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [playlistQuery, setPlaylistQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { session } = useAuth();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRoadmap, setAiRoadmap] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savingRoadmap, setSavingRoadmap] = useState(false);
  const [savedRoadmapId, setSavedRoadmapId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState('Get job-ready');
  const [aiStudyTime, setAiStudyTime] = useState(60);
  const [aiKnownSkills, setAiKnownSkills] = useState('');

  useEffect(() => {
    async function fetchCourses() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (selectedLevel !== 'all') params.set('level', selectedLevel);
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        if (catalogQuery.trim()) params.set('q', catalogQuery.trim());

        const data = await apiFetch(`/api/courses?${params.toString()}`);
        const rows = data.courses || data.items || [];
        setCourses(rows.map(mapCourse));
      } catch {
        setCourses([]);
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

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (selectedLevel !== 'all' && course.level !== selectedLevel) return false;
      if (selectedCategory !== 'all' && course.category !== selectedCategory) return false;
      if (catalogQuery.trim()) {
        const q = catalogQuery.toLowerCase();
        return (
          course.title.toLowerCase().includes(q) ||
          course.description.toLowerCase().includes(q) ||
          course.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [courses, catalogQuery, selectedLevel, selectedCategory]);

  const hasFilters = selectedLevel !== 'all' || selectedCategory !== 'all' || catalogQuery.trim().length > 0;

  const clearFilters = () => {
    setSearchQuery('');
    setCatalogQuery('');
    setPlaylistQuery('');
    setSelectedLevel('all');
    setSelectedCategory('all');
    setAiRoadmap(null);
    setAiError(null);
    setSavedRoadmapId(null);
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

  const saveAiRoadmap = async () => {
    if (!aiRoadmap?.course) return;
    setSavingRoadmap(true);
    setAiError(null);
    try {
      const data = await apiFetch('/api/roadmaps', {
        method: 'POST',
        body: JSON.stringify(aiRoadmap),
      });
      setSavedRoadmapId(data.roadmap?._id || data.roadmap?.id || null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to save roadmap');
    } finally {
      setSavingRoadmap(false);
    }
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    setCatalogQuery(query);
    setPlaylistQuery(query);
    setAiRoadmap(null);
    setAiError(null);
    setSavedRoadmapId(null);
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

      {playlistQuery.trim().length >= 2 && <StructuredPlaylists query={playlistQuery} />}

      {aiRoadmap?.course && (
        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-950 px-5 py-6 text-white sm:px-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-300">Personalized Learning Roadmap</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight">{aiRoadmap.canonicalTopic || aiRoadmap.course.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{aiRoadmap.course.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={saveAiRoadmap} disabled={savingRoadmap || !!savedRoadmapId} className="btn-primary">
                  {savingRoadmap ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : savedRoadmapId ? (
                    'Saved to My Learning'
                  ) : (
                    'Save Roadmap'
                  )}
                </button>
                <button onClick={() => setAiRoadmap(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white">
                  Close
                </button>
              </div>
            </div>
          </div>

          {aiRoadmap.personalization && (
            <div className="m-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:m-7">
              <p className="text-sm font-extrabold text-slate-900">Why this path was generated</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">{aiRoadmap.personalization.studyTimeMinutesPerDay} min/day</span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Goal: {aiRoadmap.personalization.goals?.[0] || 'Balanced learning'}</span>
                {(aiRoadmap.personalization.skippedSkills || []).map((skill: string) => (
                  <span key={skill} className="rounded-full bg-green-50 px-3 py-1.5 font-bold text-green-700">Skipped: {skill}</span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">{aiRoadmap.personalization.rationale?.join(' ')}</p>
            </div>
          )}

          <div className="grid gap-6 px-5 pb-6 sm:px-7 lg:grid-cols-[.85fr_1.15fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Skill graph</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {(aiRoadmap.skillGraph || []).map((skill: any) => (
                  <div key={skill.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                    <p className="font-bold text-slate-800">{skill.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{skill.category} · {skill.importance}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Curriculum</p>
              <div className="mt-3 space-y-2">
                {aiRoadmap.course.modules.map((module: any) => (
                  <div key={module.title} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-100 hover:shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-extrabold text-blue-700">{module.order}</span>
                      <div>
                        <p className="font-bold text-slate-900">{module.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{module.lessons?.length || 0} learning activities</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
