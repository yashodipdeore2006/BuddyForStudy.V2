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
  return <main className='min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6'><div className='mx-auto max-w-5xl'><div className='mb-6 flex items-center justify-between gap-4'><button type='button' onClick={() => navigate(routes.course(courseId))} className='text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300'>← Back to course</button><h1 className='text-lg font-bold'>Journey Roadmap</h1></div><JourneyRoadmap courseId={courseId} onEnroll={() => navigate(routes.course(courseId))} onContinue={() => nextLesson ? navigate(routes.learn(courseId, nextLesson.id)) : navigate(routes.course(courseId))} nextLessonTitle={nextLesson?.title} completed={lessons.length > 0 && lessons.every((lesson) => completedIds.has(lesson.id))} onViewLessons={(lessonIds) => { const target = lessons.find((lesson) => lessonIds.includes(lesson.id)); if (target) navigate(routes.learn(courseId, target.id)); else navigate(routes.course(courseId)); }} /></div></main>;
}
