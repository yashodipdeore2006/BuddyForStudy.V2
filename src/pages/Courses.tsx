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
          goals: ['Become job-ready with practical projects'],
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Courses"
        subtitle="Search the catalog, explore learner-favorite courses, or build a personalized path with AI."
      />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-col gap-2 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field h-11 w-full pl-10"
              placeholder="Search for a course or topic..."
              aria-label="Search courses"
            />
          </div>
          <button type="submit" className="btn-primary h-11 justify-center whitespace-nowrap lg:min-w-28">
            <Search className="h-4 w-4" />
            Search
          </button>
          <button
            type="button"
            onClick={generateAiRoadmap}
            disabled={aiLoading}
            className="btn-secondary h-11 justify-center whitespace-nowrap lg:min-w-36"
          >
            {aiLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Build with AI
              </>
            )}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as CourseLevel | 'all')}
            className="input-field h-9 w-auto py-1 text-sm"
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
            className="input-field h-9 w-auto py-1 text-sm"
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
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {aiError && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {aiError}
        </div>
      )}

      {playlistQuery.trim().length >= 2 && <StructuredPlaylists query={playlistQuery} />}

      {aiRoadmap?.course && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Personalized Learning Roadmap
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {aiRoadmap.canonicalTopic || aiRoadmap.course.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{aiRoadmap.course.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveAiRoadmap}
                disabled={savingRoadmap || !!savedRoadmapId}
                className="btn-primary"
              >
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
              <button
                onClick={() => setAiRoadmap(null)}
                className="text-sm text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(aiRoadmap.skillGraph || []).map((skill: any) => (
              <div key={skill.id} className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-800">{skill.name}</p>
                <p className="text-xs text-slate-500">
                  {skill.category} · {skill.importance}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {aiRoadmap.course.modules.map((module: any) => (
              <div key={module.title} className="rounded-lg border border-slate-200 p-4">
                <p className="font-semibold text-slate-900">
                  {module.order}. {module.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {module.lessons?.length || 0} learning activities
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {catalogQuery.trim() ? (
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-600">Search results</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Courses for “{catalogQuery}”
              </h2>
            </div>
            <span className="text-sm text-slate-500">
              {filteredCourses.length} course{filteredCourses.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            </div>
          ) : filteredCourses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="No matching courses"
              description="Try another search term or use Build with AI to create a personalized learning path."
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                <TrendingUp className="h-4 w-4" />
                Popular with learners
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Most Enrolled Courses
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Courses with the highest active and completed enrollments.
              </p>
            </div>
          </div>

          {popularLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            </div>
          ) : popularCourses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="No popular courses yet"
              description="Published courses will appear here as learners enroll."
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
