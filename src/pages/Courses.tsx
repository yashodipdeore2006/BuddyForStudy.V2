import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Course, CourseLevel } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { Search, BookOpen, Filter, X } from 'lucide-react';
import { classNames } from '@/lib/utils';

const levels: CourseLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    async function fetchCourses() {
      const { data } = await supabase
        .from('courses')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      setCourses((data as Course[]) || []);
      setLoading(false);
    }
    fetchCourses();
  }, []);

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

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedLevel('all');
    setSelectedCategory('all');
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
