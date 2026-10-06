import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Enrollment, Progress, Course } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import {
  BookOpen,
  GraduationCap,
  Trophy,
  TrendingUp,
  ArrowRight,
  Play,
} from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [publishedCourses, setPublishedCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!profile) return;

      const [enrRes, coursesRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('*, course:courses(*)')
          .eq('user_id', profile.id)
          .eq('status', 'active')
          .order('enrolled_at', { ascending: false }),
        supabase
          .from('courses')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const activeEnrollments = (enrRes.data as (Enrollment & { course: Course })[]) || [];
      setEnrollments(activeEnrollments);
      setPublishedCourses((coursesRes.data as Course[]) || []);

      // Fetch progress for each enrolled course
      if (activeEnrollments.length > 0) {
        const progRes = await supabase
          .from('progress')
          .select('*')
          .eq('user_id', profile.id)
          .in(
            'course_id',
            activeEnrollments.map((e) => e.course_id)
          );

        const pMap: Record<string, Progress> = {};
        (progRes.data as Progress[])?.forEach((p) => {
          pMap[p.course_id] = p;
        });
        setProgressMap(pMap);
      }

      setLoading(false);
    }
    fetchData();
  }, [profile]);

  const stats = [
    {
      icon: BookOpen,
      label: 'Enrolled Courses',
      value: enrollments.length,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      icon: Trophy,
      label: 'Completed Lessons',
      value: Object.values(progressMap).reduce((sum, p) => sum + p.completed_count, 0),
      color: 'bg-green-50 text-green-600',
    },
    {
      icon: TrendingUp,
      label: 'Avg. Progress',
      value:
        Object.values(progressMap).length > 0
          ? Math.round(
              Object.values(progressMap).reduce((sum, p) => sum + p.percentage, 0) /
                Object.values(progressMap).length
            ) + '%'
          : '0%',
      color: 'bg-amber-50 text-amber-600',
    },
  ];

  const continueLearning = enrollments.filter((e) => {
    const prog = progressMap[e.course_id];
    return prog && prog.percentage < 100;
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={`Welcome back, ${profile?.name || 'Learner'}!`}
        subtitle="Pick up where you left off and keep growing"
      />

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Continue Learning */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Continue Learning</h2>
          <Link
            to="/my-courses"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4">
          {continueLearning.length === 0 ? (
            <div className="card p-8">
              <EmptyState
                icon={<GraduationCap className="h-8 w-8" />}
                title="No courses in progress"
                description="Enroll in a course to start your learning journey."
                action={
                  <Link to="/courses" className="btn-primary">
                    Browse Courses
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {continueLearning.slice(0, 3).map((enr) => {
                const prog = progressMap[enr.course_id];
                return (
                  <div key={enr.id} className="card flex items-center gap-4 p-4">
                    <div className="hidden h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 sm:flex">
                      <BookOpen className="h-7 w-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {enr.course.title}
                      </h3>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${prog?.percentage || 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600">
                          {prog?.percentage || 0}%
                        </span>
                      </div>
                    </div>
                    <Link
                      to={`/learn/${enr.course_id}`}
                      className="btn-primary flex-shrink-0"
                    >
                      <Play className="h-4 w-4" />
                      Resume
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recommended */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Recommended for You</h2>
          <Link
            to="/courses"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4">
          {publishedCourses.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No courses available yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {publishedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
