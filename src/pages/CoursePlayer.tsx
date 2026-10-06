import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, Lesson, Progress } from '@/types';
import { getAllLessonsFlat, findLessonById, isLessonCompleted, getNavigationLessons } from '@/lib/courseUtils';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Play, ListChecks, BookOpen, Menu, X, Loader2, ArrowLeft, AlertCircle, FileText, ExternalLink, Target } from 'lucide-react';
import { classNames } from '@/lib/utils';

function mapCourse(raw: any): Course {
  return {
    id: String(raw._id ?? raw.id), title: raw.title, slug: raw.slug, description: raw.description,
    category: raw.category, level: raw.level, duration: String(raw.duration ?? ''),
    thumbnail: raw.thumbnail ?? null, learning_outcomes: raw.learningOutcomes ?? [],
    modules: raw.modules ?? [], is_published: raw.isPublished ?? true, pricing: raw.pricing,
    created_by: raw.createdBy ?? null, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '',
  };
}
function mapProgress(raw: any): Progress {
  return {
    id: String(raw._id ?? raw.id), user_id: String(raw.user ?? raw.user_id),
    course_id: String(raw.course ?? raw.course_id),
    completed_lessons: (raw.completedLessons ?? []).map((x: any) => ({ lessonId: String(x.lessonId), type: x.type, completedAt: x.completedAt })),
    completed_count: raw.completedCount ?? 0, total_lessons: raw.totalLessons ?? 0, percentage: raw.percentage ?? 0,
    last_lesson_id: raw.lastLessonId ? String(raw.lastLessonId) : null,
    last_accessed_at: raw.lastAccessedAt ?? null, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '',
  };
}

export default function CoursePlayer() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId?: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!courseId || !profile) return;
    async function load() {
      try {
        const [courseData, progressData] = await Promise.all([
          apiFetch(`/api/courses/${courseId}/learn`),
          apiFetch(`/api/progress/${courseId}`),
        ]);
        setCourse(mapCourse(courseData.course));
        setProgress(mapProgress(progressData.progress));
      } catch (err: any) {
        setError(err.message || 'Unable to load this course.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId, profile]);

  const allLessons = useMemo(() => course ? getAllLessonsFlat(course.modules) : [], [course]);
  const currentLesson = useMemo(() => course && lessonId ? findLessonById(course.modules, lessonId) : null, [course, lessonId]);

  useEffect(() => {
    if (!course || lessonId || allLessons.length === 0) return;
    const targetId = progress?.last_lesson_id || allLessons.find((item) => !isLessonCompleted(progress?.completed_lessons || [], item.id))?.id || allLessons[0].id;
    navigate(`/learn/${courseId}/${targetId}`, { replace: true });
  }, [course, lessonId, allLessons, progress, navigate, courseId]);

  const handleNavigate = (id: string) => {
    navigate(`/learn/${courseId}/${id}`);
    setSidebarOpen(false);
  };

  const handleComplete = async () => {
    if (!courseId || !lessonId || !currentLesson || isLessonCompleted(progress?.completed_lessons || [], lessonId)) return;
    setCompleting(true);
    try {
      const data = await apiFetch(`/api/progress/${courseId}/items/${lessonId}/complete`, { method: 'POST' });
      const next = mapProgress(data.progress);
      setProgress((previous) => previous ? { ...previous, ...next } : next);
    } catch (err: any) {
      setError(err.message || 'Unable to mark lesson complete.');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>;
  if (error || !course) return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><AlertCircle className="mx-auto h-12 w-12 text-slate-400" /><h1 className="mt-4 text-2xl font-bold text-slate-900">{error || 'Course Not Found'}</h1><Link to={`/courses/${courseId}`} className="btn-primary mt-6">View Course</Link></div>;

  const completedLessons = progress?.completed_lessons || [];
  const currentCompleted = lessonId ? isLessonCompleted(completedLessons, lessonId) : false;
  const nav = lessonId ? getNavigationLessons(course.modules, lessonId) : { prev: null, next: null };
  const progressPct = progress?.percentage || 0;

  return <div className="flex min-h-screen bg-slate-50">
    <aside className={classNames('fixed inset-y-0 left-0 z-50 w-80 transform border-r border-slate-200 bg-white transition-transform lg:relative lg:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4"><Link to={`/courses/${courseId}`} className="flex items-center gap-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Course Details</Link><button className="lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button></div>
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="line-clamp-2 text-sm font-bold text-slate-900">{course.title}</h2><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{progress?.completed_count || 0} of {allLessons.length} lessons</span><span className="font-medium text-blue-600">{progressPct}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progressPct}%` }} /></div></div>
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>{course.modules.map((module, index) => <div key={module.id} className="border-b border-slate-100"><div className="bg-slate-50 px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Module {index + 1}</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{module.title}</p></div>{module.lessons.map((lesson) => { const done = isLessonCompleted(completedLessons, lesson.id); return <button key={lesson.id} onClick={() => handleNavigate(lesson.id)} className={classNames('flex w-full items-center gap-3 px-4 py-3 text-left text-sm', lesson.id === lessonId ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-50')}>{done ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" /> : <Circle className="h-4 w-4 flex-shrink-0 text-slate-300" />}{lesson.type === 'project' ? <ListChecks className="h-3.5 w-3.5 text-slate-400" /> : <Play className="h-3.5 w-3.5 text-slate-400" />}<span className="line-clamp-1 flex-1">{lesson.title}</span></button>; })}</div>)}</div>
    </aside>
    {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    <main className="min-w-0 flex-1">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4"><button className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></button><div className="min-w-0 flex-1 px-3"><p className="truncate text-sm font-semibold text-slate-900">{currentLesson?.lesson.title || 'Course Player'}</p><p className="text-xs text-slate-500">{currentLesson?.module.title}</p></div>{currentLesson && <button onClick={handleComplete} disabled={completing || currentCompleted} className={classNames('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold', currentCompleted ? 'bg-green-50 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700')}>{completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{currentCompleted ? 'Completed' : 'Mark Complete'}</button>}</div>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {currentLesson ? <><div className="flex items-center gap-2"><span className={classNames('badge', currentLesson.lesson.type === 'project' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700')}>{currentLesson.lesson.type === 'project' ? <ListChecks className="h-3 w-3" /> : <Play className="h-3 w-3" />}{currentLesson.lesson.type}</span></div><h1 className="mt-3 text-3xl font-bold text-slate-900">{currentLesson.lesson.title}</h1><p className="mt-2 text-slate-500">{currentLesson.lesson.description}</p>{currentLesson.lesson.type === 'tutorial' && currentLesson.lesson.tutorial && <TutorialView tutorial={currentLesson.lesson.tutorial} />}{currentLesson.lesson.type === 'project' && currentLesson.lesson.project && <ProjectView project={currentLesson.lesson.project} />}
          <div className="mt-12 flex items-center justify-between border-t border-slate-200 pt-6">{nav.prev ? <button onClick={() => handleNavigate(nav.prev!.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm"><ChevronLeft className="h-4 w-4" />Previous</button> : <div />}{nav.next ? <button onClick={() => handleNavigate(nav.next!.id)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Next<ChevronRight className="h-4 w-4" /></button> : progressPct === 100 ? <span className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" />Course Completed!</span> : <div />}</div>
        </> : <div className="py-16 text-center"><BookOpen className="mx-auto h-12 w-12 text-slate-300" /><h2 className="mt-4 text-xl font-bold text-slate-900">Select a lesson to begin</h2></div>}
      </div>
    </main>
  </div>;
}

function TutorialView({ tutorial }: { tutorial: any }) {
  return <div className="card mt-8 p-6 sm:p-8">{tutorial.videoUrl && <div className="mb-6 aspect-video overflow-hidden rounded-lg bg-slate-900"><iframe src={tutorial.videoUrl} className="h-full w-full" title="Tutorial Video" allowFullScreen /></div>}{tutorial.content && <div><div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-slate-400" /><h2 className="text-lg font-semibold text-slate-900">Lesson Content</h2></div><div className="prose prose-slate max-w-none">{tutorial.content.split('\n').map((line: string, i: number) => line.startsWith('## ') ? <h3 key={i} className="mt-6 text-lg font-semibold">{line.slice(3)}</h3> : line.startsWith('# ') ? <h2 key={i} className="mt-6 text-xl font-bold">{line.slice(2)}</h2> : line.startsWith('- ') ? <p key={i} className="my-1 text-slate-700">• {line.slice(2)}</p> : <p key={i} className="leading-relaxed text-slate-700">{line || ' '}</p>)}</div></div>}{tutorial.resourceUrl && <a href={tutorial.resourceUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 border-t border-slate-200 pt-6 text-sm font-semibold text-blue-600"><ExternalLink className="h-4 w-4" />View Resource</a>}</div>;
}
function ProjectView({ project }: { project: any }) {
  return <div className="mt-8 space-y-6"><div className="card p-6 sm:p-8"><div className="mb-4 flex items-center gap-2"><Target className="h-5 w-5 text-purple-600" /><h2 className="text-lg font-semibold">Project Overview</h2></div><p className="leading-relaxed text-slate-700">{project.description || 'Project description will be added soon.'}</p></div>{project.requirements?.length > 0 && <div className="card p-6 sm:p-8"><h2 className="mb-4 text-lg font-semibold">Requirements</h2><ul className="space-y-2">{project.requirements.map((req: string, i: number) => <li key={i} className="flex gap-3 text-sm text-slate-700"><span className="font-bold">{i + 1}.</span>{req}</li>)}</ul></div>}{project.instructions && <div className="card p-6 sm:p-8"><h2 className="mb-4 text-lg font-semibold">Instructions</h2><div className="prose prose-slate max-w-none">{project.instructions.split('\n').map((line: string, i: number) => <p key={i} className="leading-relaxed text-slate-700">{line || ' '}</p>)}</div></div>}{project.expectedOutcome && <div className="card border-purple-200 bg-purple-50 p-6"><h2 className="mb-2 text-lg font-semibold">Expected Outcome</h2><p className="text-slate-700">{project.expectedOutcome}</p></div>}{project.starterCodeUrl && <a href={project.starterCodeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ExternalLink className="h-4 w-4" />Download Starter Code</a>}</div>;
}
