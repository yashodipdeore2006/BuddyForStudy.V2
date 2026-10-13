import { useState } from 'react';
import type { Course } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, ChevronRight, Users, Bookmark, Loader2, PlayCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { classNames } from '@/lib/utils';
import { countAllLessons } from '@/lib/courseUtils';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const levelColors: Record<string, string> = {
  Beginner: 'bg-green-50 text-green-700',
  Intermediate: 'bg-amber-50 text-amber-700',
  Advanced: 'bg-purple-50 text-purple-700',
};

const categoryIcons: Record<string, LucideIcon> = {
  'Web Development': BookOpen,
  'Data Science': BookOpen,
  'Mobile Development': BookOpen,
  DevOps: BookOpen,
};

interface CourseCardProps {
  course: Course;
  progressPercentage?: number;
  showActions?: boolean;
}

export default function CourseCard({
  course,
  progressPercentage,
  showActions = false,
}: CourseCardProps) {
  const hasModules = Array.isArray(course.modules);
  const lessonCount = hasModules ? countAllLessons(course.modules) : null;
  const CategoryIcon = categoryIcons[course.category] || BookOpen;

  const { session } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [actionError, setActionError] = useState('');

  const saveCourse = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!session) {
      navigate('/login', { state: { from: { pathname: '/courses/' + course.id } } });
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      await apiFetch('/api/saved-courses', {
        method: 'POST',
        body: JSON.stringify({ courseId: course.id }),
      });
      setSaved(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save course.');
    } finally {
      setSaving(false);
    }
  };

  const enrollCourse = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!session) {
      navigate('/login', { state: { from: { pathname: '/courses/' + course.id } } });
      return;
    }
    setEnrolling(true);
    setActionError('');
    try {
      await apiFetch('/api/enrollments/' + course.id, { method: 'POST' });
      setEnrolled(true);
      navigate('/courses/' + course.id + '/roadmap');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to enroll in course.');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <article className="group flex h-full min-h-[410px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(13,18,32,.035)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-100 hover:shadow-[0_18px_40px_rgba(13,18,32,.09)]">
      <div className="relative h-32 shrink-0 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 sm:h-32">
        {course.thumbnail ? (
          <img
            src={course.thumbnail}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <>
            <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
            <div className="flex h-full w-full items-center justify-center">
              <CategoryIcon className="h-14 w-14 text-white/85" />
            </div>
          </>
        )}

        <div className="absolute left-3 top-3">
          <span
            className={classNames(
              'badge backdrop-blur',
              levelColors[course.level] || 'bg-white/90 text-slate-700',
            )}
          >
            {course.level}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <span className="text-[11px] font-bold uppercase tracking-[.14em] text-blue-600">
          {course.category}
        </span>

        <h3 className="mt-1.5 line-clamp-3 text-sm font-bold leading-[1.3] tracking-tight text-slate-900 transition-colors group-hover:text-blue-600">
          {course.title}
        </h3>

        <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-[1.15rem] text-slate-500">
          {course.description}
        </p>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {lessonCount !== null && (
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {lessonCount}
              </span>
            )}

            {course.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {course.duration}
              </span>
            )}

            {course.enrollment_count !== undefined && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {course.enrollment_count}
              </span>
            )}
          </div>

          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-all group-hover:bg-blue-50 group-hover:text-blue-600">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>

        {progressPercentage !== undefined && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Progress</span>
              <span className="font-bold text-slate-700">
                {progressPercentage}%
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        {showActions && (
          <div className="mt-auto pt-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={saveCourse} disabled={saving} className={saved ? "inline-flex items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-2 py-2 text-[11px] font-bold text-green-700" : "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}{saved ? "Saved" : "Save Course"}
              </button>
              <button type="button" onClick={enrollCourse} disabled={enrolling || enrolled} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
                {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{enrolled ? "Enrolled" : "Enroll Now"}
              </button>
            </div>
            {actionError && <p className="mt-2 line-clamp-2 text-[11px] font-medium text-red-600">{actionError}</p>}
            <Link to={"/courses/" + course.id} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100">
              <PlayCircle className="h-4 w-4" />Preview in BuddyForStudy
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
