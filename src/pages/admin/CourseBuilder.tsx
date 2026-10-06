import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Course, Module, Lesson, CourseLevel, LessonType } from '@/types';
import {
  generateId,
  countAllLessons,
} from '@/lib/courseUtils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  AlertCircle,
  Check,
  BookOpen,
  ListChecks,
  Eye,
  EyeOff,
  GripVertical,
  X,
} from 'lucide-react';
import { classNames, slugify } from '@/lib/utils';

export default function CourseBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [editingLesson, setEditingLesson] = useState<{ moduleIdx: number; lessonIdx: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'curriculum'>('curriculum');

  // Course metadata editing
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<CourseLevel>('Beginner');
  const [duration, setDuration] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [learningOutcomes, setLearningOutcomes] = useState<string[]>([]);
  const [newOutcome, setNewOutcome] = useState('');

  useEffect(() => {
    async function fetchCourse() {
      if (!courseId) return;
      const { data } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();

      if (data) {
        const c = data as Course;
        setCourse(c);
        setTitle(c.title);
        setDescription(c.description);
        setCategory(c.category);
        setLevel(c.level);
        setDuration(c.duration);
        setThumbnail(c.thumbnail || '');
        setLearningOutcomes(c.learning_outcomes || []);
        if (c.modules.length > 0) {
          setExpandedModules(new Set([c.modules[0].id]));
        }
      }
      setLoading(false);
    }
    fetchCourse();
  }, [courseId]);

  async function saveCourse(updatedModules?: Module[]) {
    if (!course || !courseId) return;
    setSaving(true);
    setError(null);

    try {
      const modulesToSave = updatedModules ?? course.modules;
      const { error } = await supabase
        .from('courses')
        .update({
          title: title.trim(),
          slug: slugify(title),
          description: description.trim(),
          category: category.trim() || 'General',
          level,
          duration: duration.trim(),
          thumbnail: thumbnail.trim() || null,
          learning_outcomes: learningOutcomes,
          modules: modulesToSave as unknown as Record<string, unknown>[],
          updated_at: new Date().toISOString(),
        })
        .eq('id', courseId);

      if (error) throw error;

      setCourse({
        ...course,
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'General',
        level,
        duration: duration.trim(),
        thumbnail: thumbnail.trim() || null,
        learning_outcomes: learningOutcomes,
        modules: modulesToSave,
      });
      setSavedAt(new Date());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save course.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }

  function addModule() {
    if (!course) return;
    const newModule: Module = {
      id: generateId(),
      title: `New Module ${course.modules.length + 1}`,
      description: '',
      order: course.modules.length + 1,
      lessons: [],
    };
    const updated = [...course.modules, newModule];
    setCourse({ ...course, modules: updated });
    setExpandedModules(new Set([...expandedModules, newModule.id]));
    saveCourse(updated);
  }

  function updateModule(moduleIdx: number, updates: Partial<Module>) {
    if (!course) return;
    const updated = course.modules.map((m, i) => (i === moduleIdx ? { ...m, ...updates } : m));
    setCourse({ ...course, modules: updated });
  }

  function deleteModule(moduleIdx: number) {
    if (!course) return;
    if (!confirm('Delete this module and all its lessons?')) return;
    const updated = course.modules.filter((_, i) => i !== moduleIdx).map((m, i) => ({ ...m, order: i + 1 }));
    setCourse({ ...course, modules: updated });
    saveCourse(updated);
  }

  function moveModule(moduleIdx: number, direction: 'up' | 'down') {
    if (!course) return;
    const newIdx = direction === 'up' ? moduleIdx - 1 : moduleIdx + 1;
    if (newIdx < 0 || newIdx >= course.modules.length) return;
    const updated = [...course.modules];
    [updated[moduleIdx], updated[newIdx]] = [updated[newIdx], updated[moduleIdx]];
    updated.forEach((m, i) => (m.order = i + 1));
    setCourse({ ...course, modules: updated });
    saveCourse(updated);
  }

  function addLesson(moduleIdx: number, type: LessonType) {
    if (!course) return;
    const module = course.modules[moduleIdx];
    const newLesson: Lesson = {
      id: generateId(),
      title: `New ${type === 'tutorial' ? 'Tutorial' : 'Project'}`,
      description: '',
      type,
      order: module.lessons.length + 1,
    };
    if (type === 'tutorial') {
      newLesson.tutorial = { content: '' };
    } else {
      newLesson.project = {
        description: '',
        requirements: [],
        instructions: '',
        expectedOutcome: '',
      };
    }
    const updated = course.modules.map((m, i) =>
      i === moduleIdx ? { ...m, lessons: [...m.lessons, newLesson] } : m
    );
    setCourse({ ...course, modules: updated });
    setEditingLesson({ moduleIdx, lessonIdx: module.lessons.length });
  }

  function updateLesson(moduleIdx: number, lessonIdx: number, updates: Partial<Lesson>) {
    if (!course) return;
    const updated = course.modules.map((m, mi) =>
      mi === moduleIdx
        ? {
            ...m,
            lessons: m.lessons.map((l, li) => (li === lessonIdx ? { ...l, ...updates } : l)),
          }
        : m
    );
    setCourse({ ...course, modules: updated });
  }

  function deleteLesson(moduleIdx: number, lessonIdx: number) {
    if (!course) return;
    if (!confirm('Delete this lesson?')) return;
    const updated = course.modules.map((m, mi) =>
      mi === moduleIdx
        ? {
            ...m,
            lessons: m.lessons.filter((_, li) => li !== lessonIdx).map((l, li) => ({ ...l, order: li + 1 })),
          }
        : m
    );
    setCourse({ ...course, modules: updated });
    setEditingLesson(null);
    saveCourse(updated);
  }

  function moveLesson(moduleIdx: number, lessonIdx: number, direction: 'up' | 'down') {
    if (!course) return;
    const module = course.modules[moduleIdx];
    const newIdx = direction === 'up' ? lessonIdx - 1 : lessonIdx + 1;
    if (newIdx < 0 || newIdx >= module.lessons.length) return;
    const updated = course.modules.map((m, mi) => {
      if (mi !== moduleIdx) return m;
      const lessons = [...m.lessons];
      [lessons[lessonIdx], lessons[newIdx]] = [lessons[newIdx], lessons[lessonIdx]];
      lessons.forEach((l, li) => (l.order = li + 1));
      return { ...m, lessons };
    });
    setCourse({ ...course, modules: updated });
    saveCourse(updated);
  }

  function addOutcome() {
    if (!newOutcome.trim()) return;
    setLearningOutcomes([...learningOutcomes, newOutcome.trim()]);
    setNewOutcome('');
  }

  function removeOutcome(idx: number) {
    setLearningOutcomes(learningOutcomes.filter((_, i) => i !== idx));
  }

  async function togglePublish() {
    if (!course || !courseId) return;
    const newPublished = !course.is_published;
    try {
      const { error } = await supabase
        .from('courses')
        .update({
          is_published: newPublished,
          updated_at: new Date().toISOString(),
        })
        .eq('id', courseId);

      if (error) throw error;
      setCourse({ ...course, is_published: newPublished });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle publish state.';
      setError(message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Course Not Found</h1>
        <Link to="/admin/courses" className="btn-primary mt-6">
          Back to Courses
        </Link>
      </div>
    );
  }

  const totalLessons = countAllLessons(course.modules);
  const editingLessonData = editingLesson
    ? course.modules[editingLesson.moduleIdx]?.lessons[editingLesson.lessonIdx]
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/admin/courses"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Courses
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{course.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {course.modules.length} modules • {totalLessons} lessons •{' '}
            <span className={course.is_published ? 'text-green-600 font-medium' : 'text-slate-500'}>
              {course.is_published ? 'Published' : 'Draft'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> Error
            </span>
          )}
          <button
            onClick={togglePublish}
            className={course.is_published ? 'btn-secondary' : 'btn-primary'}
          >
            {course.is_published ? (
              <>
                <EyeOff className="h-4 w-4" />
                Unpublish
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Publish
              </>
            )}
          </button>
          <button onClick={() => saveCourse()} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-200">
        <div className="flex gap-6">
          {(['curriculum', 'details'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={classNames(
                'relative pb-3 text-sm font-medium capitalize transition-colors',
                activeTab === tab ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Curriculum Tab */}
      {activeTab === 'curriculum' && (
        <div className="mt-6">
          {/* Modules */}
          <div className="space-y-4">
            {course.modules.map((module, mIdx) => {
              const isExpanded = expandedModules.has(module.id);
              return (
                <div key={module.id} className="card overflow-hidden">
                  {/* Module Header */}
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 p-4">
                    <button
                      onClick={() => toggleModule(module.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-200"
                    >
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </button>
                    <GripVertical className="h-4 w-4 text-slate-300" />
                    <input
                      type="text"
                      value={module.title}
                      onChange={(e) => updateModule(mIdx, { title: e.target.value })}
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:rounded focus:px-2 focus:py-1 focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-400">{module.lessons.length} lessons</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveModule(mIdx, 'up')}
                        disabled={mIdx === 0}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4 rotate-[-90deg]" />
                      </button>
                      <button
                        onClick={() => moveModule(mIdx, 'down')}
                        disabled={mIdx === course.modules.length - 1}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4 rotate-90" />
                      </button>
                      <button
                        onClick={() => deleteModule(mIdx)}
                        className="rounded p-1 text-red-400 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Module Description */}
                  {isExpanded && (
                    <div className="p-4">
                      <input
                        type="text"
                        value={module.description}
                        onChange={(e) => updateModule(mIdx, { description: e.target.value })}
                        className="w-full bg-transparent text-sm text-slate-500 outline-none placeholder:text-slate-300 focus:bg-slate-50 focus:rounded focus:px-2 focus:py-1 focus:ring-1 focus:ring-blue-500"
                        placeholder="Module description (optional)..."
                      />

                      {/* Lessons */}
                      <div className="mt-4 space-y-2">
                        {module.lessons.map((lesson, lIdx) => (
                          <div
                            key={lesson.id}
                            className={classNames(
                              'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                              editingLesson?.moduleIdx === mIdx && editingLesson?.lessonIdx === lIdx
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-slate-200 hover:bg-slate-50'
                            )}
                          >
                            {lesson.type === 'tutorial' ? (
                              <BookOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            ) : (
                              <ListChecks className="h-4 w-4 text-purple-500 flex-shrink-0" />
                            )}
                            <button
                              onClick={() => setEditingLesson({ moduleIdx: mIdx, lessonIdx: lIdx })}
                              className="flex-1 text-left text-sm font-medium text-slate-900 truncate"
                            >
                              {lesson.title}
                            </button>
                            <span className="badge bg-slate-100 text-slate-600">{lesson.type}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveLesson(mIdx, lIdx, 'up')}
                                disabled={lIdx === 0}
                                className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                              >
                                <ChevronRight className="h-3.5 w-3.5 rotate-[-90deg]" />
                              </button>
                              <button
                                onClick={() => moveLesson(mIdx, lIdx, 'down')}
                                disabled={lIdx === module.lessons.length - 1}
                                className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                              >
                                <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                              </button>
                              <button
                                onClick={() => deleteLesson(mIdx, lIdx)}
                                className="rounded p-1 text-red-400 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {module.lessons.length === 0 && (
                          <p className="text-sm text-slate-400 py-4 text-center">No lessons yet. Add one below.</p>
                        )}

                        {/* Add Lesson Buttons */}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => addLesson(mIdx, 'tutorial')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Tutorial
                          </button>
                          <button
                            onClick={() => addLesson(mIdx, 'project')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Project
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Module Button */}
          <button
            onClick={addModule}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
          >
            <Plus className="h-5 w-5" />
            Add Module
          </button>
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="mt-6 max-w-2xl space-y-6">
          <div className="card p-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Course Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field min-h-[100px]"
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
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Level</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as CourseLevel)}
                  className="input-field"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Thumbnail URL</label>
                <input
                  type="text"
                  value={thumbnail}
                  onChange={(e) => setThumbnail(e.target.value)}
                  className="input-field"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Learning Outcomes */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900">Learning Outcomes</h3>
            <p className="mt-1 text-sm text-slate-500">What students will learn in this course</p>

            <div className="mt-4 space-y-2">
              {learningOutcomes.map((outcome, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={outcome}
                    onChange={(e) => {
                      const updated = [...learningOutcomes];
                      updated[idx] = e.target.value;
                      setLearningOutcomes(updated);
                    }}
                    className="input-field"
                  />
                  <button
                    onClick={() => removeOutcome(idx)}
                    className="rounded-lg p-2 text-red-400 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newOutcome}
                  onChange={(e) => setNewOutcome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOutcome();
                    }
                  }}
                  className="input-field"
                  placeholder="Add a learning outcome..."
                />
                <button onClick={addOutcome} className="btn-secondary">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Editor Modal */}
      {editingLesson && editingLessonData && (
        <LessonEditor
          lesson={editingLessonData}
          onChange={(updates) => updateLesson(editingLesson.moduleIdx, editingLesson.lessonIdx, updates)}
          onClose={() => setEditingLesson(null)}
          onSave={() => {
            saveCourse();
            setEditingLesson(null);
          }}
        />
      )}
    </div>
  );
}

// Lesson Editor Component
function LessonEditor({
  lesson,
  onChange,
  onClose,
  onSave,
}: {
  lesson: Lesson;
  onChange: (updates: Partial<Lesson>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [requirements, setRequirements] = useState<string[]>(lesson.project?.requirements || []);
  const [newReq, setNewReq] = useState('');

  function updateRequirements(updated: string[]) {
    setRequirements(updated);
    if (lesson.project) {
      onChange({ project: { ...lesson.project, requirements: updated } });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {lesson.type === 'tutorial' ? (
              <BookOpen className="h-5 w-5 text-blue-600" />
            ) : (
              <ListChecks className="h-5 w-5 text-purple-600" />
            )}
            <h2 className="text-xl font-bold text-slate-900">
              Edit {lesson.type === 'tutorial' ? 'Tutorial' : 'Project'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
            <input
              type="text"
              value={lesson.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={lesson.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className="input-field min-h-[60px]"
              placeholder="Brief description..."
            />
          </div>

          {/* Tutorial fields */}
          {lesson.type === 'tutorial' && lesson.tutorial && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tutorial Content
                </label>
                <textarea
                  value={lesson.tutorial.content}
                  onChange={(e) => onChange({ tutorial: { ...lesson.tutorial!, content: e.target.value } })}
                  className="input-field min-h-[200px] font-mono text-sm"
                  placeholder="Write tutorial content here..."
                />
                <p className="mt-1 text-xs text-slate-400">
                  Use ## for headings, - for bullet points
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Video URL (optional)
                </label>
                <input
                  type="text"
                  value={lesson.tutorial.videoUrl || ''}
                  onChange={(e) => onChange({ tutorial: { ...lesson.tutorial!, videoUrl: e.target.value } })}
                  className="input-field"
                  placeholder="https://youtube.com/embed/..."
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Resource URL (optional)
                </label>
                <input
                  type="text"
                  value={lesson.tutorial.resourceUrl || ''}
                  onChange={(e) => onChange({ tutorial: { ...lesson.tutorial!, resourceUrl: e.target.value } })}
                  className="input-field"
                  placeholder="https://..."
                />
              </div>
            </>
          )}

          {/* Project fields */}
          {lesson.type === 'project' && lesson.project && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Project Description
                </label>
                <textarea
                  value={lesson.project.description}
                  onChange={(e) => onChange({ project: { ...lesson.project!, description: e.target.value } })}
                  className="input-field min-h-[80px]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Requirements
                </label>
                <div className="space-y-2">
                  {requirements.map((req, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={req}
                        onChange={(e) => {
                          const updated = [...requirements];
                          updated[idx] = e.target.value;
                          updateRequirements(updated);
                        }}
                        className="input-field"
                      />
                      <button
                        onClick={() => updateRequirements(requirements.filter((_, i) => i !== idx))}
                        className="rounded-lg p-2 text-red-400 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newReq}
                      onChange={(e) => setNewReq(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newReq.trim()) {
                            updateRequirements([...requirements, newReq.trim()]);
                            setNewReq('');
                          }
                        }
                      }}
                      className="input-field"
                      placeholder="Add a requirement..."
                    />
                    <button
                      onClick={() => {
                        if (newReq.trim()) {
                          updateRequirements([...requirements, newReq.trim()]);
                          setNewReq('');
                        }
                      }}
                      className="btn-secondary"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Instructions
                </label>
                <textarea
                  value={lesson.project.instructions}
                  onChange={(e) => onChange({ project: { ...lesson.project!, instructions: e.target.value } })}
                  className="input-field min-h-[120px] font-mono text-sm"
                  placeholder="Step-by-step instructions..."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Expected Outcome
                </label>
                <textarea
                  value={lesson.project.expectedOutcome}
                  onChange={(e) => onChange({ project: { ...lesson.project!, expectedOutcome: e.target.value } })}
                  className="input-field min-h-[60px]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Starter Code URL (optional)
                </label>
                <input
                  type="text"
                  value={lesson.project.starterCodeUrl || ''}
                  onChange={(e) => onChange({ project: { ...lesson.project!, starterCodeUrl: e.target.value } })}
                  className="input-field"
                  placeholder="https://..."
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onSave} className="btn-primary">
            <Save className="h-4 w-4" />
            Save Lesson
          </button>
        </div>
      </div>
    </div>
  );
}
