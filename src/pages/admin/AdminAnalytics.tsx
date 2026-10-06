import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Course, Enrollment } from '@/types';
import PageHeader from '@/components/PageHeader';
import {
  Users,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  TrendingUp,
  Activity,
  Eye,
  EyeOff,
} from 'lucide-react';

interface Analytics {
  totalUsers: number;
  activeUsers: number;
  totalCourses: number;
  publishedCourses: number;
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [categoryData, setCategoryData] = useState<{ category: string; count: number }[]>([]);
  const [levelData, setLevelData] = useState<{ level: string; count: number }[]>([]);
  const [topCourses, setTopCourses] = useState<{ title: string; enrollments: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [usersRes, coursesRes, enrRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('courses').select('*'),
        supabase.from('enrollments').select('*, course:courses(title)'),
      ]);

      const users = (usersRes.data as Profile[]) || [];
      const courses = (coursesRes.data as Course[]) || [];
      const enrollments = (enrRes.data as (Enrollment & { course: Course })[]) || [];

      setAnalytics({
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.is_active).length,
        totalCourses: courses.length,
        publishedCourses: courses.filter((c) => c.is_published).length,
        totalEnrollments: enrollments.length,
        activeEnrollments: enrollments.filter((e) => e.status === 'active').length,
        completedEnrollments: enrollments.filter((e) => e.status === 'completed').length,
      });

      // Category breakdown
      const catMap: Record<string, number> = {};
      courses.forEach((c) => {
        catMap[c.category] = (catMap[c.category] || 0) + 1;
      });
      setCategoryData(Object.entries(catMap).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count));

      // Level breakdown
      const lvlMap: Record<string, number> = {};
      courses.forEach((c) => {
        lvlMap[c.level] = (lvlMap[c.level] || 0) + 1;
      });
      setLevelData(Object.entries(lvlMap).map(([level, count]) => ({ level, count })));

      // Top courses by enrollment
      const enrCountMap: Record<string, number> = {};
      enrollments.forEach((e) => {
        const title = e.course?.title || 'Unknown';
        enrCountMap[title] = (enrCountMap[title] || 0) + 1;
      });
      setTopCourses(
        Object.entries(enrCountMap)
          .map(([title, enrollments]) => ({ title, enrollments }))
          .sort((a, b) => b.enrollments - a.enrollments)
          .slice(0, 5)
      );

      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading || !analytics) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  const metrics = [
    { icon: Users, label: 'Total Users', value: analytics.totalUsers, sub: `${analytics.activeUsers} active`, color: 'bg-blue-50 text-blue-600' },
    { icon: Activity, label: 'Active Users', value: analytics.activeUsers, sub: `${Math.round((analytics.activeUsers / Math.max(analytics.totalUsers, 1)) * 100)}% of total`, color: 'bg-green-50 text-green-600' },
    { icon: BookOpen, label: 'Total Courses', value: analytics.totalCourses, sub: `${analytics.publishedCourses} published`, color: 'bg-amber-50 text-amber-600' },
    { icon: Eye, label: 'Published Courses', value: analytics.publishedCourses, sub: `${analytics.totalCourses - analytics.publishedCourses} drafts`, color: 'bg-purple-50 text-purple-600' },
    { icon: GraduationCap, label: 'Total Enrollments', value: analytics.totalEnrollments, sub: 'all time', color: 'bg-cyan-50 text-cyan-600' },
    { icon: TrendingUp, label: 'Active Enrollments', value: analytics.activeEnrollments, sub: 'currently learning', color: 'bg-pink-50 text-pink-600' },
    { icon: CheckCircle2, label: 'Completed', value: analytics.completedEnrollments, sub: 'course completions', color: 'bg-emerald-50 text-emerald-600' },
    { icon: EyeOff, label: 'Completion Rate', value: analytics.totalEnrollments > 0 ? `${Math.round((analytics.completedEnrollments / analytics.totalEnrollments) * 100)}%` : '0%', sub: 'of all enrollments', color: 'bg-indigo-50 text-indigo-600' },
  ];

  const maxCategoryCount = Math.max(...categoryData.map((c) => c.count), 1);
  const maxLevelCount = Math.max(...levelData.map((l) => l.count), 1);
  const maxEnrollments = Math.max(...topCourses.map((c) => c.enrollments), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Platform Analytics"
        subtitle="Key metrics and insights across the platform"
      />

      {/* Metric Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="card p-5">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${metric.color}`}>
                <metric.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{metric.value}</p>
                <p className="text-xs text-slate-500">{metric.label}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">{metric.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Category Distribution */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Courses by Category</h2>
          <div className="mt-4 space-y-3">
            {categoryData.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No data available</p>
            ) : (
              categoryData.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{cat.category}</span>
                    <span className="text-slate-500">{cat.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${(cat.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Level Distribution */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Courses by Level</h2>
          <div className="mt-4 space-y-3">
            {levelData.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No data available</p>
            ) : (
              levelData.map((lvl) => {
                const colors: Record<string, string> = {
                  Beginner: 'bg-green-500',
                  Intermediate: 'bg-amber-500',
                  Advanced: 'bg-red-500',
                };
                return (
                  <div key={lvl.level}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{lvl.level}</span>
                      <span className="text-slate-500">{lvl.count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${colors[lvl.level] || 'bg-blue-500'} transition-all`}
                        style={{ width: `${(lvl.count / maxLevelCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Top Courses */}
      <div className="mt-6 card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Most Enrolled Courses</h2>
        <div className="mt-4 space-y-3">
          {topCourses.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No enrollment data yet</p>
          ) : (
            topCourses.map((course, idx) => (
              <div key={course.title} className="flex items-center gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{course.title}</p>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${(course.enrollments / maxEnrollments) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
                  {course.enrollments}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
