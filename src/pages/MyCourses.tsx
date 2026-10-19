import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import type { Course, Enrollment } from '@/types';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { GraduationCap, Play, Map, Clock, CheckCircle2 } from 'lucide-react';

function mapCourse(raw: any): Course {
  return { id: String(raw._id ?? raw.id), title: raw.title, slug: raw.slug, description: raw.description, category: raw.category, level: raw.level, duration: String(raw.duration ?? ''), thumbnail: raw.thumbnail ?? null, learning_outcomes: raw.learningOutcomes ?? [], modules: raw.modules ?? [], is_published: raw.isPublished ?? true, pricing: raw.pricing, created_by: raw.createdBy ?? null, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '' };
}
function mapEnrollment(raw: any): Enrollment {
  return { id: String(raw._id ?? raw.id), user_id: String(raw.user ?? raw.user_id), course_id: String(raw.course?._id ?? raw.course_id), status: raw.status, enrolled_at: raw.enrolledAt ?? raw.enrolled_at, created_at: raw.createdAt ?? '', updated_at: raw.updatedAt ?? '', course: raw.course ? mapCourse(raw.course) : undefined };
}

export default function MyCourses() {
  const [enrollments, setEnrollments] = useState<(Enrollment & { course: Course })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await apiFetch('/api/enrollments');
        const all = (data.enrollments ?? []).map(mapEnrollment).filter((e: Enrollment) => e.course) as (Enrollment & { course: Course })[];
        setEnrollments(all);
      } catch (error) {
        console.error('Failed to load courses:', error);
      } finally { setLoading(false); }
    }
    fetchData();
  }, []);

  const filtered = enrollments.filter((e) => e.status === filter);

  return <div className="bfs-shell py-8 sm:py-10">
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
      <div className="bfs-course-grid">{filtered.map((enr) => {
        const course = enr.course;
        const roadmapUrl = `/courses/${enr.course_id}/roadmap`;
        const isCompleted = enr.status === 'completed';
        return <article key={enr.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-950/5">
          <Link to={roadmapUrl} className="relative block overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700" aria-label={`Open ${course.title}`}>
            <div className="aspect-[16/9] w-full">
              {course.thumbnail ? <img src={course.thumbnail} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center"><GraduationCap className="h-12 w-12 text-white/90" /></div>}
            </div>
            <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-violet-800">{isCompleted ? 'Completed' : 'Enrolled'}</span>
          </Link>
          <div className="flex flex-1 flex-col p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-extrabold uppercase tracking-[.16em] text-violet-600">{course.category || 'Learning course'}</span>
              {course.level && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{course.level}</span>}
            </div>
            <Link to={roadmapUrl} className="line-clamp-2 min-h-[2.7rem] text-[15px] font-extrabold leading-[1.35] tracking-[-.02em] text-slate-900 hover:text-violet-700">{course.title}</Link>
            <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-slate-500">{course.description || 'Continue your learning journey with this course.'}</p>
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><Clock className="h-4 w-4 shrink-0" /><span className="truncate">{course.duration || 'Self-paced'}</span>{isCompleted && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />}</div>
            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <Link to={roadmapUrl} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1B41] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#292a55]"><Play className="h-3.5 w-3.5" />{isCompleted ? 'Review course' : 'Start learning'}</Link>
              <Link to={roadmapUrl} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 transition hover:bg-slate-50"><Map className="h-3.5 w-3.5" />View roadmap</Link>
            </div>
          </div>
        </article>;
      })}</div>}
    </div>
  </div>;
}
