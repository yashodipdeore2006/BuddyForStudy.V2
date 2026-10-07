import { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, CourseLevel } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { Search, BookOpen, Filter, X, Sparkles, Loader2 } from 'lucide-react';
import StructuredPlaylists from '@/components/StructuredPlaylists';

const levels: CourseLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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
      try {
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (selectedLevel !== 'all') params.set('level', selectedLevel);
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        const data = await apiFetch(`/api/courses?${params.toString()}`);
        const rows = data.courses || data.items || [];
        setCourses(rows.map((c:any)=>({ ...c, id:c._id, learning_outcomes:c.learningOutcomes||[], is_published:c.isPublished, created_at:c.createdAt, updated_at:c.updatedAt })));
      } catch { setCourses([]); }
      finally { setLoading(false); }
    }
    fetchCourses();
  }, [selectedLevel, selectedCategory, searchQuery]);

  const categories = useMemo(() => {
    const cats = new Set(courses.map((c) => c.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [courses]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (selectedLevel !== 'all' && course.level !== selectedLevel) return false;
      if (selectedCategory !== 'all' && course.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          course.title.toLowerCase().includes(q) ||
          course.description.toLowerCase().includes(q) ||
          course.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [courses, searchQuery, selectedLevel, selectedCategory]);

  const hasFilters = selectedLevel !== 'all' || selectedCategory !== 'all' || searchQuery.trim();

  const saveAiRoadmap = async () => {
    if (!aiRoadmap?.course) return;
    setSavingRoadmap(true); setAiError(null);
    try {
      const data = await apiFetch('/api/roadmaps', { method: 'POST', body: JSON.stringify(aiRoadmap) });
      setSavedRoadmapId(data.roadmap?._id || data.roadmap?.id || null);
    } catch (err) { setAiError(err instanceof Error ? err.message : 'Unable to save roadmap'); }
    finally { setSavingRoadmap(false); }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedLevel('all');
    setSelectedCategory('all');
    setAiRoadmap(null);
    setAiError(null);
  };

  const generateAiRoadmap = async () => {
    const topic = searchQuery.trim();
    if (!topic) return;
    if (!session) { setAiError('Sign in to generate a personalized AI roadmap.'); return; }
    setAiLoading(true); setAiError(null);
    try {
      const data = await apiFetch('/api/ai/roadmap', { method: 'POST', body: JSON.stringify({ topic, level: selectedLevel === 'all' ? 'Beginner' : selectedLevel, goals: ['Become job-ready with practical projects'] }) });
      setAiRoadmap(data);
    } catch (err) { setAiError(err instanceof Error ? err.message : 'AI roadmap generation failed'); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Course Catalog"
        subtitle="Discover courses and start your learning journey"
      />

      {/* Search */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
            placeholder="Search courses..."
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as CourseLevel | 'all')}
            className="input-field w-auto"
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
            className="input-field w-auto"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {searchQuery.trim().length >= 2 && <StructuredPlaylists query={searchQuery} />}

      {searchQuery.trim().length >= 2 && (
        <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-900"><Sparkles className="h-4 w-4 text-blue-600" /> Can't find exactly what you need?</div>
              <p className="mt-1 text-sm text-slate-600">Build a prerequisite-ordered roadmap with practical projects and YouTube learning resources selected by BuddyForStudy.</p>
            </div>
            <button onClick={generateAiRoadmap} disabled={aiLoading} className="btn-primary whitespace-nowrap">
              {aiLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Building...</> : <><Sparkles className="h-4 w-4" /> Build Roadmap</>}
            </button>
          </div>
          {aiError && <p className="mt-3 text-sm text-red-600">{aiError}</p>}
        </div>
      )}

      {aiRoadmap?.course && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Personalized Learning Roadmap</p><h2 className="mt-1 text-xl font-bold text-slate-900">{aiRoadmap.canonicalTopic || aiRoadmap.course.title}</h2><p className="mt-1 text-sm text-slate-500">{aiRoadmap.course.description}</p></div>
            <div className="flex items-center gap-3"><button onClick={saveAiRoadmap} disabled={savingRoadmap || !!savedRoadmapId} className="btn-primary">{savingRoadmap ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : savedRoadmapId ? 'Saved to My Learning' : 'Save Roadmap'}</button><button onClick={()=>setAiRoadmap(null)} className="text-sm text-slate-400 hover:text-slate-700">Close</button></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(aiRoadmap.skillGraph || []).map((skill:any)=><div key={skill.id} className="rounded-lg bg-slate-50 p-3"><p className="font-medium text-slate-800">{skill.name}</p><p className="text-xs text-slate-500">{skill.category} · {skill.importance}</p></div>)}
          </div>
          <div className="mt-6 space-y-3">
            {aiRoadmap.course.modules.map((m:any)=><div key={m.title} className="rounded-lg border border-slate-200 p-4"><p className="font-semibold text-slate-900">{m.order}. {m.title}</p><p className="mt-1 text-xs text-slate-500">{m.lessons?.length || 0} learning activities</p></div>)}
          </div>
        </div>
      )}

      {/* Active filters */}
      {hasFilters && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-slate-500">
            Showing {filteredCourses.length} of {courses.length} courses
          </span>
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        </div>
      )}

      {/* Course Grid */}
      <div className="mt-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          </div>
        ) : filteredCourses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-8 w-8" />}
            title={hasFilters ? 'No courses match your filters' : 'No courses available yet'}
            description={
              hasFilters
                ? 'Try adjusting your search or filters to find what you\'re looking for.'
                : 'Check back soon — new courses are being added regularly.'
            }
            action={
              hasFilters ? (
                <button onClick={clearFilters} className="btn-primary">
                  Clear Filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
