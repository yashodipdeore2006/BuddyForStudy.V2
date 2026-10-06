import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Enrollment, Course, Progress } from '@/types';
import CourseCard from '@/components/CourseCard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { GraduationCap, Play, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function MyCourses() {
  const { profile } = useAuth();
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    async function fetchEnrollments() {
      if (!profile) return;
      const { data } = await supabase
        .from('enrollments')
        .select('*, course:courses(*)')
        .eq('user_id', profile.id)
        .order('enrolled_at', { ascending: false });

      const allEnrollments = (data as (Enrollment & { course: Course })[]) || [];
      setEnrollments(allEnrollments);

      if (allEnrollments.length > 0) {
        const progRes = await supabase
          .from('progress')
          .select('*')
          .eq('user_id', profile.id)
          .in('course_id', allEnrollments.map((e) => e.course_id));

        const pMap: Record<string, Progress> = {};
        (progRes.data as Progress[])?.forEach((p) => {
          pMap[p.course_id] = p;
        });
        setProgressMap(pMap);
      }
      setLoading(false);
    }
    fetchEnrollments();
  }, [profile]);

  const filteredEnrollments = enrollments.filter((e) => e.status === filter);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="My Courses"
        subtitle="Track your enrolled courses and learning progress"
      />

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-200">
        <div className="flex gap-6">
          {(['active', 'completed'] as const).map((tab) => {
            const count = enrollments.filter((e) => e.status === tab).length;
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  filter === tab
                    ? 'text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'active' ? 'In Progress' : 'Completed'} ({count})
                {filter === tab && (
                  <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          </div>
        ) : filteredEnrollments.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-8 w-8" />}
            title={filter === 'active' ? 'No active courses' : 'No completed courses yet'}
            description={
              filter === 'active'
                ? 'Browse the course catalog and enroll in your first course.'
                : 'Complete your enrolled courses to see them here.'
            }
            action={
              filter === 'active' ? (
                <Link to="/courses" className="btn-primary">
                  Browse Courses
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEnrollments.map((enr) => {
              const prog = progressMap[enr.course_id];
              const pct = prog?.percentage || 0;
              return (
                <div key={enr.id} className="card group flex flex-col overflow-hidden">
                  <Link
                    to={`/courses/${enr.course_id}`}
                    className="relative h-40 overflow-hidden bg-gradient-to-br from-blue-500 to-blue-700"
                  >
                    {enr.course.thumbnail && (
                      <img
                        src={enr.course.thumbnail}
                        alt={enr.course.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col p-5">
                    <span className="text-xs font-medium text-blue-600">
                      {enr.course.category}
                    </span>
                    <Link to={`/courses/${enr.course_id}`}>
                      <h3 className="mt-1 font-semibold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1">
                        {enr.course.title}
                      </h3>
                    </Link>
                    <p className="mt-2 text-sm text-slate-500 flex-1 line-clamp-2">
                      {enr.course.description}
                    </p>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>Progress</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        Enrolled {formatDate(enr.enrolled_at)}
                      </span>
                      <Link
                        to={`/learn/${enr.course_id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {pct > 0 ? 'Resume' : 'Start'}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
