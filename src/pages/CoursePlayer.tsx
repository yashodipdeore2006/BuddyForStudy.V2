import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Course, Progress, CompletedLesson, Lesson } from '@/types';
import {
  countAllLessons,
  getAllLessonsFlat,
  findLessonById,
  isLessonCompleted,
  getNavigationLessons,
  calculateProgress,
} from '@/lib/courseUtils';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Play,
  ListChecks,
  BookOpen,
  Menu,
  X,
  Loader2,
  ArrowLeft,
  AlertCircle,
  FileText,
  ExternalLink,
  Target,
} from 'lucide-react';
import { classNames } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export default function CoursePlayer() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId?: string }>();
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!courseId || !session) return;

      const [courseRes, enrRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
        supabase
          .from('enrollments')
          .select('*')
          .eq('course_id', courseId)
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (courseRes.data) {
        setCourse(courseRes.data as Course);
      }

      if (enrRes.data) {
        setEnrolled(true);
        const { data: progData } = await supabase
          .from('progress')
          .select('*')
          .eq('course_id', courseId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        setProgress(progData as Progress | null);
      }

      setLoading(false);
    }
    fetchData();
  }, [courseId, session]);

  const allLessons = useMemo(() => (course ? getAllLessonsFlat(course.modules) : []), [course]);
  const totalLessons = allLessons.length;

  const currentLesson = useMemo(() => {
    if (!course || !lessonId) return null;
    return findLessonById(course.modules, lessonId);
  }, [course, lessonId]);

  // Auto-select first lesson if none selected
  useEffect(() => {
    if (course && !lessonId && allLessons.length > 0 && enrolled) {
      const prog = progress;
      let targetLesson: Lesson | null = null;

      // Try to resume from last accessed lesson
      if (prog?.last_lesson_id) {
        const lastLesson = findLessonById(course.modules, prog.last_lesson_id);
        if (lastLesson) {
          targetLesson = lastLesson.lesson;
        }
      }

      // Fall back to first uncompleted lesson
      if (!targetLesson) {
        const next = allLessons.find(
          (l) => !isLessonCompleted(prog?.completed_lessons || [], l.id)
        );
        targetLesson = next || allLessons[0];
      }

      navigate(`/learn/${courseId}/${targetLesson.id}`, { replace: true });
    }
  }, [course, lessonId, allLessons, enrolled, progress, navigate, courseId]);

  // Update last accessed lesson
  useEffect(() => {
    if (!courseId || !lessonId || !session || !enrolled) return;

    async function updateLastAccessed() {
      const existing = progress;
      if (existing && existing.last_lesson_id === lessonId) return;

      if (existing) {
        const { error } = await supabase
          .from('progress')
          .update({
            last_lesson_id: lessonId,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (!error) {
          setProgress({ ...existing, last_lesson_id: lessonId ?? null, last_accessed_at: new Date().toISOString() });
        }
      } else {
        // Create initial progress
        if (!session) return;
        const { completedCount, percentage } = calculateProgress([], totalLessons);
        const { data, error } = await supabase
          .from('progress')
          .insert({
            user_id: session.user.id,
            course_id: courseId,
            completed_lessons: [],
            completed_count: completedCount,
            total_lessons: totalLessons,
            percentage,
            last_lesson_id: lessonId,
            last_accessed_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (!error && data) {
          setProgress(data as Progress);
        }
      }
    }
    updateLastAccessed();
  }, [courseId, lessonId, session, enrolled, progress, totalLessons]);

  const handleComplete = async () => {
    if (!course || !lessonId || !session || !currentLesson) return;
    setCompleting(true);

    try {
      const completedLessons = progress?.completed_lessons || [];
      const alreadyCompleted = isLessonCompleted(completedLessons, lessonId);

      if (alreadyCompleted) {
        setCompleting(false);
        return;
      }

      const newCompleted: CompletedLesson = {
        lessonId,
        type: currentLesson.lesson.type,
        completedAt: new Date().toISOString(),
      };

      const updatedCompleted = [...completedLessons, newCompleted];
      const { completedCount, percentage } = calculateProgress(updatedCompleted, totalLessons);

      if (progress) {
        const { error } = await supabase
          .from('progress')
          .update({
            completed_lessons: updatedCompleted,
            completed_count: completedCount,
            total_lessons: totalLessons,
            percentage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', progress.id);

        if (!error) {
          setProgress({
            ...progress,
            completed_lessons: updatedCompleted,
            completed_count: completedCount,
            total_lessons: totalLessons,
            percentage,
          });

          // Mark enrollment as completed if 100%
          if (percentage === 100) {
            await supabase
              .from('enrollments')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .eq('course_id', courseId)
              .eq('user_id', session.user.id);
          }
        }
      } else {
        const { data, error } = await supabase
          .from('progress')
          .insert({
            user_id: session.user.id,
            course_id: courseId,
            completed_lessons: updatedCompleted,
            completed_count: completedCount,
            total_lessons: totalLessons,
            percentage,
            last_lesson_id: lessonId,
            last_accessed_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (!error && data) {
          setProgress(data as Progress);
        }
      }
    } catch (err) {
      console.error('Failed to mark complete:', err);
    } finally {
      setCompleting(false);
    }
  };

  const handleNavigate = (targetLessonId: string) => {
    navigate(`/learn/${courseId}/${targetLessonId}`);
    setSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Course Not Found</h1>
        <Link to="/courses" className="btn-primary mt-6">
          Browse Courses
        </Link>
      </div>
    );
  }

  if (!enrolled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Enrollment Required</h1>
        <p className="mt-2 text-slate-500">
          You need to be enrolled in this course to access learning content.
        </p>
        <Link to={`/courses/${courseId}`} className="btn-primary mt-6">
          View Course Details
        </Link>
      </div>
    );
  }

  const completedLessons = progress?.completed_lessons || [];
  const isCurrentCompleted = lessonId ? isLessonCompleted(completedLessons, lessonId) : false;
  const nav = lessonId ? getNavigationLessons(course.modules, lessonId) : { prev: null, next: null };
  const progressPct = progress?.percentage || 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-50 w-80 transform border-r border-slate-200 bg-white transition-transform lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <Link
            to={`/courses/${courseId}`}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Course Details
          </Link>
          <button
            className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900 line-clamp-2">{course.title}</h2>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{progress?.completed_count || 0} of {totalLessons} lessons</span>
            <span className="font-medium text-blue-600">{progressPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
          {course.modules.map((module, mIdx) => (
            <div key={module.id} className="border-b border-slate-100">
              <div className="px-4 py-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Module {mIdx + 1}
                </p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{module.title}</p>
              </div>
              {module.lessons.map((lesson) => {
                const isCurrent = lesson.id === lessonId;
                const isDone = isLessonCompleted(completedLessons, lesson.id);
                const LessonIcon: LucideIcon = lesson.type === 'project' ? ListChecks : Play;

                return (
                  <button
                    key={lesson.id}
                    onClick={() => handleNavigate(lesson.id)}
                    className={classNames(
                      'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors',
                      isCurrent
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
                    ) : isCurrent ? (
                      <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 border-blue-600">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      </div>
                    ) : (
                      <Circle className="h-4 w-4 flex-shrink-0 text-slate-300" />
                    )}
                    <LessonIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    <span className="flex-1 line-clamp-1">{lesson.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button
            className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {currentLesson?.lesson?.title || 'Course Player'}
            </p>
            <p className="text-xs text-slate-500">
              {currentLesson?.module?.title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentLesson && (
              <button
                onClick={handleComplete}
                disabled={completing || isCurrentCompleted}
                className={classNames(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                  isCurrentCompleted
                    ? 'bg-green-50 text-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrentCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isCurrentCompleted ? 'Completed' : 'Mark Complete'}
              </button>
            )}
          </div>
        </div>

        {/* Lesson Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
            {currentLesson ? (
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={classNames(
                      'badge',
                      currentLesson.lesson.type === 'project'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-blue-50 text-blue-700'
                    )}
                  >
                    {currentLesson.lesson.type === 'project' ? (
                      <ListChecks className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {currentLesson.lesson.type}
                  </span>
                </div>

                <h1 className="mt-3 text-3xl font-bold text-slate-900">
                  {currentLesson.lesson.title}
                </h1>
                <p className="mt-2 text-slate-500">
                  {currentLesson.lesson.description}
                </p>

                {/* Tutorial Content */}
                {currentLesson.lesson.type === 'tutorial' && currentLesson.lesson.tutorial && (
                  <TutorialView tutorial={currentLesson.lesson.tutorial} />
                )}

                {/* Project Content */}
                {currentLesson.lesson.type === 'project' && currentLesson.lesson.project && (
                  <ProjectView project={currentLesson.lesson.project} />
                )}

                {/* Navigation */}
                <div className="mt-12 flex items-center justify-between border-t border-slate-200 pt-6">
                  {nav.prev ? (
                    <button
                      onClick={() => handleNavigate(nav.prev!.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <div className="text-left">
                        <p className="text-xs text-slate-400">Previous</p>
                        <p className="text-xs font-medium truncate max-w-[120px]">{nav.prev.title}</p>
                      </div>
                    </button>
                  ) : (
                    <div />
                  )}

                  {nav.next ? (
                    <button
                      onClick={() => handleNavigate(nav.next!.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <div className="text-right">
                        <p className="text-xs text-blue-200">Next</p>
                        <p className="text-xs font-medium truncate max-w-[120px]">{nav.next.title}</p>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="text-right">
                      {progressPct === 100 ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Course Completed!
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-12 w-12 text-slate-300" />
                <h2 className="mt-4 text-xl font-bold text-slate-900">Select a lesson to begin</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Choose a lesson from the sidebar to start learning.
                </p>
                <button
                  className="lg:hidden btn-primary mt-6"
                  onClick={() => setSidebarOpen(true)}
                >
                  View Lessons
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TutorialView({ tutorial }: { tutorial: NonNullable<Lesson['tutorial']> }) {
  return (
    <div className="mt-8 card p-6 sm:p-8">
      {tutorial.videoUrl && (
        <div className="mb-6">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
            <iframe
              src={tutorial.videoUrl}
              className="h-full w-full"
              title="Tutorial Video"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {tutorial.content && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Lesson Content</h2>
          </div>
          <div className="prose prose-slate max-w-none">
            {tutorial.content.split('\n').map((line, idx) => {
              if (line.trim().startsWith('## ')) {
                return (
                  <h3 key={idx} className="text-lg font-semibold text-slate-900 mt-6 mb-2">
                    {line.replace('## ', '')}
                  </h3>
                );
              }
              if (line.trim().startsWith('# ')) {
                return (
                  <h2 key={idx} className="text-xl font-bold text-slate-900 mt-6 mb-3">
                    {line.replace('# ', '')}
                  </h2>
                );
              }
              if (line.trim().startsWith('- ')) {
                return (
                  <div key={idx} className="flex items-start gap-2 text-slate-700 my-1">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-600 flex-shrink-0" />
                    <span>{line.replace('- ', '')}</span>
                  </div>
                );
              }
              if (line.trim() === '') {
                return <div key={idx} className="h-3" />;
              }
              return (
                <p key={idx} className="text-slate-700 leading-relaxed">
                  {line}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {tutorial.resourceUrl && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <a
            href={tutorial.resourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            View Resource
          </a>
        </div>
      )}

      {!tutorial.content && !tutorial.videoUrl && (
        <div className="text-center py-8">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Tutorial content will be added soon.
          </p>
        </div>
      )}
    </div>
  );
}

function ProjectView({ project }: { project: NonNullable<Lesson['project']> }) {
  return (
    <div className="mt-8 space-y-6">
      {/* Description */}
      <div className="card p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-slate-900">Project Overview</h2>
        </div>
        <p className="text-slate-700 leading-relaxed">
          {project.description || 'Project description will be added soon.'}
        </p>
      </div>

      {/* Requirements */}
      {project.requirements.length > 0 && (
        <div className="card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Requirements</h2>
          <ul className="space-y-2">
            {project.requirements.map((req, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                <div className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                  {idx + 1}
                </div>
                <span className="leading-relaxed">{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Instructions */}
      {project.instructions && (
        <div className="card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Instructions</h2>
          <div className="prose prose-slate max-w-none">
            {project.instructions.split('\n').map((line, idx) => {
              if (line.trim().startsWith('## ')) {
                return (
                  <h3 key={idx} className="text-base font-semibold text-slate-900 mt-4 mb-2">
                    {line.replace('## ', '')}
                  </h3>
                );
              }
              if (line.trim().startsWith('- ')) {
                return (
                  <div key={idx} className="flex items-start gap-2 text-slate-700 my-1">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-600 flex-shrink-0" />
                    <span>{line.replace('- ', '')}</span>
                  </div>
                );
              }
              if (line.trim() === '') {
                return <div key={idx} className="h-3" />;
              }
              return (
                <p key={idx} className="text-slate-700 leading-relaxed">
                  {line}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Expected Outcome */}
      {project.expectedOutcome && (
        <div className="card p-6 sm:p-8 bg-gradient-to-br from-purple-50 to-white border-purple-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Expected Outcome</h2>
          <p className="text-slate-700 leading-relaxed">{project.expectedOutcome}</p>
        </div>
      )}

      {/* Starter Code */}
      {project.starterCodeUrl && (
        <div className="card p-6">
          <a
            href={project.starterCodeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Download Starter Code
          </a>
        </div>
      )}
    </div>
  );
}
