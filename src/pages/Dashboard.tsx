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
  const [roadmaps, setRoadmaps] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      if (!profile) return;
      try {
        const [enrollmentData, courseData, roadmapData] = await Promise.all([
          apiFetch('/api/enrollments'),
          apiFetch('/api/courses?limit=3'),
          apiFetch('/api/roadmaps'),
        ]);

        const active = (enrollmentData.enrollments ?? [])
          .filter((item: any) => item.status === 'active')
          .map(mapEnrollment)
          .filter((item: Enrollment) => item.course) as (Enrollment & { course: Course })[];

        setEnrollments(active);
        setPublishedCourses((courseData.courses ?? []).map(mapCourse));
        setRoadmaps(roadmapData.roadmaps ?? []);

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

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title={`Welcome back, ${profile?.name || 'Learner'}!`} subtitle="Pick up where you left off and keep growing" />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}><stat.icon className="h-6 w-6" /></div>
              <div><p className="text-2xl font-bold text-slate-900">{stat.value}</p><p className="text-sm text-slate-500">{stat.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Continue Learning</h2><Link to="/my-courses" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600">View all <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="mt-4">
          {continueLearning.length === 0 ? (
            <div className="card p-8"><EmptyState icon={<GraduationCap className="h-8 w-8" />} title="No courses in progress" description="Enroll in a course to start your learning journey." action={<Link to="/courses" className="btn-primary">Browse Courses</Link>} /></div>
          ) : (
            <div className="space-y-3">
              {continueLearning.slice(0, 3).map((enr) => {
                const prog = progressMap[enr.course_id];
                return <div key={enr.id} className="card flex items-center gap-4 p-4">
                  <div className="hidden h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 sm:flex"><BookOpen className="h-7 w-7 text-white" /></div>
                  <div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-slate-900">{enr.course?.title}</h3><div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${prog?.percentage || 0}%` }} /></div><span className="text-xs font-medium text-slate-600">{prog?.percentage || 0}%</span></div></div>
                  <Link to={`/learn/${enr.course_id}`} className="btn-primary flex-shrink-0"><Play className="h-4 w-4" />Resume</Link>
                </div>;
              })}
            </div>
          )}
        </div>
      </div>

      {roadmaps.length > 0 && <div className="mt-10">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Your AI Roadmaps</h2><Link to="/courses" className="text-sm font-semibold text-blue-600">Build another</Link></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {roadmaps.slice(0, 4).map((roadmap) => <div key={roadmap._id} className="card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">AI Learning Roadmap</p><h3 className="mt-1 font-semibold text-slate-900">{roadmap.canonicalTopic || roadmap.course?.title}</h3><p className="mt-1 text-sm text-slate-500">{roadmap.course?.description}</p><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{width: `${roadmap.progress?.percentage || 0}%`}} /></div><span className="text-xs font-semibold text-slate-600">{roadmap.progress?.percentage || 0}%</span></div></div>)}
        </div>
      </div>}

      <div className="mt-10">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Recommended for You</h2><Link to="/courses" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600">View all <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="mt-4">
          {publishedCourses.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No courses available yet.</p> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{publishedCourses.map((course) => <CourseCard key={course.id} course={course} />)}</div>}
        </div>
      </div>
    </div>
  );
}
