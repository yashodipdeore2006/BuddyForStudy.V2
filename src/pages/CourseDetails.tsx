import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Course, Enrollment, Progress } from '@/types';
import { countAllLessons, getAllLessonsFlat } from '@/lib/courseUtils';
import {
  BookOpen,
  Clock,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  GraduationCap,
  Play,
  AlertCircle,
  Loader2,
  ListChecks,
} from 'lucide-react';
import { classNames, formatDate } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const levelColors: Record<string, string> = {
  Beginner: 'bg-green-50 text-green-700',
  Intermediate: 'bg-amber-50 text-amber-700',
  Advanced: 'bg-red-50 text-red-700',
};

export default function CourseDetails() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    async function fetchCourse() {
      if (!courseId) return;
      const { data } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();

      if (data) {
        setCourse(data as Course);
      }
      setLoading(false);
    }
    fetchCourse();
  }, [courseId]);

  useEffect(() => {
    async function fetchEnrollmentAndProgress() {
      if (!courseId || !session) return;
      const { data: enrData } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', session.user.id)
        .maybeSingle();
      setEnrollment(enrData as Enrollment | null);

      if (enrData) {
        const { data: progData } = await supabase
          .from('progress')
          .select('*')
          .eq('course_id', courseId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        setProgress(progData as Progress | null);
      }
    }
    fetchEnrollmentAndProgress();
  }, [courseId, session]);

  const handleEnroll = async () => {
    if (!session) {
      navigate('/login', { state: { from: { pathname: `/courses/${courseId}` } } });
      return;
    }

    if (!course || !course.is_published) return;
    setEnrolling(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('enrollments')
        .insert({
          user_id: session.user.id,
          course_id: courseId,
          status: 'active',
        })
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation - already enrolled
          setError('You are already enrolled in this course.');
        } else {
          throw error;
        }
      }

      if (data) {
        setEnrollment(data as Enrollment);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enroll. Please try again.';
      setError(message);
    } finally {
      setEnrolling(false);
    }
  };

  const handleStartLearning = () => {
    if (!courseId) return;
    const firstLesson = course ? getAllLessonsFlat(course.modules)[0] : null;
    if (firstLesson) {
      navigate(`/learn/${courseId}/${firstLesson.id}`);
    } else {
      navigate(`/learn/${courseId}`);
    }
  };

  const toggleModule = (index: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

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
        <p className="mt-2 text-slate-500">
          The course you're looking for doesn't exist or has been removed.
        </p>
        <Link to="/courses" className="btn-primary mt-6">
          Browse Courses
        </Link>
      </div>
    );
  }

  const lessonCount = countAllLessons(course.modules);
  const isEnrolled = enrollment?.status === 'active';
  const progressPct = progress?.percentage || 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Courses
      </Link>

      {/* Course Header */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white sm:p-10">
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-white/20 text-white">
            {course.category}
          </span>
          <span className={classNames('badge', levelColors[course.level])}>
            {course.level}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{course.title}</h1>
        <p className="mt-3 max-w-2xl text-blue-100">{course.description}</p>

        <div className="mt-6 flex flex-wrap items-center gap-6 text-sm text-blue-100">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            {lessonCount} lessons
          </span>
          {course.duration && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {course.duration}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4" />
            {course.modules.length} modules
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Learning Outcomes */}
          {course.learning_outcomes.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900">What you'll learn</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.learning_outcomes.map((outcome, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Curriculum */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Course Curriculum</h2>
            <p className="mt-1 text-sm text-slate-500">
              {course.modules.length} modules • {lessonCount} lessons
            </p>

            <div className="mt-6 space-y-3">
              {course.modules.map((module, mIdx) => {
                const isExpanded = expandedModules.has(mIdx);
                return (
                  <div
                    key={module.id}
                    className="rounded-lg border border-slate-200 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleModule(mIdx)}
                      className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {module.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {module.lessons.length} lessons
                          </p>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200">
                        {module.lessons.map((lesson) => {
                          const LessonIcon: LucideIcon =
                            lesson.type === 'project' ? ListChecks : Play;
                          return (
                            <div
                              key={lesson.id}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                            >
                              <LessonIcon className="h-4 w-4 text-slate-400" />
                              <span className="text-sm text-slate-700 flex-1">
                                {lesson.title}
                              </span>
                              <span className="badge bg-slate-100 text-slate-600">
                                {lesson.type}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {course.modules.length === 0 && (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Curriculum content will be added soon.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card sticky top-20 p-6">
            {isEnrolled ? (
              <div>
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-slate-700">Your Progress</span>
                    <span className="font-bold text-blue-600">{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {progress && (
                    <p className="mt-2 text-xs text-slate-500">
                      {progress.completed_count} of {progress.total_lessons} lessons completed
                    </p>
                  )}
                </div>
                <button onClick={handleStartLearning} className="btn-primary w-full">
                  {progressPct > 0 ? 'Continue Learning' : 'Start Learning'}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <button
                  onClick={handleEnroll}
                  disabled={enrolling || !course.is_published}
                  className="btn-primary w-full"
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enrolling...
                    </>
                  ) : session ? (
                    'Enroll Now — Free'
                  ) : (
                    'Sign In to Enroll'
                  )}
                </button>
                {!session && (
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Create a free account to enroll in this course
                  </p>
                )}
                {error && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Level</span>
                <span className="font-medium text-slate-900">{course.level}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Category</span>
                <span className="font-medium text-slate-900">{course.category}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Duration</span>
                <span className="font-medium text-slate-900">{course.duration || 'Self-paced'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Lessons</span>
                <span className="font-medium text-slate-900">{lessonCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Published</span>
                <span className="font-medium text-slate-900">{formatDate(course.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
