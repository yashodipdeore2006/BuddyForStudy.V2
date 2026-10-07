import type { Course } from '@/types';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, ChevronRight, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { classNames } from '@/lib/utils';
import { countAllLessons } from '@/lib/courseUtils';

const levelColors: Record<string, string> = {
  Beginner: 'bg-green-50 text-green-700',
  Intermediate: 'bg-amber-50 text-amber-700',
  Advanced: 'bg-red-50 text-red-700',
};

const categoryIcons: Record<string, LucideIcon> = {
  'Web Development': BookOpen,
  'Data Science': BookOpen,
  'Mobile Development': BookOpen,
  'DevOps': BookOpen,
};

interface CourseCardProps {
  course: Course;
  progressPercentage?: number;
}

export default function CourseCard({ course, progressPercentage }: CourseCardProps) {
  const lessonCount = countAllLessons(course.modules);
  const CategoryIcon = categoryIcons[course.category] || BookOpen;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="card group flex flex-col overflow-hidden transition-all hover:shadow-md"
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-blue-500 to-blue-700">
        {course.thumbnail ? (
          <img
            src={course.thumbnail}
            alt={course.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CategoryIcon className="h-12 w-12 text-white/80" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className={classNames('badge', levelColors[course.level] || 'bg-slate-100 text-slate-700')}>
            {course.level}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <span className="text-xs font-medium text-blue-600">{course.category}</span>
        <h3 className="mt-1 text-base font-semibold text-slate-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {course.title}
        </h3>
        <p className="mt-2 text-sm text-slate-500 line-clamp-2 flex-1">{course.description}</p>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {lessonCount} lessons
            </span>
            {course.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {course.duration}
              </span>
            )}
            {course.enrollment_count !== undefined && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {course.enrollment_count} enrolled
              </span>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
        </div>

        {progressPercentage !== undefined && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Progress</span>
              <span className="font-medium">{progressPercentage}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
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
