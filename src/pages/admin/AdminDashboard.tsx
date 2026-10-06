import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Course, Profile, Enrollment } from '@/types';
import PageHeader from '@/components/PageHeader';
import {
  Users,
  BookOpen,
  GraduationCap,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalCourses: 0,
    publishedCourses: 0,
    totalEnrollments: 0,
    activeEnrollments: 0,
    completedEnrollments: 0,
  });
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [recentUsers, setRecentUsers] = useState<Profile[]>([]);
  const [recentEnrollments, setRecentEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [usersRes, coursesRes, enrRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('courses').select('*'),
        supabase.from('enrollments').select('*, course:courses(*)'),
      ]);

      const users = (usersRes.data as Profile[]) || [];
      const courses = (coursesRes.data as Course[]) || [];
      const enrollments = (enrRes.data as (Enrollment & { course: Course })[]) || [];

      setStats({
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.is_active).length,
        totalCourses: courses.length,
        publishedCourses: courses.filter((c) => c.is_published).length,
        totalEnrollments: enrollments.length,
        activeEnrollments: enrollments.filter((e) => e.status === 'active').length,
        completedEnrollments: enrollments.filter((e) => e.status === 'completed').length,
      });

      setRecentCourses(
        courses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
      );
      setRecentUsers(
        users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
      );
      setRecentEnrollments(
        enrollments
          .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime())
          .slice(0, 5)
      );

      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  const statCards = [
    { icon: Users, label: 'Total Users', value: stats.totalUsers, sub: `${stats.activeUsers} active`, color: 'bg-blue-50 text-blue-600', link: '/admin/users' },
    { icon: BookOpen, label: 'Total Courses', value: stats.totalCourses, sub: `${stats.publishedCourses} published`, color: 'bg-green-50 text-green-600', link: '/admin/courses' },
    { icon: GraduationCap, label: 'Enrollments', value: stats.totalEnrollments, sub: `${stats.activeEnrollments} active`, color: 'bg-amber-50 text-amber-600', link: '/admin/analytics' },
    { icon: TrendingUp, label: 'Completed', value: stats.completedEnrollments, sub: 'course completions', color: 'bg-purple-50 text-purple-600', link: '/admin/analytics' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform overview and quick actions"
      />

      {/* Stat Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            to={stat.link}
            className="card group p-5 transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500">{stat.label}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">{stat.sub}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link to="/admin/courses" className="card group flex items-center gap-4 p-5 transition-all hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Manage Courses</p>
            <p className="text-sm text-slate-500">Create and edit courses</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
        </Link>
        <Link to="/admin/users" className="card group flex items-center gap-4 p-5 transition-all hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
            <Users className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Manage Users</p>
            <p className="text-sm text-slate-500">View and manage user accounts</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-green-600 transition-colors" />
        </Link>
        <Link to="/admin/analytics" className="card group flex items-center gap-4 p-5 transition-all hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
            <TrendingUp className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">View Analytics</p>
            <p className="text-sm text-slate-500">Platform metrics and insights</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Recent Courses */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Courses</h2>
            <Link to="/admin/courses" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recentCourses.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No courses yet.</p>
            ) : (
              recentCourses.map((course) => (
                <Link
                  key={course.id}
                  to={`/admin/courses/${course.id}`}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{course.title}</p>
                    <p className="text-xs text-slate-500">{course.category} • {formatDate(course.created_at)}</p>
                  </div>
                  <span className={`badge ${course.is_published ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {course.is_published ? 'Published' : 'Draft'}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Enrollments */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Enrollments</h2>
            <Link to="/admin/analytics" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recentEnrollments.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No enrollments yet.</p>
            ) : (
              recentEnrollments.map((enr) => (
                <div key={enr.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {enr.course?.title || 'Unknown course'}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(enr.enrolled_at)}</p>
                  </div>
                  <span className={`badge ${
                    enr.status === 'active' ? 'bg-blue-50 text-blue-700' :
                    enr.status === 'completed' ? 'bg-green-50 text-green-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {enr.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                    {enr.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
