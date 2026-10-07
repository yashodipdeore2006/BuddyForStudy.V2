import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Lock,
  Play,
  Trophy,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Course, Progress } from '@/types';
import { countAllLessons, getAllLessonsFlat } from '@/lib/courseUtils';

function mapCourse(raw: any): Course {
  return {
    id: String(raw._id ?? raw.id),
    title: raw.title ?? '',
    slug: raw.slug ?? '',
    description: raw.description ?? '',
    category: raw.category ?? 'General',
    level: raw.level ?? 'Beginner',
    duration: String(raw.duration ?? ''),
    thumbnail: raw.thumbnail ?? null,
    learning_outcomes: raw.learningOutcomes ?? raw.learning_outcomes ?? [],
    modules: (raw.modules ?? []).map((module: any, moduleIndex: number) => ({
      id: String(module._id ?? module.id ?? moduleIndex),
      title: module.title ?? `Module ${moduleIndex + 1}`,
      description: module.description ?? '',
      order: module.order ?? moduleIndex + 1,
      lessons: (module.lessons ?? []).map((lesson: any, lessonIndex: number) => ({
        id: String(lesson._id ?? lesson.id ?? `${moduleIndex}-${lessonIndex}`),
        title: lesson.title ?? `Lesson ${lessonIndex + 1}`,
        description: lesson.description ?? '',
        type: lesson.type ?? 'tutorial',
        order: lesson.order ?? lessonIndex + 1,
        tutorial: lesson.tutorial,
        project: lesson.project,
      })),
    })),
    is_published: raw.isPublished ?? raw.is_published ?? true,
    enrollment_count: raw.enrollmentCount,
    pricing: raw.pricing,
    created_by: raw.createdBy ?? raw.created_by ?? null,
    created_at: raw.createdAt ?? raw.created_at ?? '',
    updated_at: raw.updatedAt ?? raw.updated_at ?? '',
  };
}

function mapProgress(raw: any): Progress {
  return {
    id: String(raw._id ?? raw.id),
    user_id: String(raw.user ?? raw.user_id),
    course_id: String(raw.course ?? raw.course_id),
    completed_lessons: (raw.completedLessons ?? []).map((item: any) => ({
      lessonId: String(item.lessonId),
      type: item.type,
      completedAt: item.completedAt,
    })),
    completed_count: raw.completedCount ?? 0,
    total_lessons: raw.totalLessons ?? 0,
    percentage: raw.percentage ?? 0,
    last_lesson_id: raw.lastLessonId ? String(raw.lastLessonId) : null,
    last_accessed_at: raw.lastAccessedAt ?? null,
    created_at: raw.createdAt ?? '',
    updated_at: raw.updatedAt ?? '',
  };
}

export default function CourseRoadmap() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setError('Invalid course');
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [courseData, progressData] = await Promise.all([
          apiFetch(`/api/courses/${courseId}`),
          apiFetch(`/api/progress/${courseId}`),
        ]);
        setCourse(mapCourse(courseData.course));
        setProgress(mapProgress(progressData.progress));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load this course roadmap.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId]);

  const completedIds = useMemo(
    () => new Set((progress?.completed_lessons ?? []).map((lesson) => lesson.lessonId)),
    [progress]
  );

  const flatLessons = useMemo(
    () => (course ? getAllLessonsFlat(course.modules) : []),
    [course]
  );

  const nextLesson = useMemo(() => {
    if (!flatLessons.length) return null;
    return flatLessons.find((lesson) => !completedIds.has(String(lesson.id))) ?? flatLessons[flatLessons.length - 1];
  }, [flatLessons, completedIds]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!course || error) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Roadmap unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error ?? 'This course could not be loaded.'}</p>
          <Link to="/my-courses" className="btn-primary mt-6 inline-flex">
            Back to My Learning
          </Link>
        </div>
      </div>
    );
  }

  const totalLessons = progress?.total_lessons || countAllLessons(course.modules);
  const completedCount = progress?.completed_count ?? completedIds.size;
  const percentage = Math.min(100, Math.max(0, progress?.percentage ?? 0));
  const isComplete = percentage >= 100;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Link
            to="/my-courses"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            My Learning
          </Link>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="hidden h-16 w-24 overflow-hidden rounded-xl bg-slate-100 sm:block">
                {course.thumbnail ? (
                  <img src={course.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <BookOpen className="h-7 w-7 text-slate-300" />
                  </div>
                )}
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="badge bg-blue-50 text-blue-700">{course.category}</span>
                  <span className="badge bg-slate-100 text-slate-600">{course.level}</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  {course.title}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">{course.description}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => nextLesson && navigate(`/learn/${course.id}/${nextLesson.id}`)}
              disabled={!nextLesson}
              className="btn-primary shrink-0"
            >
              <Play className="h-4 w-4" />
              {isComplete ? 'Review Course' : completedCount > 0 ? 'Continue Learning' : 'Start Learning'}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-blue-600 p-5 text-white shadow-sm md:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-100">Your progress</p>
                <p className="mt-1 text-3xl font-bold">{percentage}%</p>
              </div>
              <Trophy className="h-7 w-7 text-blue-100" />
            </div>
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-blue-100">
              {completedCount} of {totalLessons} lessons completed
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <BookOpen className="h-4 w-4" />
                Modules
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{course.modules.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock className="h-4 w-4" />
                Duration
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{course.duration || 'Self-paced'}</p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Learning path</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Course Roadmap</h2>
            <p className="mt-1 text-sm text-slate-500">
              Follow the modules in order and complete each lesson to move forward.
            </p>
          </div>

          <div className="relative">
            <div className="absolute bottom-8 left-5 top-8 hidden w-px bg-slate-200 sm:block" />

            <div className="space-y-5">
              {course.modules.map((module, moduleIndex) => {
                const moduleLessons = module.lessons;
                const moduleCompleted = moduleLessons.filter((lesson) => completedIds.has(String(lesson.id))).length;
                const modulePercentage = moduleLessons.length
                  ? Math.round((moduleCompleted / moduleLessons.length) * 100)
                  : 0;
                const firstIncomplete = moduleLessons.find((lesson) => !completedIds.has(String(lesson.id)));
                const isCurrent = Boolean(firstIncomplete && nextLesson?.id === firstIncomplete.id);

                return (
                  <article key={module.id} className="relative sm:pl-14">
                    <div
                      className={`absolute left-0 top-5 hidden h-10 w-10 items-center justify-center rounded-full border-4 border-slate-50 sm:flex ${
                        modulePercentage === 100
                          ? 'bg-green-100 text-green-700'
                          : isCurrent
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {modulePercentage === 100 ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-bold">{moduleIndex + 1}</span>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-100 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                              Module {moduleIndex + 1}
                            </p>
                            <h3 className="mt-1 text-lg font-bold text-slate-900">{module.title}</h3>
                            {module.description && (
                              <p className="mt-1 text-sm text-slate-500">{module.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <p className="text-sm font-semibold text-slate-700">
                              {moduleCompleted}/{moduleLessons.length}
                            </p>
                            <p className="text-xs text-slate-400">{modulePercentage}% complete</p>
                          </div>
                        </div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${modulePercentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {moduleLessons.map((lesson, lessonIndex) => {
                          const completed = completedIds.has(String(lesson.id));
                          const isNext = nextLesson?.id === lesson.id;
                          const previousLesson = flatLessons[flatLessons.findIndex((item) => item.id === lesson.id) - 1];
                          const unlocked = lessonIndex === 0 || completedIds.has(String(previousLesson?.id));

                          return (
                            <div
                              key={lesson.id}
                              className={`flex items-center gap-3 px-5 py-4 ${
                                isNext ? 'bg-blue-50/60' : 'bg-white'
                              }`}
                            >
                              <div className="shrink-0">
                                {completed ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                ) : unlocked ? (
                                  <Circle className="h-5 w-5 text-slate-300" />
                                ) : (
                                  <Lock className="h-4 w-4 text-slate-300" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className={`truncate text-sm font-medium ${
                                  completed ? 'text-slate-500' : 'text-slate-800'
                                }`}>
                                  {lessonIndex + 1}. {lesson.title}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                  <span className="capitalize">{lesson.type}</span>
                                  {completed && <span className="text-green-600">Completed</span>}
                                  {isNext && !completed && <span className="font-medium text-blue-600">Up next</span>}
                                </div>
                              </div>

                              {unlocked && (
                                <Link
                                  to={`/learn/${course.id}/${lesson.id}`}
                                  className={`inline-flex shrink-0 items-center gap-1 text-sm font-semibold ${
                                    isNext ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
                                  }`}
                                >
                                  {completed ? 'Review' : isNext ? 'Start' : 'Open'}
                                  <ChevronRight className="h-4 w-4" />
                                </Link>
                              )}
                            </div>
                          );
                        })}

                        {!moduleLessons.length && (
                          <div className="px-5 py-4 text-sm text-slate-500">
                            Lessons will be added to this module soon.
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
