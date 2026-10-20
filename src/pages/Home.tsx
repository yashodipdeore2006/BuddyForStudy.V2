import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, RefreshCw, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import type { Course } from '@/types';
import { getAllLessonsFlat } from '@/lib/courseUtils';
import CourseCard from '@/components/CourseCard';
import ErrorState from '@/components/ErrorState';
import { CourseGridSkeleton } from '@/components/Skeleton';
import '@/styles/user-home.css';

type ProgressRecord = {
  course_id: string;
  completed_count: number;
  total_lessons: number;
  percentage: number;
  last_lesson_id?: string | null;
  last_accessed_at?: string | null;
  completed_lesson_ids: string[];
  next_lesson_id?: string;
  nextLessonTitle?: string;
  remainingDuration?: string;
};
type EnrollmentRecord = { id: string; course_id: string; status: string; course: Course };
type HomeData = {
  enrollments: EnrollmentRecord[];
  progress: Record<string, ProgressRecord>;
  courses: Course[];
  learningStats: Record<string, unknown> | null;
};

function mapCourse(raw: any): Course {
  return {
    ...raw,
    id: String(raw?._id ?? raw?.id ?? ''),
    title: String(raw?.title ?? 'Untitled course'),
    description: String(raw?.description ?? ''),
    category: String(raw?.category ?? ''),
    level: raw?.level,
    duration: String(raw?.duration ?? ''),
    thumbnail: raw?.thumbnail ?? null,
    learning_outcomes: raw?.learningOutcomes ?? raw?.learning_outcomes ?? [],
    modules: Array.isArray(raw?.modules) ? raw.modules : [],
    lesson_count: Number.isFinite(raw?.lessonCount) ? raw.lessonCount : raw?.lesson_count,
    is_published: raw?.isPublished ?? raw?.is_published ?? true,
    pricing: raw?.pricing,
    created_at: raw?.createdAt ?? raw?.created_at ?? '',
    updated_at: raw?.updatedAt ?? raw?.updated_at ?? '',
  } as Course;
}
function mapProgress(raw: any, courseId: string, course?: Course): ProgressRecord {
  const completedLessons = Array.isArray(raw?.completedLessons) ? raw.completedLessons : Array.isArray(raw?.completed_lessons) ? raw.completed_lessons : [];
  const completedLessonIds = completedLessons.map((item: any) => String(item?.lessonId ?? item?.lesson_id ?? '')).filter(Boolean);
  const completedSet = new Set(completedLessonIds);
  const nextLesson = course ? getAllLessonsFlat(course.modules).find((lesson) => !completedSet.has(String(lesson.id))) : undefined;
  return {
    course_id: courseId,
    completed_count: Number(raw?.completedCount ?? raw?.completed_count ?? 0),
    total_lessons: Number(raw?.totalLessons ?? raw?.total_lessons ?? 0),
    percentage: Math.max(0, Math.min(100, Number(raw?.percentage ?? 0))),
    last_lesson_id: raw?.lastLessonId ?? raw?.last_lesson_id ?? null,
    last_accessed_at: raw?.lastAccessedAt ?? raw?.last_accessed_at ?? null,
    completed_lesson_ids: completedLessonIds,
    ...(nextLesson ? { next_lesson_id: nextLesson.id, nextLessonTitle: nextLesson.title } : typeof raw?.nextLessonTitle === 'string' ? { nextLessonTitle: raw.nextLessonTitle } : {}),
    ...(typeof raw?.remainingDuration === 'string' ? { remainingDuration: raw.remainingDuration } : {}),
  };
}
function mapEnrollment(raw: any): EnrollmentRecord | null {
  if (!raw?.course || typeof raw.course !== 'object') return null;
  const course = mapCourse(raw.course);
  if (!course.id) return null;
  return {
    id: String(raw?._id ?? raw?.id ?? course.id),
    course_id: String(raw.course?._id ?? raw.course?.id ?? raw.course_id ?? course.id),
    status: String(raw?.status ?? 'active').toLowerCase(),
    course,
  };
}
function SkeletonResume() {
  return <div className="user-home__panel user-home__resume" aria-label="Loading your learning" aria-busy="true">
    <div className="user-home__skeleton user-home__skeleton--cover" />
    <div><div className="user-home__skeleton user-home__skeleton--title" /><div className="user-home__skeleton user-home__skeleton--line" /><div className="user-home__skeleton user-home__skeleton--line" /><div className="user-home__skeleton user-home__skeleton--line" /></div>
  </div>;
}
function Cover({ course, className = '' }: { course: Course; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={className} aria-label={course.title}>
    {course.thumbnail && !failed
      ? <img src={course.thumbnail} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <div className="user-home__image-fallback"><BookOpen aria-hidden="true" size={32} /></div>}
  </div>;
}

export default function Home() {
  const { session, profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<HomeData>({ enrollments: [], progress: {}, courses: [], learningStats: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  const loadHome = useCallback(async (isRefresh = false) => {
    if (!session) {
      setData({ enrollments: [], progress: {}, courses: [], learningStats: null });
      setLoading(false);
      setRefreshing(false);
      setError('');
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    setSectionErrors([]);

    const partialErrors: string[] = [];
    const results = await Promise.allSettled([
      apiFetch('/api/enrollments'),
      apiFetch('/api/courses?limit=24'),
      apiFetch('/api/achievements/me'),
    ]);
    const enrollmentResult = results[0];
    const courseResult = results[1];
    const statsResult = results[2];
    const rawEnrollments = enrollmentResult.status === 'fulfilled' ? (enrollmentResult.value.enrollments ?? []) : [];
    if (enrollmentResult.status === 'rejected') partialErrors.push('Your enrolled courses could not be loaded.');
    const enrollments = rawEnrollments.map(mapEnrollment)
      .filter((item: EnrollmentRecord | null): item is EnrollmentRecord => Boolean(item))
      .filter((item: EnrollmentRecord) => ['active', 'completed'].includes(item.status));
    const courses = courseResult.status === 'fulfilled'
      ? (courseResult.value.courses ?? []).map(mapCourse).filter((course: Course) => Boolean(course.id))
      : [];
    if (courseResult.status === 'rejected') partialErrors.push('Recommended courses could not be loaded.');
    const learningStats = statsResult.status === 'fulfilled' ? (statsResult.value.stats ?? null) : null;
    if (statsResult.status === 'rejected') partialErrors.push('Learning summary is temporarily unavailable.');

    const progressEntries = await Promise.all(enrollments.map(async (enrollment: EnrollmentRecord) => {
      try {
        const response = await apiFetch('/api/progress/' + enrollment.course_id);
        return [enrollment.course_id, mapProgress(response.progress, enrollment.course_id, enrollment.course)] as const;
      } catch {
        partialErrors.push('Progress for ' + enrollment.course.title + ' could not be loaded.');
        return null;
      }
    }));
    const progress: Record<string, ProgressRecord> = {};
    progressEntries.forEach((entry) => { if (entry) progress[entry[0]] = entry[1]; });
    const allPrimarySourcesFailed = enrollmentResult.status === 'rejected' && courseResult.status === 'rejected' && statsResult.status === 'rejected';
    if (allPrimarySourcesFailed) {
      if (!isRefresh) setError('We couldn’t load your learning home. Check your connection and try again.');
      else partialErrors.push('Refresh failed. The last available data is still shown.');
    } else {
      setData({ enrollments, progress, courses, learningStats });
    }
    setSectionErrors([...new Set(partialErrors)]);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useEffect(() => { if (!authLoading) void loadHome(); }, [authLoading, loadHome]);
  useEffect(() => {
    const updateOnline = () => setOnline(true);
    const updateOffline = () => setOnline(false);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOffline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOffline);
    };
  }, []);

  const activeEnrollments = useMemo(() => data.enrollments.filter((item) => item.status === 'active'), [data.enrollments]);
  const inProgress = useMemo(() => activeEnrollments
    .filter((item) => (data.progress[item.course_id]?.percentage ?? 0) > 0 && (data.progress[item.course_id]?.percentage ?? 0) < 100)
    .sort((a, b) => (data.progress[b.course_id]?.last_accessed_at ?? '').localeCompare(data.progress[a.course_id]?.last_accessed_at ?? '')),
  [activeEnrollments, data.progress]);
  const resumeEnrollment = inProgress[0] ?? activeEnrollments[0] ?? null;
  const resumeProgress = resumeEnrollment ? data.progress[resumeEnrollment.course_id] : undefined;
  const enrolledIds = useMemo(() => new Set(data.enrollments.map((item) => item.course_id)), [data.enrollments]);
  const recommendations = useMemo(() => data.courses.filter((course) => !enrolledIds.has(course.id)).slice(0, 4), [data.courses, enrolledIds]);
  const completedLessons = Object.values(data.progress).reduce((sum, item) => sum + item.completed_count, 0);
  const totalLessons = Object.values(data.progress).reduce((sum, item) => sum + item.total_lessons, 0);
  const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const firstName = (profile?.name ?? session?.user?.name ?? 'learner').trim().split(/\s+/)[0] || 'learner';
  const resumeUrl = resumeEnrollment
    ? '/learn/' + resumeEnrollment.course_id + (resumeProgress?.next_lesson_id ? '/' + encodeURIComponent(resumeProgress.next_lesson_id) : '')
    : '/courses';

  if (authLoading || loading) {
    return <main className="user-home" id="main-content"><div className="user-home__shell user-home__stack">
      <div><div className="user-home__skeleton user-home__skeleton--title" /><div className="user-home__skeleton user-home__skeleton--line" /></div>
      <SkeletonResume />
      <div className="user-home__stats">{[1, 2, 3].map((item) => <div key={item} className="user-home__panel" aria-hidden="true"><div className="user-home__skeleton user-home__skeleton--title" /><div className="user-home__skeleton user-home__skeleton--line" /></div>)}</div>
      <CourseGridSkeleton count={4} />
    </div></main>;
  }
  if (error) {
    return <main className="user-home" id="main-content"><div className="user-home__shell"><ErrorState title="Your Home didn’t load" description={error} onRetry={() => void loadHome()} /></div></main>;
  }

  return <main className="user-home" id="main-content">
    {refreshing && <div className="user-home__refreshing" role="progressbar" aria-label="Refreshing Home" />}
    <div className="user-home__shell user-home__stack">
      {!online && <div className="user-home__alert user-home__alert--info" role="status"><Clock3 aria-hidden="true" size={18} /><span>You’re offline. Progress will sync when you reconnect.</span></div>}
      <section className="user-home__greeting" aria-labelledby="home-title">
        <div>
          <h1 className="user-home__page-title" id="home-title">Welcome back, {firstName}</h1>
          <p className="user-home__muted">{resumeEnrollment && resumeProgress && resumeProgress.total_lessons > 0
            ? 'You’re ' + Math.max(0, resumeProgress.total_lessons - resumeProgress.completed_count) + ' lessons from finishing ' + resumeEnrollment.course.title + '.'
            : 'Your next step is ready when you are.'}</p>
        </div>
        {resumeEnrollment && <Link className="user-home__button" to={resumeUrl}>Continue: {resumeEnrollment.course.title} <ArrowRight size={16} aria-hidden="true" /></Link>}
      </section>

      {sectionErrors.length > 0 && <div className="user-home__alert user-home__alert--error" role="alert">
        <span>{sectionErrors.join(' ')}</span>
        <button className="user-home__link" type="button" onClick={() => void loadHome(true)}>Retry <RefreshCw size={14} aria-hidden="true" /></button>
      </div>}

      <section className="user-home__section" aria-labelledby="resume-heading">
        <div className="user-home__heading"><h2 className="user-home__title" id="resume-heading">Pick up where you left off</h2></div>
        {resumeEnrollment && resumeProgress ? <article className="user-home__panel user-home__resume">
          <Cover course={resumeEnrollment.course} className="user-home__cover" />
          <div className="user-home__resume-content">
            <p className="user-home__meta">{resumeEnrollment.course.category || 'Your course'}</p>
            <h3 className="user-home__course-title">{resumeEnrollment.course.title}</h3>
            <p className="user-home__meta">{resumeProgress.nextLessonTitle
              ? 'Next: ' + resumeProgress.nextLessonTitle
              : resumeProgress.last_lesson_id
                ? 'Next: continue from your last lesson'
                : resumeProgress.completed_count > 0 ? 'Continue from your saved progress' : 'Start with the first lesson'}</p>
            <div className="user-home__progress">
              <div className="user-home__progress-label"><span>{resumeProgress.completed_count} of {resumeProgress.total_lessons || '—'} lessons</span><span>{resumeProgress.percentage}%</span></div>
              <div className="user-home__progress-track" role="progressbar" aria-label={resumeEnrollment.course.title + ' progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={resumeProgress.percentage}>
                <div className="user-home__progress-fill" style={{ width: resumeProgress.percentage + '%' }} />
              </div>
            </div>
            {resumeProgress.remainingDuration && <p className="user-home__meta">About {resumeProgress.remainingDuration} left</p>}
            <Link className="user-home__button" to={resumeUrl}>Continue <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </article> : <div className="user-home__empty">
          <div className="user-home__empty-icon"><GraduationCap size={24} aria-hidden="true" /></div>
          <h3>{session ? 'No course in progress yet' : 'Your learning journey starts here'}</h3>
          <p>{session ? 'Explore a course or build a learning path. Your next step will appear here.' : 'Sign in to keep your courses, progress and next lesson together.'}</p>
          <div className="user-home__actions"><Link className="user-home__button" to="/courses">Explore <ArrowRight size={16} aria-hidden="true" /></Link><Link className="user-home__button user-home__button--secondary" to="/register"><Sparkles size={16} aria-hidden="true" /> Build my path</Link></div>
        </div>}
      </section>

      <section className="user-home__panel" aria-labelledby="stats-heading">
        <div className="user-home__heading"><h2 className="user-home__title" id="stats-heading">Your learning at a glance</h2><Link className="user-home__link" to="/profile">See all <ArrowRight size={14} aria-hidden="true" /></Link></div>
        <div className="user-home__stats">
          <div className="user-home__stat"><div className="user-home__stat-icon"><BookOpen size={22} aria-hidden="true" /></div><div><p className="user-home__stat-value">{data.enrollments.length}</p><p className="user-home__stat-label">Courses enrolled</p></div></div>
          <div className="user-home__stat"><div className="user-home__stat-icon"><CheckCircle2 size={22} aria-hidden="true" /></div><div><p className="user-home__stat-value">{completedLessons}</p><p className="user-home__stat-label">Lessons done</p></div></div>
          <div className="user-home__stat"><div className="user-home__stat-icon"><TrendingUp size={22} aria-hidden="true" /></div><div><p className="user-home__stat-value">{overallProgress}%</p><p className="user-home__stat-label">Overall progress</p></div></div>
        </div>
        {data.learningStats && typeof data.learningStats.currentStreak === 'number' && <p className="user-home__meta user-home__streak"><Target size={14} className="inline" aria-hidden="true" /> Current streak: {data.learningStats.currentStreak} {data.learningStats.currentStreak === 1 ? 'day' : 'days'}</p>}
      </section>

      <section className="user-home__section" aria-labelledby="continue-heading">
        <div className="user-home__heading"><h2 className="user-home__title" id="continue-heading">Continue learning</h2><Link className="user-home__link" to="/my-courses">See all <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {inProgress.filter((item) => item.course_id !== resumeEnrollment?.course_id).slice(0, 2).length > 0
          ? <div className="user-home__compact-list">{inProgress.filter((item) => item.course_id !== resumeEnrollment?.course_id).slice(0, 2).map((item) => {
            const progress = data.progress[item.course_id];
            return <Link className="user-home__compact" key={item.id} to={'/learn/' + item.course_id + (progress?.next_lesson_id ? '/' + encodeURIComponent(progress.next_lesson_id) : '')}>
              <Cover course={item.course} className="user-home__compact-cover" />
              <div><h3 className="user-home__compact-title">{item.course.title}</h3><p className="user-home__meta">{progress?.completed_count ?? 0} of {progress?.total_lessons || '—'} lessons · {progress?.percentage ?? 0}%</p></div>
              <span className="user-home__link user-home__compact-action">Continue <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>;
          })}</div>
          : <p className="user-home__meta">Your other in-progress courses will appear here.</p>}
      </section>

      <section className="user-home__section" aria-labelledby="picked-heading">
        <div className="user-home__heading"><div><h2 className="user-home__title" id="picked-heading">Picked for you</h2><p className="user-home__meta">Courses you haven’t enrolled in yet.</p></div><Link className="user-home__link" to="/courses">See all <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {recommendations.length > 0
          ? <div className="user-home__course-grid">{recommendations.map((course) => {
            const relatedCategory = resumeEnrollment?.course.category;
            const reason = relatedCategory && course.category?.toLowerCase() === relatedCategory.toLowerCase()
              ? 'Because you’re learning ' + relatedCategory
              : course.category ? 'Explore ' + course.category : 'Explore this learning path';
            return <div key={course.id} className="min-w-0"><p className="user-home__reason">{reason}</p><CourseCard course={course} /></div>;
          })}</div>
          : <div className="user-home__empty"><div className="user-home__empty-icon"><BookOpen size={24} aria-hidden="true" /></div><h3>{data.courses.length ? 'You’re enrolled in all courses shown' : 'No courses available right now'}</h3><p>{data.courses.length ? 'Explore the full catalog to find another topic.' : 'Try again shortly or visit Explore to check the catalog.'}</p><Link className="user-home__button" to="/courses">Explore <ArrowRight size={16} aria-hidden="true" /></Link>{sectionErrors.length > 0 && <button className="user-home__link" type="button" onClick={() => void loadHome(true)}>Retry recommendations</button>}</div>}
      </section>
    </div>
  </main>;
}
