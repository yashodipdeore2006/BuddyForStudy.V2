import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import type { Course, Enrollment, Progress } from '@/types';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { GraduationCap, Play, Clock, Map } from 'lucide-react';
import { formatDate } from '@/lib/utils';

function mapCourse(raw: any): Course {
  return { id: String(raw._id ?? raw.id), title: raw.title, slug: raw.slug, description: raw.description, category: raw.category, level: raw.level, duration: String(raw.duration ?? ''), thumbnail: raw.thumbnail ?? null, learning_outcomes: raw.learningOutcomes ?? [], modules: raw.modules ?? [], is_published: raw.isPublished ?? true, pricing: raw.pricing, created_by: raw.createdBy ?? null, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '' };
}
function mapEnrollment(raw: any): Enrollment {
  return { id: String(raw._id ?? raw.id), user_id: String(raw.user ?? raw.user_id), course_id: String(raw.course?._id ?? raw.course_id), status: raw.status, enrolled_at: raw.enrolledAt ?? raw.enrolled_at, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '', course: raw.course ? mapCourse(raw.course) : undefined };
}
function mapProgress(raw: any): Progress {
  return { id: String(raw._id ?? raw.id), user_id: String(raw.user ?? raw.user_id), course_id: String(raw.course ?? raw.course_id), completed_lessons: (raw.completedLessons ?? []).map((x: any) => ({ lessonId: String(x.lessonId), type: x.type, completedAt: x.completedAt })), completed_count: raw.completedCount ?? 0, total_lessons: raw.totalLessons ?? 0, percentage: raw.percentage ?? 0, last_lesson_id: raw.lastLessonId ?? null, last_accessed_at: raw.lastAccessedAt ?? null, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '' };
}

export default function MyCourses() {
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await apiFetch('/api/enrollments');
        const all = (data.enrollments ?? []).map(mapEnrollment).filter((e: Enrollment) => e.course) as (Enrollment & { course: Course })[];
        setEnrollments(all);
        const entries = await Promise.all(all.map(async (e) => {
          try { const p = await apiFetch(`/api/progress/${e.course_id}`); return [e.course_id, mapProgress(p.progress)] as const; } catch { return null; }
        }));
        const pMap: Record<string, Progress> = {};
        entries.forEach((entry) => { if (entry) pMap[entry[0]] = entry[1]; });
        setProgressMap(pMap);
      } catch (error) {
        console.error('Failed to load courses:', error);
      } finally { setLoading(false); }
    }
    fetchData();
  }, []);

  const filtered = enrollments.filter((e) => e.status === filter);

  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader title="My Learning" subtitle="Your enrolled courses, progress, and learning roadmaps" />

    <div className="mt-6 border-b border-slate-200">
      <div className="flex gap-6">
        {(['active', 'completed'] as const).map((tab) => {
          const count = enrollments.filter((e) => e.status === tab).length;
          return <button key={tab} onClick={() => setFilter(tab)} className={`relative pb-3 text-sm font-medium ${filter === tab ? 'text-blue-600' : 'text-slate-500'}`}>
            {tab === 'active' ? 'In Progress' : 'Completed'} ({count})
            {filter === tab && <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-600" />}
          </button>;
        })}
      </div>
    </div>

    <div className="mt-8">
      {loading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div> :
      filtered.length === 0 ? <EmptyState icon={<GraduationCap className="h-8 w-8" />} title={filter === 'active' ? 'No active courses' : 'No completed courses yet'} description={filter === 'active' ? 'Browse the course catalog and enroll in your first course.' : 'Complete your enrolled courses to see them here.'} action={filter === 'active' ? <Link to="/courses" className="btn-primary">Browse Courses</Link> : undefined} /> :
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((enr) => {
        const pct = progressMap[enr.course_id]?.percentage ?? 0;
        return <div key={enr.id} className="bfs-course-card group flex h-full min-h-[400px] flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-colors duration-200 hover:bg-slate-50">
          <Link to={`/courses/${enr.course_id}/roadmap`} className="relative h-[138px] shrink-0 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600">
            {enr.course!.thumbnail ? <img src={enr.course!.thumbnail} alt={enr.course!.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-white"><GraduationCap className="h-10 w-10 opacity-80" /></div>}
            <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700">Course Roadmap</div>
          </Link>

          <div className="flex flex-1 flex-col p-4">
            <span className="text-xs font-medium text-blue-600">{enr.course!.category}</span>
            <Link to={`/courses/${enr.course_id}/roadmap`}>
              <h3 className="mt-2 line-clamp-2 min-h-[2.65rem] text-[15px] font-extrabold leading-[1.32] tracking-[-.02em] text-slate-900 hover:text-blue-700">{enr.course!.title}</h3>
            </Link>
            <p className="mt-2 line-clamp-2 min-h-[2.5rem] flex-1 text-xs leading-5 text-slate-500">{enr.course!.description}</p>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Progress</span><span className="font-medium">{pct}%</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" />Enrolled {formatDate(enr.enrolled_at)}</span>
              <Link to={`/courses/${enr.course_id}/roadmap`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                <Map className="h-3.5 w-3.5" />Roadmap
              </Link>
            </div>

            <Link to={`/learn/${enr.course_id}`} className="btn-primary mt-3 w-full">
              <Play className="h-3.5 w-3.5" />{pct > 0 ? 'Continue Learning' : 'Start Learning'}
            </Link>
          </div>
        </div>;
      })}</div>}
    </div>
  </div>;
}
