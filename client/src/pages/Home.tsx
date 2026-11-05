import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Flame, GraduationCap, RefreshCw, Sparkles, Trophy, TrendingUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import type { Course } from '@/types';
import { getAllLessonsFlat } from '@/lib/courseUtils';
import { pluralize, USER_INTENTS } from '@/lib/intents';
import { useLearningStats } from '@/hooks/useLearningStats';
import CourseCard from '@/components/CourseCard';
import ErrorState from '@/components/ErrorState';
import { CourseGridSkeleton } from '@/components/Skeleton';
import '@/styles/user-home.css';

import { routes } from "@/lib/routes";
type ProgressRecord = {
  course_id: string;
  completed_count: number;
  total_lessons: number;
  percentage: number;
  last_lesson_id?: string | null;
  last_accessed_at?: string | null;
  completed_lesson_ids: string[];
  has_detailed_completion_data: boolean;
  completed_today_count: number;
  next_lesson_id?: string;
  nextLessonTitle?: string;
  remainingDuration?: string;
};
type EnrollmentRecord = { id: string; course_id: string; status: string; course: Course };
type RawHomeCourse = {
  _id?: string; id?: string; title?: string; description?: string; category?: string;
  level?: Course["level"]; duration?: string | number; thumbnail?: string | null;
  learningOutcomes?: string[]; learning_outcomes?: string[]; modules?: Course["modules"];
  lessonCount?: number; lesson_count?: number; isPublished?: boolean; is_published?: boolean;
  pricing?: Course["pricing"]; ratingAverage?: number; rating_average?: number;
  ratingCount?: number; rating_count?: number;
  reviewStats?: { average?: number; count?: number }; stats?: { average?: number; count?: number };
  createdAt?: string; created_at?: string; updatedAt?: string; updated_at?: string;
};
type RawCompletedLesson = { lessonId?: string; lesson_id?: string; completedAt?: string; completed_at?: string };
type RawHomeProgress = {
  completedLessons?: RawCompletedLesson[]; completed_lessons?: RawCompletedLesson[];
  completedCount?: number; completed_count?: number; totalLessons?: number; total_lessons?: number;
  percentage?: number; lastLessonId?: string | null; last_lesson_id?: string | null;
  lastAccessedAt?: string | null; last_accessed_at?: string | null; nextLessonTitle?: string;
  remainingDuration?: string;
};
type RawHomeEnrollment = {
  _id?: string; id?: string; course?: RawHomeCourse | string | null;
  course_id?: string; status?: string;
};
type HomeData = {
  enrollments: EnrollmentRecord[];
  progress: Record<string, ProgressRecord>;
  courses: Course[];
  learningStats: Record<string, unknown> | null;
};

function mapCourse(raw: RawHomeCourse): Course {
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
    // The course details endpoint exposes review aggregates; normalize both API naming conventions
    // here as well so shared CourseCards render the same rating on Home and Explore.
    ratingAverage: Number(raw?.ratingAverage ?? raw?.rating_average ?? raw?.reviewStats?.average ?? raw?.stats?.average ?? 0),
    ratingCount: Number(raw?.ratingCount ?? raw?.rating_count ?? raw?.reviewStats?.count ?? raw?.stats?.count ?? 0),
    created_at: raw?.createdAt ?? raw?.created_at ?? '',
    updated_at: raw?.updatedAt ?? raw?.updated_at ?? '',
  } as Course;
}
function mapProgress(raw: RawHomeProgress, courseId: string, course?: Course): ProgressRecord {
  const completedLessons = Array.isArray(raw?.completedLessons) ? raw.completedLessons : Array.isArray(raw?.completed_lessons) ? raw.completed_lessons : [];
  const completedLessonIds = completedLessons.map((item: RawCompletedLesson) => String(item?.lessonId ?? item?.lesson_id ?? '')).filter(Boolean);
  const completedSet = new Set(completedLessonIds);
  const nextLesson = course ? getAllLessonsFlat(course.modules).find((lesson) => !completedSet.has(String(lesson.id))) : undefined;
  return {
    course_id: courseId,
    completed_today_count: completedLessons.filter((item: RawCompletedLesson) => {
      const completedAt = item.completedAt ?? item.completed_at;
      if (!completedAt) return false;
      const timestamp = new Date(completedAt);
      if (Number.isNaN(timestamp.getTime())) return false;
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    }).length,
    completed_count: Number(raw?.completedCount ?? raw?.completed_count ?? 0),
    total_lessons: Number(raw?.totalLessons ?? raw?.total_lessons ?? 0),
    percentage: Math.max(0, Math.min(100, Number(raw?.percentage ?? 0))),
    last_lesson_id: raw?.lastLessonId ?? raw?.last_lesson_id ?? null,
    last_accessed_at: raw?.lastAccessedAt ?? raw?.last_accessed_at ?? null,
    completed_lesson_ids: completedLessonIds,
    has_detailed_completion_data: Array.isArray(raw?.completedLessons) || Array.isArray(raw?.completed_lessons),
    ...(nextLesson ? { next_lesson_id: nextLesson.id, nextLessonTitle: nextLesson.title } : typeof raw?.nextLessonTitle === 'string' ? { nextLessonTitle: raw.nextLessonTitle } : {}),
    ...(typeof raw?.remainingDuration === 'string' ? { remainingDuration: raw.remainingDuration } : {}),
  };
}
function mapEnrollment(raw: RawHomeEnrollment): EnrollmentRecord | null {
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
  const category = (course.category || '').toLowerCase();
  const palette = /data|analytics|sql|database/.test(category) ? 'data'
    : /design|ui|ux|art/.test(category) ? 'design'
      : /business|finance|marketing/.test(category) ? 'business'
        : /ai|machine|python|program/.test(category) ? 'technology'
          : 'learning';
  const coverWords = course.title.trim().split(/\s+/).slice(0, 2).join(' ') || 'Keep learning';
  return <div className={className}>
    {course.thumbnail && !failed
      ? <img src={course.thumbnail} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <div className={'user-home__image-fallback user-home__image-fallback--' + palette} aria-label={course.title}>
          <BookOpen className="user-home__fallback-icon" aria-hidden="true" size={40} />
          <span className="user-home__fallback-title">{coverWords}</span>
        </div>}
  </div>;
}

export default function Home() {
  const { session, profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<HomeData>({ enrollments: [], progress: {}, courses: [], learningStats: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fatalErrorStatus, setFatalErrorStatus] = useState<number | null>(null);
  const [sectionErrors, setSectionErrors] = useState({ enrollments: '', recommendations: '', stats: '', progress: [] as Array<{ courseId: string; title: string }>, refresh: '' });
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const requestSequence = useRef(0);

  const loadHome = useCallback(async (isRefresh = false) => {
    const requestId = ++requestSequence.current;
    if (!session) {
      setData({ enrollments: [], progress: {}, courses: [], learningStats: null });
      setLoading(false);
      setRefreshing(false);
      setError('');
      setFatalErrorStatus(null);
      setSectionErrors({ enrollments: '', recommendations: '', stats: '', progress: [], refresh: '' });
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    setFatalErrorStatus(null);
    setSectionErrors({ enrollments: '', recommendations: '', stats: '', progress: [], refresh: '' });

    const partialErrors = { enrollments: '', recommendations: '', stats: '', progress: [] as Array<{ courseId: string; title: string }>, refresh: '' };
    const results = await Promise.allSettled([
      apiFetch('/api/enrollments'),
      apiFetch('/api/courses?limit=24'),
      apiFetch('/api/achievements/me'),
    ]);
    const enrollmentResult = results[0];
    const courseResult = results[1];
    const statsResult = results[2];
    const rawEnrollments = enrollmentResult.status === 'fulfilled' ? (enrollmentResult.value.enrollments ?? []) : [];
    if (enrollmentResult.status === 'rejected') partialErrors.enrollments = 'Your enrolled courses could not be loaded.';
    const enrollments = rawEnrollments.map(mapEnrollment)
      .filter((item: EnrollmentRecord | null): item is EnrollmentRecord => Boolean(item))
      .filter((item: EnrollmentRecord) => ['active', 'completed'].includes(item.status));
    const courses = courseResult.status === 'fulfilled'
      ? (courseResult.value.courses ?? []).map(mapCourse).filter((course: Course) => Boolean(course.id))
      : [];
    if (courseResult.status === 'rejected') partialErrors.recommendations = 'Recommended courses could not be loaded.';
    const learningStats = statsResult.status === 'fulfilled' ? (statsResult.value.stats ?? null) : null;
    if (statsResult.status === 'rejected') partialErrors.stats = 'Learning summary is temporarily unavailable.';

    const progressEntries = await Promise.all(enrollments.map(async (enrollment: EnrollmentRecord) => {
      try {
        const response = await apiFetch('/api/progress/' + enrollment.course_id);
        return [enrollment.course_id, mapProgress(response.progress, enrollment.course_id, enrollment.course)] as const;
      } catch {
        partialErrors.progress.push({ courseId: enrollment.course_id, title: enrollment.course.title });
        return null;
      }
    }));
    if (requestId !== requestSequence.current) return;
    const progress: Record<string, ProgressRecord> = {};
    progressEntries.forEach((entry) => { if (entry) progress[entry[0]] = entry[1]; });
    const allPrimarySourcesFailed = enrollmentResult.status === 'rejected' && courseResult.status === 'rejected' && statsResult.status === 'rejected';
    if (allPrimarySourcesFailed) {
      const failedStatuses = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map((result) => result.reason instanceof ApiError ? result.reason.status : 0);
      const status = failedStatuses.includes(403) ? 403 : failedStatuses.includes(404) ? 404 : failedStatuses.includes(401) ? 401 : null;
      if (!isRefresh) {
        setFatalErrorStatus(status);
        setError(status === 403 ? 'Your account does not have permission to access this learning data.' : status === 404 ? 'Some learning data could not be found. It may have moved or been removed.' : 'We couldn’t load your learning home. Check your connection and try again.');
      } else partialErrors.refresh = 'Refresh failed. The last available data is still shown.';
    } else {
      setData((current) => {
        const currentCourseIds = new Set(enrollments.map((item: EnrollmentRecord) => item.course_id));
        const preservedProgress = enrollmentResult.status === 'fulfilled'
          ? Object.fromEntries(Object.entries(current.progress).filter(([courseId]) => currentCourseIds.has(courseId)))
          : current.progress;
        return {
          enrollments: enrollmentResult.status === 'fulfilled' ? enrollments : current.enrollments,
          progress: { ...preservedProgress, ...progress },
          courses: courseResult.status === 'fulfilled' ? courses : current.courses,
          learningStats: statsResult.status === 'fulfilled' ? learningStats : current.learningStats,
        };
      });
    }
    setSectionErrors(partialErrors);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useEffect(() => {
    if (!authLoading) void loadHome();
    return () => { requestSequence.current += 1; };
  }, [authLoading, loadHome]);
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
  const {
    completedLessons,
    overallProgress,
    completedToday,
    dailyGoalLessons,
    dailyGoalPercent,
    streak,
    longestStreak,
    sevenDayStrip,
    freezeUsedThisWeek,
    freezeAvailable,
    achievements,
  } = useLearningStats(data.progress, data.learningStats);
  const firstName = (profile?.name ?? session?.user?.name ?? 'learner').trim().split(/\s+/)[0] || 'learner';
  const resumeUrl = resumeEnrollment
    ? '/learn/' + resumeEnrollment.course_id + (resumeProgress?.next_lesson_id ? '/' + encodeURIComponent(resumeProgress.next_lesson_id) : '')
    : '/courses';

  if (authLoading || loading) {
    return <main className="user-home" id="main-content"><div className="user-home__shell user-home__stack">
      <div><div className="user-home__skeleton user-home__skeleton--title" /><div className="user-home__skeleton user-home__skeleton--line" /></div>
      <SkeletonResume />
      <div className="user-home__learning-widgets" aria-hidden="true">{[1, 2, 3, 4].map((item) => <div key={item} className="user-home__goal-card"><div className="user-home__skeleton" style={{ width: 56, height: 56, flex: "0 0 auto", borderRadius: "var(--r-full)" }} /><div style={{ minWidth: 0, flex: 1 }}><div className="user-home__skeleton user-home__skeleton--title" /><div className="user-home__skeleton user-home__skeleton--line" /></div></div>)}</div>
      <CourseGridSkeleton count={4} />
    </div></main>;
  }
  if (error) {
    const accessError = fatalErrorStatus === 403 || fatalErrorStatus === 404;
    return <main className="user-home" id="main-content"><div className="user-home__shell">
      {accessError
        ? <ErrorState title={fatalErrorStatus === 403 ? 'Learning data unavailable' : 'Learning data not found'} description={error} action={<Link className="user-home__button" to={routes.home()}>Go to Home <ArrowRight size={16} aria-hidden="true" /></Link>} />
        : <ErrorState title="Your Home didn’t load" description={error} onRetry={() => void loadHome()} />}
    </div></main>;
  }

  return <main className="user-home" id="main-content">
    {refreshing && <div className="user-home__refreshing" role="progressbar" aria-label="Refreshing Home" />}
    <div className="user-home__shell user-home__stack">
      {!online && <div className="user-home__alert user-home__alert--info" role="status"><Clock3 aria-hidden="true" size={18} /><span>You’re offline. Some learning data may be out of date; reconnect to refresh.</span></div>}
      <section className="user-home__greeting" aria-labelledby="home-title">
        <div>
          <h1 className="user-home__page-title" id="home-title">Welcome back, {firstName}</h1>
          <p className="user-home__muted">{resumeEnrollment && resumeProgress && resumeProgress.total_lessons > 0
            ? 'You’re ' + Math.max(0, resumeProgress.total_lessons - resumeProgress.completed_count) + ' ' + pluralize(Math.max(0, resumeProgress.total_lessons - resumeProgress.completed_count), 'lesson') + ' from finishing ' + resumeEnrollment.course.title + '.'
            : 'Your next step is ready when you are.'}</p>
        </div>
      </section>

      {sectionErrors.refresh && <div className="user-home__alert user-home__alert--error" role="alert">
        <span>{sectionErrors.refresh}</span>
        <button className="user-home__link" type="button" onClick={() => void loadHome(true)}><RefreshCw size={14} aria-hidden="true" /> {USER_INTENTS.retry.label}</button>
      </div>}

      <section className="user-home__section" aria-labelledby="resume-heading">
        <div className="user-home__heading"><h2 className="user-home__title" id="resume-heading">Pick up where you left off</h2></div>
        {(sectionErrors.enrollments || (resumeEnrollment && sectionErrors.progress.some((item) => item.courseId === resumeEnrollment.course_id))) && <div className="user-home__alert user-home__alert--error" role="alert"><span>{[sectionErrors.enrollments, ...sectionErrors.progress.filter((item) => item.courseId === resumeEnrollment?.course_id).map((item) => 'Progress for ' + item.title + ' could not be loaded.')].filter(Boolean).join(" ")}</span><button className="user-home__link" type="button" onClick={() => void loadHome(true)}><RefreshCw size={14} aria-hidden="true" /> {USER_INTENTS.retry.label}</button></div>}
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
              <div className="user-home__progress-label"><span>{resumeProgress.completed_count} of {resumeProgress.total_lessons || '—'} {pluralize(resumeProgress.total_lessons || 0, 'lesson')}</span><span>{resumeProgress.percentage}%</span></div>
              <div className="user-home__progress-track" role="progressbar" aria-label={resumeEnrollment.course.title + ' progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={resumeProgress.percentage}>
                <div className="user-home__progress-fill" style={{ width: resumeProgress.percentage + '%' }} />
              </div>
            </div>
            {resumeProgress.remainingDuration && <p className="user-home__meta">About {resumeProgress.remainingDuration} left</p>}
            <Link className="user-home__button" to={resumeUrl}>{USER_INTENTS.continue.label} <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </article> : resumeEnrollment && sectionErrors.progress.some((item) => item.courseId === resumeEnrollment.course_id) ? <div className="user-home__empty">
          <div className="user-home__empty-icon"><Clock3 size={24} aria-hidden="true" /></div>
          <h3>Progress is temporarily unavailable</h3>
          <p>Your course is still here, but we couldn’t load its latest progress.</p>
          <button className="user-home__button" type="button" onClick={() => void loadHome(true)}>{USER_INTENTS.retry.label} <RefreshCw size={16} aria-hidden="true" /></button>
        </div> : <div className="user-home__empty">
          <div className="user-home__empty-icon"><GraduationCap size={24} aria-hidden="true" /></div>
          <h3>{session ? 'No course in progress yet' : 'Your learning journey starts here'}</h3>
          <p>{session ? 'Explore a course or build a learning path. Your next step will appear here.' : 'Sign in to keep your courses, progress and next lesson together.'}</p>
          <div className="user-home__actions"><Link className="user-home__button" to={routes.explore()}>{USER_INTENTS.explore.label} <ArrowRight size={16} aria-hidden="true" /></Link><Link className="user-home__button user-home__button--secondary" to={routes.buildPath()}><Sparkles size={16} aria-hidden="true" /> {USER_INTENTS.buildPath.label}</Link></div>
        </div>}
      </section>

      <section className="user-home__panel" aria-labelledby="stats-heading">
        <div className="user-home__heading"><h2 className="user-home__title" id="stats-heading">Your learning at a glance</h2><Link className="user-home__link" to={routes.profile()}>{USER_INTENTS.seeAll.label} <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {sectionErrors.stats && <div className="user-home__alert user-home__alert--error" role="alert"><span>{sectionErrors.stats}</span><button className="user-home__link" type="button" onClick={() => void loadHome(true)}><RefreshCw size={14} aria-hidden="true" /> {USER_INTENTS.retry.label}</button></div>}
        <div className="user-home__learning-widgets">
          <article className="user-home__goal-card" aria-labelledby="daily-goal-heading">
            <div className="user-home__goal-ring" role="progressbar" aria-label="Daily learning goal" aria-valuemin={0} aria-valuemax={dailyGoalLessons} aria-valuenow={Math.min(completedToday, dailyGoalLessons)}>
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle className="user-home__goal-ring-track" cx="32" cy="32" r="25" />
                <circle className="user-home__goal-ring-fill" cx="32" cy="32" r="25" strokeDasharray={String(2 * Math.PI * 25)} strokeDashoffset={String(2 * Math.PI * 25 * (1 - dailyGoalPercent / 100))} />
              </svg>
              <span>{dailyGoalPercent}%</span>
            </div>
            <div className="user-home__goal-copy">
              <h3 id="daily-goal-heading">Daily goal</h3>
              <p>{completedToday} of {dailyGoalLessons} {pluralize(dailyGoalLessons, 'lesson')} today</p>
              <Link to={routes.settings() + "#learning-goals"} className="user-home__link">{USER_INTENTS.editGoal.label} <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </article>
          <article className="user-home__streak-card" aria-labelledby="streak-heading">
            <div className="user-home__streak-top">
              <span className="user-home__streak-icon"><Flame size={20} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h3 id="streak-heading">{streak}-day streak</h3>
                <p>Longest: {longestStreak} {pluralize(longestStreak, 'day')}</p>
              </div>
            </div>
            <div className="user-home__week-strip" role="group" aria-label="Learning activity for the last seven days">
              {sevenDayStrip.map((day) => <div className="user-home__week-day" key={day.dateKey}>
                <span>{day.label}</span>
                <span className={day.active ? 'user-home__week-dot user-home__week-dot--active' : day.isToday ? 'user-home__week-dot user-home__week-dot--today' : 'user-home__week-dot'} role="img" aria-label={day.dateKey + (day.active ? ', studied' : ', no completed lesson recorded')} />
              </div>)}
            </div>
            <p className="user-home__streak-nudge">{freezeUsedThisWeek ? 'Your weekly streak freeze has been used. Keep going when you can.' : freezeAvailable ? 'Your weekly freeze can preserve your streak when you study again.' : streak > 0 ? 'A small step today keeps your learning moving.' : 'Start a lesson today to begin your streak.'}</p>
          </article>
          <article className="user-home__stat user-home__stat--tile">
            <div className="user-home__stat-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
            <div><p className="user-home__stat-value">{completedLessons}</p><p className="user-home__stat-label">Lessons done</p></div>
          </article>
          <article className="user-home__stat user-home__stat--tile">
            <div className="user-home__stat-icon"><TrendingUp size={22} aria-hidden="true" /></div>
            <div><p className="user-home__stat-value">{overallProgress}%</p><p className="user-home__stat-label">Overall progress</p></div>
          </article>
        </div>
      </section>

      <section className="user-home__section" aria-labelledby="continue-heading">
        <div className="user-home__heading"><h2 className="user-home__title" id="continue-heading">Continue learning</h2><Link className="user-home__link" to={routes.myLearning()}>See all <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {sectionErrors.progress.some((item) => item.courseId !== resumeEnrollment?.course_id) && <div className="user-home__alert user-home__alert--error" role="alert"><span>Progress for {sectionErrors.progress.filter((item) => item.courseId !== resumeEnrollment?.course_id).map((item) => item.title).join(", ")} is unavailable.</span><button className="user-home__link" type="button" onClick={() => void loadHome(true)}>{USER_INTENTS.retry.label}</button></div>}
        {inProgress.filter((item) => item.course_id !== resumeEnrollment?.course_id).slice(0, 2).length > 0
          ? <div className="user-home__compact-list">{inProgress.filter((item) => item.course_id !== resumeEnrollment?.course_id).slice(0, 2).map((item) => {
            const progress = data.progress[item.course_id];
            return <Link className="user-home__compact" key={item.id} to={routes.learn(item.course_id, progress?.next_lesson_id)}>
              <Cover course={item.course} className="user-home__compact-cover" />
              <div><h3 className="user-home__compact-title">{item.course.title}</h3><p className="user-home__meta">{progress?.completed_count ?? 0} of {progress?.total_lessons || '—'} {pluralize(progress?.total_lessons ?? 0, 'lesson')} · {progress?.percentage ?? 0}%</p></div>
              <span className="user-home__link user-home__compact-action">{USER_INTENTS.continue.label} <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>;
          })}</div>
          : <p className="user-home__meta">Your other in-progress courses will appear here.</p>}
      </section>

      <section className="user-home__section" aria-labelledby="badges-heading">
        <div className="user-home__heading"><div><h2 className="user-home__title" id="badges-heading">Badges</h2><p className="user-home__meta">Small milestones that reflect your learning.</p></div><Link className="user-home__link" to={routes.profile()}>See all <ArrowRight size={14} aria-hidden="true" /></Link></div>
        <div className="user-home__badge-grid">
          {[
            { key: 'first_lesson', title: 'First step', description: 'Complete your first lesson.', current: completedLessons, target: 1, icon: BookOpen },
            { key: 'three_day_streak', title: 'On a roll', description: 'Build a 3-day learning streak.', current: streak, target: 3, icon: Flame },
            { key: 'ten_lessons', title: 'Getting serious', description: 'Complete 10 lessons.', current: completedLessons, target: 10, icon: Trophy },
          ].map((badge) => {
            const unlocked = achievements.some((item) => item.key === badge.key);
            const Icon = badge.icon;
            const badgePercent = unlocked ? 100 : Math.min(100, Math.round(badge.current / badge.target * 100));
            return <article key={badge.key} className={unlocked ? 'user-home__badge-card user-home__badge-card--unlocked' : 'user-home__badge-card'}>
              <span className="user-home__badge-icon"><Icon size={20} aria-hidden="true" /></span>
              <div className="user-home__badge-copy"><h3>{badge.title}</h3><p>{badge.description}</p></div>
              <span className="user-home__badge-state">{unlocked ? 'Earned' : 'In progress'}</span>
              {!unlocked && <div className="user-home__badge-progress" role="progressbar" aria-label={badge.title + ' progress'} aria-valuemin={0} aria-valuemax={badge.target} aria-valuenow={Math.min(badge.current, badge.target)}><span style={{ width: badgePercent + '%' }} /></div>}
            </article>;
          })}
        </div>
      </section>

      <section className="user-home__section" aria-labelledby="picked-heading">
        <div className="user-home__heading"><div><h2 className="user-home__title" id="picked-heading">Picked for you</h2><p className="user-home__meta">Courses you haven’t enrolled in yet.</p></div><Link className="user-home__link" to={routes.explore()}>See all <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {(sectionErrors.recommendations || sectionErrors.enrollments)
          ? <div className="user-home__alert user-home__alert--error" role="alert"><span>{sectionErrors.enrollments ? 'Recommendations are paused until your enrollment list loads.' : sectionErrors.recommendations}</span><button className="user-home__link" type="button" onClick={() => void loadHome(true)}>{USER_INTENTS.retry.label}</button></div>
          : recommendations.length > 0
          ? <div className="user-home__course-grid">{recommendations.map((course) => {
            const relatedCategory = resumeEnrollment?.course.category;
            const reason = relatedCategory && course.category?.toLowerCase() === relatedCategory.toLowerCase()
              ? 'Because you’re learning ' + relatedCategory
              : course.category ? 'Explore ' + course.category : 'Explore this learning path';
            return <div key={course.id} className="min-w-0"><CourseCard course={course} variant="recommended" reason={reason} /></div>;
          })}</div>
          : <div className="user-home__empty"><div className="user-home__empty-icon"><BookOpen size={24} aria-hidden="true" /></div><h3>{data.courses.length ? 'You’re enrolled in all courses shown' : 'No courses available right now'}</h3><p>{data.courses.length ? 'Explore the full catalog to find another topic.' : 'Try again shortly or visit Explore to check the catalog.'}</p><Link className="user-home__button" to={routes.explore()}>{USER_INTENTS.explore.label} <ArrowRight size={16} aria-hidden="true" /></Link></div>}
      </section>
    </div>
  </main>;
}
