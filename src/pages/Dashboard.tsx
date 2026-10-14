import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import type { Course, Enrollment, Progress } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { BookOpen, GraduationCap, Trophy, TrendingUp, ArrowRight, Play } from 'lucide-react';

function mapCourse(raw: any): Course {
  return {
    id: String(raw._id ?? raw.id),
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    category: raw.category,
    level: raw.level,
    duration: String(raw.duration ?? ''),
    thumbnail: raw.thumbnail ?? null,
    learning_outcomes: raw.learningOutcomes ?? raw.learning_outcomes ?? [],
    modules: raw.modules ?? [],
    is_published: raw.isPublished ?? raw.is_published ?? true,
    pricing: raw.pricing,
    created_by: raw.createdBy ?? raw.created_by ?? null,
    created_at: raw.createdAt ?? raw.created_at ?? '',
    updated_at: raw.updatedAt ?? raw.updated_at ?? '',
  };
}

function mapEnrollment(raw: any): Enrollment {
  return {
    id: String(raw._id ?? raw.id),
    user_id: String(raw.user ?? raw.user_id),
    course_id: String(raw.course?._id ?? raw.course_id),
    status: raw.status,
    enrolled_at: raw.enrolledAt ?? raw.enrolled_at,
    created_at: raw.createdAt ?? raw.created_at ?? '',
    updated_at: raw.updatedAt ?? raw.updated_at ?? '',
    course: raw.course ? mapCourse(raw.course) : undefined,
  };
}

function mapProgress(raw: any): Progress {
  return {
    id: String(raw._id ?? raw.id),
    user_id: String(raw.user ?? raw.user_id),
    course_id: String(raw.course ?? raw.course_id),
    completed_lessons: (raw.completedLessons ?? raw.completed_lessons ?? []).map((item: any) => ({
      lessonId: String(item.lessonId ?? item.lesson_id),
      type: item.type,
      completedAt: item.completedAt ?? item.completed_at,
    })),
    completed_count: raw.completedCount ?? raw.completed_count ?? 0,
    total_lessons: raw.totalLessons ?? raw.total_lessons ?? 0,
    percentage: raw.percentage ?? 0,
    last_lesson_id: raw.lastLessonId ?? raw.last_lesson_id ?? null,
    last_accessed_at: raw.lastAccessedAt ?? raw.last_accessed_at ?? null,
    created_at: raw.createdAt ?? raw.created_at ?? '',
    updated_at: raw.updatedAt ?? raw.updated_at ?? '',
  };
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [publishedCourses, setPublishedCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [learningStats, setLearningStats] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      if (!profile) return;
      try {
        const [enrollmentData, courseData, achievementData] = await Promise.all([
          apiFetch('/api/enrollments'),
          apiFetch('/api/courses?limit=3'),
          apiFetch('/api/achievements/me'),
        ]);

        const active = (enrollmentData.enrollments ?? [])
          .filter((item: any) => item.status === 'active')
          .map(mapEnrollment)
          .filter((item: Enrollment) => item.course) as (Enrollment & { course: Course })[];

        setEnrollments(active);
        setPublishedCourses((courseData.courses ?? []).map(mapCourse));
        setLearningStats(achievementData.stats ?? null);

        const entries = await Promise.all(
          active.map(async (enrollment) => {
            try {
              const data = await apiFetch(`/api/progress/${enrollment.course_id}`);
              return [enrollment.course_id, mapProgress(data.progress)] as const;
            } catch {
              return null;
            }
          })
        );

        const pMap: Record<string, Progress> = {};
        entries.forEach((entry) => {
          if (entry) pMap[entry[0]] = entry[1];
        });
        setProgressMap(pMap);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [profile]);

  const progressValues = Object.values(progressMap);
  const stats = [
    { icon: BookOpen, label: 'Enrolled Courses', value: enrollments.length, color: 'bg-blue-50 text-blue-600' },
    { icon: Trophy, label: 'Completed Lessons', value: progressValues.reduce((sum, p) => sum + p.completed_count, 0), color: 'bg-green-50 text-green-600' },
    { icon: TrendingUp, label: 'Avg. Progress', value: progressValues.length ? `${Math.round(progressValues.reduce((sum, p) => sum + p.percentage, 0) / progressValues.length)}%` : '0%', color: 'bg-amber-50 text-amber-600' },
  ];

  const continueLearning = enrollments.filter((e) => (progressMap[e.course_id]?.percentage ?? 0) < 100);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>;

  return (
    <div className="bfs-shell py-8 sm:py-10">
      <div className="overflow-hidden rounded-[32px] bg-slate-950 p-6 text-white shadow-[0_24px_70px_rgba(13,18,32,.14)] sm:p-9 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Your learning command center</p>
            <h1 className="mt-3 text-3xl font-medium tracking-[-.03em] sm:text-4xl lg:text-5xl">Welcome back, {profile?.name || 'Learner'}.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Pick up where you left off, keep your streak alive, and turn your next hour into visible progress.</p>
          </div>
          <Link to="/courses" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-blue-50"><BookOpen className="h-4 w-4"/>Explore learning</Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => <div key={stat.label} className="card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-center gap-4"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.color}`}><stat.icon className="h-5 w-5"/></div><div><p className="text-2xl font-extrabold text-slate-900">{stat.value}</p><p className="text-xs font-semibold text-slate-500">{stat.label}</p></div></div></div>)}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 p-6"><div className="flex items-end justify-between gap-4"><div><p className="bfs-eyebrow">Momentum</p><h2 className="mt-2 text-2xl font-extrabold">Continue learning</h2></div><Link to="/my-courses" className="hidden items-center gap-1 text-sm font-bold text-blue-600 sm:inline-flex">View all <ArrowRight className="h-4 w-4"/></Link></div></div>
          <div className="p-4 sm:p-6">
            {continueLearning.length===0?<EmptyState icon={<GraduationCap className="h-8 w-8"/>} title="No courses in progress" description="Enroll in a course to start your learning journey." action={<Link to="/courses" className="btn-primary">Browse Courses</Link>}/>:<div className="space-y-3">{continueLearning.slice(0,3).map(enr=>{const prog=progressMap[enr.course_id];return <div key={enr.id} className="group rounded-[24px] border border-slate-200 bg-white p-5 transition-colors hover:bg-slate-50"><div className="flex items-center gap-4"><div className="hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 sm:flex"><BookOpen className="h-6 w-6 text-white"/></div><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-slate-900">{enr.course?.title}</h3><p className="mt-1 text-xs text-slate-500">{prog?.completed_count||0} lessons completed</p><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${prog?.percentage||0}%`}}/></div><span className="text-xs font-bold text-slate-600">{prog?.percentage||0}%</span></div></div><Link to={`/learn/${enr.course_id}`} className="btn-primary hidden flex-shrink-0 sm:inline-flex"><Play className="h-4 w-4"/>Resume</Link></div></div>})}</div>}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <div className="card p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Current streak</p><p className="mt-2 text-3xl font-extrabold text-orange-500">{learningStats?.currentStreak||0}<span className="ml-1 text-base font-bold">days</span></p><p className="mt-1 text-xs text-slate-500">Longest: {learningStats?.longestStreak||0} days</p></div>
          <div className="card p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Active learning days</p><p className="mt-2 text-3xl font-extrabold text-blue-600">{learningStats?.totalActiveDays||0}</p><p className="mt-1 text-xs text-slate-500">{learningStats?.totalLessonsCompleted||0} lessons completed</p></div>
          <div className="card p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Achievements</p><p className="mt-2 text-3xl font-extrabold text-amber-500">{learningStats?.achievements?.length||0}</p><p className="mt-1 text-xs text-slate-500">{learningStats?.totalCoursesCompleted||0} courses completed</p></div>
        </section>
      </div>

      <section className="mt-8 rounded-[32px] border border-slate-200 bg-white p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-amber-600">Achievements</p><h2 className="mt-1 text-xl font-extrabold">Small wins compound.</h2></div><div className="flex flex-wrap gap-2">{(learningStats?.achievements||[]).length?learningStats.achievements.map((a:any)=><span key={a.key} className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">{a.title}</span>):<span className="text-sm text-slate-500">Complete lessons to unlock your first achievement.</span>}</div></div></section>

      <section className="mt-10"><div className="flex items-end justify-between gap-4"><div><p className="bfs-eyebrow">Keep exploring</p><h2 className="mt-2 text-2xl font-extrabold">Recommended for you</h2></div><Link to="/courses" className="inline-flex items-center gap-1 text-sm font-bold text-blue-600">View all <ArrowRight className="h-4 w-4"/></Link></div><div className="mt-5">{publishedCourses.length===0?<p className="py-8 text-center text-sm text-slate-500">No courses available yet.</p>:<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{publishedCourses.map(course=><CourseCard key={course.id} course={course}/>)}</div>}</div></section>
    </div>
  );
}
