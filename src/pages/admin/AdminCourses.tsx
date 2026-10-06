import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Course } from '@/types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import {
  BookOpen,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { formatDate, slugify, classNames } from '@/lib/utils';
import { countAllLessons } from '@/lib/courseUtils';

export default function AdminCourses() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Create form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [duration, setDuration] = useState('');

  useEffect(() => {
    fetchCourses();
  }, []);

  async function fetchCourses() {
    const { data } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });
    setCourses((data as Course[]) || []);
    setLoading(false);
  }

  const filteredCourses = courses.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const slug = slugify(title);
      // Ensure unique slug
      let uniqueSlug = slug;
      let suffix = 1;
      while (courses.some((c) => c.slug === uniqueSlug)) {
        uniqueSlug = `${slug}-${suffix}`;
        suffix++;
      }

      const { data, error } = await supabase
        .from('courses')
        .insert({
          title: title.trim(),
          slug: uniqueSlug,
          description: description.trim(),
          category: category.trim() || 'General',
          level,
          duration: duration.trim(),
          learning_outcomes: [],
          modules: [],
          is_published: false,
          created_by: profile?.id,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setShowCreate(false);
        setTitle('');
        setDescription('');
        setCategory('');
        setLevel('Beginner');
        setDuration('');
        navigate(`/admin/courses/${(data as Course).id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create course.';
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleTogglePublish(course: Course) {
    try {
      const { error } = await supabase
        .from('courses')
        .update({
          is_published: !course.is_published,
          updated_at: new Date().toISOString(),
        })
        .eq('id', course.id);

      if (error) throw error;

      setCourses(courses.map((c) => (c.id === course.id ? { ...c, is_published: !c.is_published } : c)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update course.';
      setError(message);
    }
  }

  async function handleDelete(course: Course) {
    if (!confirm(`Are you sure you want to delete "${course.title}"? This will also remove all enrollments and progress for this course.`)) return;

    setDeleting(course.id);
    try {
      const { error } = await supabase.from('courses').delete().eq('id', course.id);
      if (error) throw error;
      setCourses(courses.filter((c) => c.id !== course.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete course.';
      setError(message);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Course Management"
        subtitle={`${courses.length} courses • ${courses.filter((c) => c.is_published).length} published`}
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Course
          </button>
        }
      />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search */}
      <div className="mt-6 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
          placeholder="Search courses..."
        />
      </div>

      {/* Course List */}
      <div className="mt-6">
        {filteredCourses.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title={search ? 'No courses match your search' : 'No courses yet'}
              description={search ? 'Try a different search term' : 'Create your first course to get started.'}
              action={
                !search ? (
                  <button onClick={() => setShowCreate(true)} className="btn-primary">
                    <Plus className="h-4 w-4" />
                    Create Course
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => {
              const lessonCount = countAllLessons(course.modules);
              return (
                <div key={course.id} className="card flex flex-col overflow-hidden">
                  <div className="relative h-32 bg-gradient-to-br from-blue-500 to-blue-700">
                    {course.thumbnail && (
                      <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
                    )}
                    <div className="absolute top-2 right-2">
                      <span className={classNames(
                        'badge',
                        course.is_published ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                      )}>
                        {course.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <span className="text-xs font-medium text-blue-600">{course.category}</span>
                    <h3 className="mt-1 font-semibold text-slate-900 line-clamp-1">{course.title}</h3>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2 flex-1">{course.description}</p>

                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                      <span>{course.modules.length} modules</span>
                      <span>{lessonCount} lessons</span>
                      {course.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {course.duration}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <Link
                        to={`/admin/courses/${course.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <button
                        onClick={() => handleTogglePublish(course)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        {course.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {course.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => handleDelete(course)}
                        disabled={deleting === course.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 ml-auto"
                      >
                        {deleting === course.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Course Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">Create New Course</h2>
            <p className="mt-1 text-sm text-slate-500">Fill in the basic details. You can add modules and lessons after creating.</p>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Course Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                  placeholder="e.g. MERN Stack Development"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field min-h-[80px]"
                  placeholder="Brief course description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="input-field"
                    placeholder="e.g. Web Development"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Level</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as 'Beginner' | 'Intermediate' | 'Advanced')}
                    className="input-field"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Duration</label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="input-field"
                  placeholder="e.g. 12 weeks"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Course'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
