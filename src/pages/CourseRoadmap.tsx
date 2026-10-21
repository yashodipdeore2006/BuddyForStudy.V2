import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { routes } from '@/lib/routes';
import JourneyRoadmap from '@/components/JourneyRoadmap';

type RawLesson = { _id?: string; id?: string; title?: string; order?: number };
type RawCourse = { _id?: string; id?: string; modules?: Array<{ lessons?: RawLesson[] }>; lessons?: RawLesson[]; videos?: RawLesson[]; items?: RawLesson[]; playlistItems?: RawLesson[] };
type RawProgress = { completedLessons?: Array<{ lessonId?: string }>; completed_lessons?: Array<{ lessonId?: string }>; percentage?: number; percent?: number };

export default function CourseRoadmap() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<RawCourse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [progressKnown, setProgressKnown] = useState(false);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    setCourse(null); setCompletedIds(new Set()); setProgressKnown(false); setLoadError('');
    Promise.allSettled([apiFetch('/api/courses/' + encodeURIComponent(courseId)), apiFetch('/api/progress/' + encodeURIComponent(courseId))]).then(([courseResult, progressResult]) => {
      if (!active) return;
      if (courseResult.status !== 'fulfilled' || !courseResult.value?.course) { setLoadError('This course is not available.'); return; }
      setCourse(courseResult.value.course as RawCourse);
      if (progressResult.status === 'fulfilled') {
        const raw = (progressResult.value?.progress || {}) as RawProgress;
        const items = raw.completedLessons || raw.completed_lessons || [];
        setCompletedIds(new Set(items.map((item) => String(item.lessonId || '')).filter(Boolean)));
      }
      setProgressKnown(true);
    }).catch(() => { if (active) setLoadError('Unable to load this course.'); });
    return () => { active = false; };
  }, [courseId]);
  const lessons = useMemo(() => {
    if (!course) return [];
    const modules = Array.isArray(course.modules) && course.modules.length ? course.modules : [{ lessons: course.lessons || course.videos || course.playlistItems || course.items || [] }];
    return modules.flatMap((module) => module.lessons || []).map((lesson) => ({ id: String(lesson._id || lesson.id || ''), title: lesson.title || 'Lesson' })).filter((lesson) => lesson.id);
  }, [course]);
  const nextLesson = lessons.find((lesson) => !completedIds.has(lesson.id)) || lessons[lessons.length - 1];
  if (loadError) return <main className='mx-auto max-w-3xl p-8 text-center' role='alert'><h1 className='text-xl font-semibold'>Roadmap unavailable</h1><p className='mt-2 text-sm text-slate-500'>{loadError}</p><button type='button' className='btn-primary mt-4' onClick={() => navigate(routes.course(courseId))}>Back to course</button></main>;
  return <main className='relative min-h-screen overflow-hidden bg-[#f7f8fc] px-4 py-6 text-slate-900 dark:bg-[#080b14] dark:text-slate-100 sm:px-6 sm:py-10'><div aria-hidden='true' className='pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.13),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.17),transparent_65%)]' /><div className='relative mx-auto max-w-6xl'><div className='mb-8 flex flex-wrap items-center justify-between gap-5 border-b border-slate-200/80 pb-6 dark:border-slate-800'><button type='button' onClick={() => navigate(routes.course(courseId))} className='group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:text-violet-300'> <span className='transition-transform group-hover:-translate-x-1'>←</span> Back to course</button><div className='min-w-[220px] flex-1 text-right'><p className='text-xs font-bold uppercase tracking-[.22em] text-violet-600 dark:text-violet-300'>YOUR LEARNING PATH</p><h1 className='mt-1 text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-3xl'>Journey roadmap</h1><p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>Every milestone brings you closer to mastery.</p></div></div><JourneyRoadmap courseId={courseId} onEnroll={() => navigate(routes.course(courseId))} onContinue={() => nextLesson ? navigate(routes.learn(courseId, nextLesson.id)) : navigate(routes.course(courseId))} nextLessonTitle={nextLesson?.title} completed={lessons.length > 0 && lessons.every((lesson) => completedIds.has(lesson.id))} onViewLessons={(lessonIds) => { const target = lessons.find((lesson) => lessonIds.includes(lesson.id)); if (target) navigate(routes.learn(courseId, target.id)); else navigate(routes.course(courseId)); }} /></div></main>;
}
