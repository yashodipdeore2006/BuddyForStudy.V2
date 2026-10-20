import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Course, Enrollment, Progress } from '@/types';
import { countAllLessons, getAllLessonsFlat } from '@/lib/courseUtils';
import { loadRazorpay } from '@/lib/razorpay';
import {
  BookOpen,
  Clock,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  GraduationCap,
  Play,
  AlertCircle,
  Loader2,
  ListChecks,
  Star,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { classNames, formatDate } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import ExpandableText from '@/components/ExpandableText';
import { routes } from '@/lib/routes';

function formatCoursePrice(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

const levelColors: Record<string, string> = {
  Beginner: 'bg-green-50 text-green-700',
  Intermediate: 'bg-amber-50 text-amber-700',
  Advanced: 'bg-red-50 text-red-700',
};

export default function CourseDetails() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]));
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewStats, setReviewStats] = useState({ count: 0, average: 0 });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [purchaseChoice, setPurchaseChoice] = useState<'subscription' | 'individual'>('subscription');

  useEffect(() => {
    let active = true;
    apiFetch('/api/billing/plans')
      .then((data) => {
        if (active) setSubscriptionPlans([...(data.plans || [])].sort((a, b) => Number(b.price || 0) - Number(a.price || 0)));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    async function fetchCourse() {
      if (!courseId) {
        setError('Invalid course');
        setLoading(false);
        return;
      }

      try {
        // The course itself is the primary resource. Optional review/enrollment
        // requests must never block the course page from rendering.
        const data = await apiFetch(`/api/courses/${courseId}`);
        const raw = data.course;
        setCourse({
          ...raw,
          id: String(raw._id ?? raw.id),
          learning_outcomes: raw.learningOutcomes || [],
          is_published: raw.isPublished,
          created_at: raw.createdAt,
          updated_at: raw.updatedAt,
          modules: (raw.modules || []).map((m: any) => ({
            ...m,
            id: String(m._id ?? m.id),
            lessons: (m.lessons || []).map((l: any) => ({
              ...l,
              id: String(l._id ?? l.id),
            })),
          })),
        } as Course);

        // Reviews are secondary content. A review API failure must not make
        // an otherwise valid course appear to be stuck loading.
        try {
          const reviewData = await apiFetch(`/api/reviews/courses/${courseId}`);
          setReviews(reviewData.reviews || []);
          setReviewStats(reviewData.stats || { count: 0, average: 0 });
        } catch (reviewError) {
          console.warn('Course reviews unavailable:', reviewError);
        }

        if (session) {
          try {
            const eData = await apiFetch(`/api/enrollments/course/${courseId}`);
            setEnrollment(eData.enrollment);

            const pData = await apiFetch(`/api/progress/${courseId}`);
            const rawProgress = pData.progress;
            setProgress({
              ...rawProgress,
              id: String(rawProgress._id ?? rawProgress.id),
              user_id: String(rawProgress.user ?? rawProgress.user_id),
              course_id: String(rawProgress.course ?? rawProgress.course_id),
              completed_lessons: (rawProgress.completedLessons ?? []).map((item: any) => ({
                lessonId: String(item.lessonId),
                type: item.type,
                completedAt: item.completedAt,
              })),
              completed_count: rawProgress.completedCount ?? 0,
              total_lessons: rawProgress.totalLessons ?? 0,
              last_lesson_id: rawProgress.lastLessonId ? String(rawProgress.lastLessonId) : null,
              percentage: rawProgress.percentage ?? 0,
              last_accessed_at: rawProgress.lastAccessedAt ?? null,
              created_at: rawProgress.createdAt ?? '',
              updated_at: rawProgress.updatedAt ?? '',
            } as Progress);
          } catch (learningError) {
            console.warn('Course enrollment/progress unavailable:', learningError);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load course');
      } finally {
        setLoading(false);
      }
    }
    fetchCourse();
  }, [courseId, session]);

  const handleCheckout = async () => {
    if (!session) {
      navigate('/login', { state: { from: { pathname: `/courses/${courseId}` } } });
      return;
    }
    if (!courseId || !course) return;
    setCheckoutLoading(true);
    setError(null);
    setCheckoutNotice(null);
    try {
      const data = await apiFetch('/api/payments/course/order', {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      await loadRazorpay();
      const razorpay = new window.Razorpay({
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        name: 'BuddyForStudy',
        description: data.course.title,
        order_id: data.order.id,
        prefill: { name: session.user.name, email: session.user.email },
        theme: { color: '#2563eb' },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          setCheckoutLoading(true);
          setError(null);
          try {
            await apiFetch('/api/payments/course/verify', {
              method: 'POST',
              body: JSON.stringify({
                paymentId: data.paymentId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            const enrollmentData = await apiFetch(`/api/enrollments/${courseId}`, { method: 'POST' });
            setEnrollment(enrollmentData.enrollment);
            setCheckoutNotice('Payment successful. This course is now in your learning library.');
            setError(null);
          } catch (err) {
            setError(err instanceof Error
              ? `${err.message} If your payment was deducted, please refresh this page before trying again.`
              : 'We could not confirm your purchase. If your payment was deducted, please refresh this page before trying again.');
          } finally {
            setCheckoutLoading(false);
          }
        },
        modal: { ondismiss: () => setCheckoutLoading(false) },
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout');
      setCheckoutLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!session) { navigate('/login', { state: { from: { pathname: `/courses/${courseId}` } } }); return; }
    if (!course || !course.is_published) return;
    if (course.pricing?.mode === 'paid') { await handleCheckout(); return; }
    setEnrolling(true); setError(null);
    try {
      const data = await apiFetch(`/api/enrollments/${courseId}`, { method: 'POST' });
      setEnrollment(data.enrollment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll. Please try again.');
    } finally { setEnrolling(false); }
  };


  const submitReview = async () => {
    if (!courseId || !session) return;
    setReviewSaving(true); setError(null);
    try {
      const data = await apiFetch(`/api/reviews/courses/${courseId}`, { method: 'POST', body: JSON.stringify({ rating: reviewRating, comment: reviewComment }) });
      setReviews((current) => [data.review, ...current.filter((item) => item.user?._id !== session.user.id)]);
      const reviewData = await apiFetch(`/api/reviews/courses/${courseId}`);
      setReviewStats(reviewData.stats || { count: 0, average: 0 });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save review'); }
    finally { setReviewSaving(false); }
  };

  const handleStartLearning = () => {
    if (!courseId || !course) return;
    const flatLessons = getAllLessonsFlat(course.modules);
    const completedIds = new Set((progress?.completed_lessons ?? []).map((item) => String(item.lessonId)));
    const nextLesson = flatLessons.find((lesson) => !completedIds.has(String(lesson.id)));
    navigate(routes.learn(courseId, nextLesson?.id ?? null));
  };

  const toggleModule = (index: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Course Not Found</h1>
        <p className="mt-2 text-slate-500">
          The course you're looking for doesn't exist or has been removed.
        </p>
        <Link to={routes.explore()} className="btn-primary mt-6">
          Browse Courses
        </Link>
      </div>
    );
  }

  const lessonCount = countAllLessons(course.modules);
  const isEnrolled = enrollment?.status === 'active' || enrollment?.status === 'completed';
  const isPaidCourse = course.pricing?.mode === 'paid';
  const enrollmentEnabled = (course as Course & { enrollmentEnabled?: boolean }).enrollmentEnabled !== false;
  const currency = course.pricing?.currency || 'INR';
  const basePrice = Math.max(0, Number(course.pricing?.price || 0));
  const salePrice = course.pricing?.saleEnabled && Number(course.pricing?.salePrice || 0) > 0
    ? Number(course.pricing?.salePrice)
    : basePrice;
  const compareAtPrice = Number(course.pricing?.compareAtPrice || 0);
  const crossedPrice = compareAtPrice > salePrice ? compareAtPrice : (salePrice < basePrice ? basePrice : 0);
  const discountPercent = crossedPrice > salePrice && crossedPrice > 0
    ? Math.round(((crossedPrice - salePrice) / crossedPrice) * 100)
    : 0;
  const progressPct = progress?.percentage || 0;
  const flatLessons = getAllLessonsFlat(course.modules);
  const completedLessonIds = new Set((progress?.completed_lessons ?? []).map((item) => String(item.lessonId)));
  const nextLesson = flatLessons.find((lesson) => !completedLessonIds.has(String(lesson.id))) ?? flatLessons[flatLessons.length - 1];
  const hasRoadmap = flatLessons.length > 0;

  if (isEnrolled) {
    const isCompleted = enrollment?.status === 'completed' || progressPct >= 100;
    return (
      <div className="bfs-shell py-8 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-sm text-slate-500">
          <Link to={routes.myLearning()} className="hover:text-violet-700">My learning</Link><span aria-hidden="true">/</span><span className="truncate text-slate-800">{course.title}</span>
        </nav>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-sm font-semibold text-violet-700">{isCompleted ? 'Course completed' : 'Your course'}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{course.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{course.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span>{Math.round(progressPct)}% complete</span><span>{progress?.completed_count ?? completedLessonIds.size} of {progress?.total_lessons ?? flatLessons.length} lessons</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)}>
            <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
          </div>
          {nextLesson && <p className="mt-4 text-sm text-slate-600">Next: <span className="font-semibold text-slate-900">{nextLesson.title}</span></p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={handleStartLearning} className="btn-primary">{isCompleted ? 'Review' : progressPct > 0 ? 'Continue' : 'Start'} learning <ChevronRight className="h-4 w-4" /></button>
            {hasRoadmap && <Link to={routes.roadmap(course.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Map className="h-4 w-4" />Roadmap</Link>}
          </div>
        </section>
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-950">Curriculum</h2>
          <div className="mt-5 space-y-4">
            {course.modules.map((module) => <section key={module.id} className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">{module.title}</h3>
              <ul className="mt-3 space-y-2">{module.lessons.map((lesson) => <li key={lesson.id}><Link to={routes.learn(course.id, lesson.id)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><span>{lesson.title}</span><ChevronRight className="h-4 w-4 shrink-0" /></Link></li>)}</ul>
            </section>)}
            {course.modules.length === 0 && <p className="text-sm text-slate-500">Curriculum content will be added soon.</p>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="bfs-shell py-8 sm:py-10">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Courses
      </Link>

      {/* Course Header */}
      <div className="mt-6 overflow-hidden rounded-[32px] border border-slate-200 bg-white p-7 text-slate-950 sm:p-10">
        <div className="flex flex-wrap gap-2">
          <span className="badge border border-slate-200 bg-slate-50 text-slate-700">
            {course.category}
          </span>
          <span className={classNames('badge', levelColors[course.level])}>
            {course.level}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">{course.title}</h1>
        <ExpandableText
          text={course.description}
          maxLength={220}
          className="mt-3 max-w-2xl text-slate-600"
        />

        <div className="mt-6 flex flex-wrap items-center gap-6 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            {lessonCount} lessons
          </span>
          {course.duration && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {course.duration}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4" />
            {course.modules.length} modules
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Learning Outcomes */}
          {course.learning_outcomes.length > 0 && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-medium text-slate-950">What you'll learn</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.learning_outcomes.map((outcome, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reviews & Ratings */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-medium text-slate-950">Reviews & Ratings</h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">{reviewStats.average || '—'}</span>
              <div className="flex text-amber-400">{[1,2,3,4,5].map((star) => <Star key={star} className="h-4 w-4" fill={star <= Math.round(reviewStats.average) ? "currentColor" : "none"} />)}</div>
              <span className="text-sm text-slate-500">({reviewStats.count} reviews)</span>
            </div>
            {isEnrolled && (
              <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800">Rate this course</p>
                <div className="mt-2 flex gap-1">{[1,2,3,4,5].map((star) => (
                  <button key={star} type="button" onClick={() => setReviewRating(star)} aria-label={`Rate ${star} stars`}>
                    <Star className={`h-6 w-6 ${star <= reviewRating ? 'text-amber-400' : 'text-slate-300'}`} fill={star <= reviewRating ? "currentColor" : "none"} />
                  </button>
                ))}</div>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} maxLength={1000} placeholder="Share your experience (optional)" className="input-field mt-3 min-h-20 w-full text-sm outline-none focus:border-blue-500" />
                <button type="button" onClick={submitReview} disabled={reviewSaving} className="btn-primary mt-3 w-full">{reviewSaving ? 'Saving...' : 'Submit Review'}</button>
              </div>
            )}
            <div className="mt-6 space-y-4">
              {reviews.length ? reviews.map((review) => (
                <div key={review._id} className="border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{review.user?.name || 'Learner'}</span><div className="flex text-amber-400">{[1,2,3,4,5].map((star) => <Star key={star} className="h-3.5 w-3.5" fill={star <= review.rating ? "currentColor" : "none"} />)}</div></div>
                  {review.comment && <p className="mt-2 text-sm text-slate-600">{review.comment}</p>}
                  <p className="mt-1 text-xs text-slate-400">{formatDate(review.createdAt)}</p>
                </div>
              )) : <p className="mt-4 text-sm text-slate-500">No reviews yet. Be the first to review this course.</p>}
            </div>
          </div>

          {/* Curriculum */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-medium text-slate-950">Course Curriculum</h2>
            <p className="mt-1 text-sm text-slate-500">
              {course.modules.length} modules • {lessonCount} lessons
            </p>

            <div className="mt-6 space-y-3">
              {course.modules.map((module, mIdx) => {
                const isExpanded = expandedModules.has(mIdx);
                return (
                  <div
                    key={module.id}
                    className="rounded-2xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleModule(mIdx)}
                      className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {module.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {module.lessons.length} lessons
                          </p>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200">
                        {module.lessons.map((lesson) => {
                          const LessonIcon: LucideIcon =
                            lesson.type === 'project' ? ListChecks : Play;
                          return (
                            <div
                              key={lesson.id}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                            >
                              <LessonIcon className="h-4 w-4 text-slate-400" />
                              <span className="text-sm text-slate-700 flex-1">
                                {lesson.title}
                              </span>
                              <span className="badge bg-slate-100 text-slate-600">
                                {lesson.type}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {course.modules.length === 0 && (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Curriculum content will be added soon.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-[24px] border border-slate-200 bg-white p-6">
            {isPaidCourse && !isEnrolled && (
              <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200">
                <label className={classNames("block cursor-pointer p-4 transition-colors", purchaseChoice === 'subscription' ? "bg-violet-50/70" : "bg-white hover:bg-slate-50")}>
                  <span className="flex items-start gap-3">
                    <input type="radio" name="purchase-choice" value="subscription" checked={purchaseChoice === 'subscription'} onChange={() => setPurchaseChoice('subscription')} className="mt-1 h-4 w-4 accent-violet-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-600">Subscribe and save</span>
                      <span className="mt-0.5 block text-xl font-bold text-slate-950">From {subscriptionPlans.length ? formatCoursePrice(Number(subscriptionPlans[0].price || 0), 'INR') : 'subscription plans'}<span className="text-xs font-normal text-slate-500">{subscriptionPlans.length ? ' /' + (subscriptionPlans[0].billingInterval || 'month') : ''}</span></span>
                      <span className="mt-2 block rounded-lg bg-violet-100 p-2.5 text-xs leading-5 text-violet-900">Subscribers can access published courses and included learning features according to their plan.</span>
                      <span className="mt-3 block space-y-2 text-xs text-slate-600">
                        <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" />Access courses included with your plan</span>
                        <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Manage or cancel according to plan terms</span>
                      </span>
                    </span>
                  </span>
                </label>
                <label className={classNames("block cursor-pointer border-t border-slate-200 p-4 transition-colors", purchaseChoice === 'individual' ? "bg-emerald-50/70" : "bg-white hover:bg-slate-50")}>
                  <span className="flex items-start gap-3">
                    <input type="radio" name="purchase-choice" value="individual" checked={purchaseChoice === 'individual'} onChange={() => setPurchaseChoice('individual')} className="mt-1 h-4 w-4 accent-emerald-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-600">Buy individual course</span>
                      <span className="mt-0.5 block text-xl font-bold text-slate-950">{formatCoursePrice(salePrice, currency)}</span>
                      {crossedPrice > salePrice && <span className="ml-1 text-sm text-slate-400 line-through">{formatCoursePrice(crossedPrice, currency)}</span>}
                      <span className="mt-1 block text-xs text-slate-500">One-time payment · keep access to this course</span>
                    </span>
                  </span>
                </label>
              </div>
            )}
            {checkoutNotice && <div role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{checkoutNotice}</div>}
            {isEnrolled ? (
              <div>
                <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {enrollment?.status === 'completed' ? 'Course completed' : 'You’re enrolled'}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">This course is in your learning library.</p>
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-slate-700">Your Progress</span>
                    <span className="font-bold text-blue-600">{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  {progress && <p className="mt-2 text-xs text-slate-500">{progress.completed_count} of {progress.total_lessons} lessons completed</p>}
                </div>
                <button onClick={handleStartLearning} className="btn-primary w-full">
                  Continue Learning <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <button
                  onClick={isPaidCourse ? (purchaseChoice === 'subscription' ? () => navigate('/pricing') : handleCheckout) : handleEnroll}
                  disabled={enrolling || checkoutLoading || !course.is_published || !enrollmentEnabled}
                  className={classNames("flex w-full items-center justify-center gap-2", isPaidCourse && purchaseChoice === 'individual' ? "btn-buy" : "btn-primary")}
                >
                  {enrolling || checkoutLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{checkoutLoading ? 'Processing checkout...' : 'Enrolling...'}</>
                  ) : isPaidCourse ? (
                    purchaseChoice === 'subscription' ? (session ? 'Start subscription' : 'Sign in to subscribe') : (session ? 'Buy individual course · ' + formatCoursePrice(salePrice, currency) : 'Sign in to buy')
                  ) : session ? 'Enroll Now — Free' : 'Sign in to enroll'}
                </button>
                {!session && <p className="mt-3 text-center text-xs text-slate-500">Sign in or create a free account to continue.</p>}
                {!enrollmentEnabled && <p className="mt-3 text-center text-xs text-amber-700">Enrollment is temporarily closed for this course.</p>}
                {error && (
                  <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><span>{error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Level</span>
                <span className="font-medium text-slate-900">{course.level}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Category</span>
                <span className="font-medium text-slate-900">{course.category}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Duration</span>
                <span className="font-medium text-slate-900">{course.duration || 'Self-paced'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Lessons</span>
                <span className="font-medium text-slate-900">{lessonCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Published</span>
                <span className="font-medium text-slate-900">{formatDate(course.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
