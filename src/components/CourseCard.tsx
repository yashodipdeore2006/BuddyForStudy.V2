import { useEffect, useState } from 'react';
import type { Course } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, ChevronRight, Users, Bookmark, Loader2, PlayCircle, Star } from 'lucide-react';
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
  initiallySaved?: boolean;
  initiallyEnrolled?: boolean;
}

export default function CourseCard({
  course,
  progressPercentage,
  showActions = false,
  initiallySaved = false,
  initiallyEnrolled = false,
}: CourseCardProps) {
  const hasModules = Array.isArray(course.modules);
  const lessonCount = hasModules ? countAllLessons(course.modules) : null;
  const CategoryIcon = categoryIcons[course.category] || BookOpen;

  const { session } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [saved, setSaved] = useState(initiallySaved);
  const [enrolled, setEnrolled] = useState(initiallyEnrolled);

  useEffect(() => setSaved(initiallySaved), [initiallySaved]);
  useEffect(() => setEnrolled(initiallyEnrolled), [initiallyEnrolled]);
  const [actionError, setActionError] = useState('');
  const [rating, setRating] = useState<{ average: number; count: number }>({ average: 0, count: 0 });

  useEffect(() => {
    let active = true;
    apiFetch(`/api/reviews/courses/${course.id}`)
      .then((data) => { if (active) setRating(data.stats || { average: 0, count: 0 }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [course.id]);

  const formatPrice = (amount: number, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

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
    if (enrolled) navigate('/learn/' + course.id);
    else navigate('/courses/' + course.id);

  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Open course details for ${course.title}`}
      onClick={() => navigate(`/courses/${course.id}`)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          navigate(`/courses/${course.id}`);
        }
      }}
      className="bfs-course-card group flex h-full min-h-[400px] cursor-pointer flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white transition-colors duration-200 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
    >
      <Link
        to={"/courses/" + course.id}
        className="bfs-course-card__media relative block h-[120px] shrink-0 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        aria-label={`Explore ${course.title}`}
      >
        {course.thumbnail ? (
          <img
            src={course.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <>
            <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/15 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-sky-300/20 blur-2xl" />
            <div className="relative flex h-full items-center justify-center">
              <CategoryIcon className="h-12 w-12 text-white/90 drop-shadow-sm transition-transform duration-300 group-hover:scale-110" strokeWidth={1.6} />
            </div>
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/10 opacity-70 transition-opacity group-hover:opacity-90" />
        <div className="absolute left-3 top-3">
          <span className={classNames('inline-flex items-center rounded-full border border-white/60 px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur-md', levelColors[course.level] || 'bg-white/90 text-slate-700')}>
            {course.level || 'All levels'}
          </span>
        </div>
        <span className="absolute bottom-3 right-3 inline-flex translate-y-1 items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-slate-800 opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          Explore course <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex min-h-5 items-center justify-between gap-2">
          <span className="truncate text-[10px] font-extrabold uppercase tracking-[.16em] text-blue-600" title={course.category}>
            {course.category || 'Learning path'}
          </span>
          {course.pricing?.mode && (
            <span className={classNames(
              'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold',
              course.pricing.mode === 'free' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700',
            )}>
              {course.pricing.mode === 'free' ? 'Free' : 'Premium'}
            </span>
          )}
        </div>

        <Link to={"/courses/" + course.id} className="mt-1.5 block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <h3 className="line-clamp-2 min-h-[2.65rem] text-[15px] font-extrabold leading-[1.32] tracking-[-.02em] text-slate-900 transition-colors group-hover:text-blue-700">
            {course.title}
          </h3>
        </Link>

        <p className="mt-1.5 line-clamp-2 min-h-[2.4rem] text-xs leading-[1.2rem] text-slate-500">
          {course.description || 'Build practical skills with this structured learning experience.'}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold text-amber-600" aria-label={`Rating ${rating.average.toFixed(1)} out of 5`}>
            <Star className="h-3.5 w-3.5 fill-current" />
            <span>{rating.count ? rating.average.toFixed(1) : 'New'}</span>
            <span className="font-medium text-slate-400">{rating.count ? `(${rating.count})` : '(no reviews)'}</span>
          </span>
          <span className="text-right font-extrabold text-slate-900">
            {course.pricing?.mode === 'paid'
              ? formatPrice(course.pricing.saleEnabled && course.pricing.salePrice != null ? course.pricing.salePrice : course.pricing.price, course.pricing.currency || 'INR')
              : 'Free'}
            {course.pricing?.mode === 'paid' && course.pricing.compareAtPrice && course.pricing.compareAtPrice > (course.pricing.saleEnabled && course.pricing.salePrice != null ? course.pricing.salePrice : course.pricing.price) && <span className="ml-1 font-medium text-slate-400 line-through">{formatPrice(course.pricing.compareAtPrice, course.pricing.currency || 'INR')}</span>}
          </span>
        </div>

        <div className="mt-2.5 flex min-h-[38px] items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-medium text-slate-500">
            {lessonCount !== null && (
              <span className="inline-flex items-center gap-1.5" title="Lessons">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</span>
              </span>
            )}
            {course.duration && (
              <span className="inline-flex items-center gap-1.5" title="Estimated duration">
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="line-clamp-1">{course.duration}</span>
              </span>
            )}
            {course.enrollment_count !== undefined && (
              <span className="inline-flex items-center gap-1.5" title="Learner enrollments">
                <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{course.enrollment_count.toLocaleString()}</span>
              </span>
            )}
          </div>
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-all group-hover:bg-blue-600 group-hover:text-white">
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        {progressPercentage !== undefined && (
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold">Your progress</span>
              <span className="font-extrabold tabular-nums text-slate-700">{Math.max(0, Math.min(100, progressPercentage))}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }} />
            </div>
          </div>
        )}

        {showActions && (
          <div className="mt-auto pt-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={saveCourse}
                disabled={saving || saved}
                aria-label={saved ? 'Course saved' : 'Save course'}
                className={classNames(
                  'inline-flex min-h-7 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-default',
                  saved
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60',
                )}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className={classNames("h-3.5 w-3.5", saved && "fill-current")} />}
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={enrollCourse}
                disabled={enrolling}
                className="inline-flex min-h-7 items-center justify-center gap-1 rounded-lg bg-black px-2 py-1 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-[#444950] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60"
              >
                {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : enrolled ? <BookOpen className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {enrolling ? 'Opening…' : enrolled ? 'Enrolled' : 'View Course'}
              </button>
            </div>
            {actionError && <p role="alert" className="mt-2 line-clamp-2 text-[11px] font-medium text-red-600">{actionError}</p>}
            <Link
              to={"/courses/" + course.id}
              className="mt-1.5 inline-flex min-h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-950 transition-colors duration-200 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <PlayCircle className="h-4 w-4" /> Preview course
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
