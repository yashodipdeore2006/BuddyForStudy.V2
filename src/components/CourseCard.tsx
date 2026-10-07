import type { Course } from '@/types';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, ChevronRight, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { classNames } from '@/lib/utils';
import { countAllLessons } from '@/lib/courseUtils';

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
}

export default function CourseCard({
  course,
  progressPercentage,
}: CourseCardProps) {
  const hasModules = Array.isArray(course.modules);
  const lessonCount = hasModules ? countAllLessons(course.modules) : null;
  const CategoryIcon = categoryIcons[course.category] || BookOpen;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(13,18,32,.045)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-100 hover:shadow-[0_24px_60px_rgba(13,18,32,.10)]"
    >
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600">
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

        <div className="absolute left-4 top-4">
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

      <div className="flex flex-1 flex-col p-5">
        <span className="text-[11px] font-bold uppercase tracking-[.14em] text-blue-600">
          {course.category}
        </span>

        <h3 className="mt-2 line-clamp-2 text-lg font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-blue-600">
          {course.title}
        </h3>

        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-500">
          {course.description}
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
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
      </div>
    </Link>
  );
}
