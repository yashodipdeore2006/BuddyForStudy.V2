import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
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
  Map,
  Star,
  ShieldCheck,
  Tag,
  Video,
  Smartphone,
  Award,
  CircleHelp,
  Users,
} from 'lucide-react';
import { classNames, formatDate } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import ExpandableText from '@/components/ExpandableText';
import { routes } from "@/lib/routes";
import { getCourseCardDescription } from "@/lib/courseCardDescription";

function formatCoursePrice(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

const levelColors: Record<string, string> = {
  Beginner: 'bg-green-50 text-green-700',
  Intermediate: 'bg-amber-50 text-amber-700',
  Advanced: 'bg-red-50 text-red-700',
};

function getDisplayTopic(course: Course): string {
  const sourceCategory = /^(youtube discovery|ai course search|youtube|course search|discovery)$/i.test(String(course.category || '').trim());
  if (!sourceCategory) return course.category || 'Professional learning';
  const content = [course.title, course.description, ...(course.modules || []).map((module) => module.title)].join(' ').toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/spom|accounting|accountancy|taxation|audit|commerce/, 'Accounting & commerce'],
    [/entrepreneur|startup|business|marketing|finance/, 'Business & entrepreneurship'],
    [/computer vision|deep learning|machine learning|artificial intelligence|\bai\b|neural network/, 'AI & machine learning'],
    [/javascript|typescript|react|node\.js|python|programming|software|web development|pytorch/, 'Software development'],
    [/mongodb|database|sql|databricks/, 'Data & databases'],
    [/data science|pandas|analytics|statistics/, 'Data analytics'],
    [/design|figma|user experience|\bui\b|\bux\b/, 'Design & UX'],
    [/cyber|security|network/, 'Cybersecurity & networking'],
  ];
  return rules.find(([pattern]) => pattern.test(content))?.[1] || 'Professional learning';
}

function cleanLessonTitle(title: string, siblingTitles: string[] = []): string {
  const parts = String(title || '').split(/\s*[|•]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return String(title || '').trim();
  const siblings = siblingTitles.map((sibling) => String(sibling || '').split(/\s*[|•]\s*/).map((part) => part.trim()).filter(Boolean));
  let sharedSegments = 0;
  while (
    sharedSegments < parts.length - 1 &&
    siblings.length > 1 &&
    siblings.every((segments) => segments[sharedSegments] && segments[sharedSegments].toLowerCase() === parts[sharedSegments].toLowerCase())
  ) sharedSegments += 1;
  if (sharedSegments > 0) return parts.slice(sharedSegments).join(' · ').trim() || parts[parts.length - 1];
  return parts.join(' · ');
}

function getLessonDurationSeconds(lesson: Course['modules'][number]['lessons'][number]): number {
  const tutorialVideos = lesson.tutorial?.videos || [];
  const projectVideos = lesson.project?.videos || [];
  const videos = [...tutorialVideos, ...projectVideos];
  return videos.reduce((sum, video) => sum + Math.max(0, Number(video.durationSeconds) || 0), 0);
}

function formatDurationSeconds(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? hours + 'h ' + remainingMinutes + 'm' : hours + 'h';
}

function parseCourseDurationMinutes(value: string): number | null {
  const text = String(value || '').toLowerCase();
  const studyDays = text.match(/(\d+)\s+study\s+days?\s+at\s+(\d+)\s*min(?:ute)?s?\s*\/\s*day/);
  if (studyDays) return Number(studyDays[1]) * Number(studyDays[2]);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/);
  const minutes = text.match(/(\d+)\s*m(?:in(?:utes?)?)?/);
  if (!hours && !minutes) return null;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
}

function getCourseOutcomes(course: Course): string[] {
  const authored = (course.learning_outcomes || [])
    .map((outcome) => String(outcome || '').trim())
    .filter((outcome) => outcome.length > 8 && !/^(learn|understand)\s+(this course|the course|the following)$/i.test(outcome));
  if (authored.length) return authored.slice(0, 6);

  const allTitles = (course.modules || []).flatMap((module) => module.lessons.map((lesson) => lesson.title));
  const topics = [...new Set((course.modules || []).flatMap((module) =>
    module.lessons.map((lesson) => cleanLessonTitle(lesson.title, allTitles))
  ).map((title) => title.replace(/^[\s:|·-]+/, '').trim())
    .filter((title) => title.length > 3 && !/^(introduction|overview|conclusion|resources|getting started)$/i.test(title)))].slice(0, 6);
  return topics.map((topic) => /^(chapter|lesson|part)\s+\d+/i.test(topic)
    ? 'Work through ' + topic + ' and its key concepts.'
    : 'Build practical understanding of ' + topic + '.');
}

export default function CourseDetails() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [courseNotes, setCourseNotes] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showStickyMiniHeader, setShowStickyMiniHeader] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateStickyHeader = () => {
      setShowStickyMiniHeader(Boolean(heroRef.current && heroRef.current.getBoundingClientRect().bottom < 72));
    };
    window.addEventListener('scroll', updateStickyHeader, { passive: true });
    updateStickyHeader();
    return () => window.removeEventListener('scroll', updateStickyHeader);
  }, []);

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
      navigate(routes.login(), { state: { from: { pathname: courseId ? routes.course(courseId) : routes.explore() } } });
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
    if (!session) { navigate(routes.login(), { state: { from: { pathname: courseId ? routes.course(courseId) : routes.explore() } } }); return; }
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

  useEffect(() => {
    if (!course || !(enrollment?.status === 'active' || enrollment?.status === 'completed')) return;
    const completed = new Set((progress?.completed_lessons || []).map((item) => String(item.lessonId)));
    const next = getAllLessonsFlat(course.modules).find((lesson) => !completed.has(String(lesson.id)));
    const targetIndex = next ? course.modules.findIndex((module) => module.lessons.some((lesson) => String(lesson.id) === String(next.id))) : -1;
    if (targetIndex >= 0) setExpandedModules(new Set([targetIndex]));
  }, [course?.id, enrollment?.status, progress?.last_lesson_id, progress?.percentage]);

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
  const displayTopic = getDisplayTopic(course);
  const creatorName = String(course.cardMetadata?.creatorName || '').trim();
  const sourceType = String(course.cardMetadata?.typeTag || (
    course.generation?.mode === 'ai' ? 'AI roadmap' :
      course.generation?.sourceResourceType === 'video' ? 'Single video' :
        course.generation?.sourceResourceType === 'playlist' || course.generation?.sourceResourceType === 'series' ? 'Playlist' : 'Course'
  ));
  const outcomes = getCourseOutcomes(course);
  const videoCount = Number(course.cardMetadata?.videoCount || 0);
  const learnerCount = Number(course.enrollment_count ?? course.enrollmentCount ?? 0);
  const qualityScore = Number.isFinite(course.cardMetadata?.qualityScore) ? Number(course.cardMetadata?.qualityScore) : null;
  const previewVideoId = String(course.cardMetadata?.previewVideoId || '');
  const quizCount = flatLessons.filter((lesson) => lesson.type === 'quiz').length;
  const projectCount = flatLessons.filter((lesson) => lesson.type === 'project').length;
  const courseIncludes = [
    course.duration ? { icon: Clock, label: course.duration + ' estimated learning time' } : null,
    lessonCount ? { icon: Play, label: lessonCount + ' lessons' } : null,
    videoCount > 0 ? { icon: Video, label: videoCount + ' curated video' + (videoCount === 1 ? '' : 's') } : null,
    course.generation?.mode === 'ai' ? { icon: Sparkles, label: 'AI-generated learning roadmap' } : null,
    quizCount > 0 ? { icon: CircleHelp, label: quizCount + ' interactive quiz' + (quizCount === 1 ? '' : 'zes') } : null,
    projectCount > 0 ? { icon: ListChecks, label: projectCount + ' practical project' + (projectCount === 1 ? '' : 's') } : null,
    course.certificateEnabled !== false ? { icon: Award, label: 'Certificate of completion' } : null,
    { icon: Smartphone, label: 'Access on desktop and mobile' },
  ].filter((item): item is { icon: LucideIcon; label: string } => Boolean(item));
  // CP-01..CP-11: this route renders sales content before enrollment and a learning dashboard afterward.
  const isCompleted = isEnrolled && (enrollment?.status === 'completed' || progressPct >= 100);
  const durationMinutes = parseCourseDurationMinutes(course.duration || '');
  const estimatedMinutesLeft = durationMinutes === null ? null : Math.ceil(durationMinutes * (100 - Math.min(100, Math.max(0, isCompleted ? 100 : progressPct))) / 100);
  const courseView = !isEnrolled ? 'sales' : isCompleted ? 'completion' : 'hub';
  const hubTabs = ['overview', 'curriculum', 'notes', 'about'];
  const requestedTab = searchParams.get('tab') || '';
  const activeTab = hubTabs.includes(requestedTab) ? requestedTab : 'overview';
  const setCourseTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };



  if (courseView !== 'sales') {
    return (
      <div className="bfs-shell py-8 pb-28 sm:py-10 sm:pb-10">
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-sm text-slate-500">
          <Link to={routes.myLearning()} className="hover:text-violet-700">My learning</Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-slate-800">{course.title}</span>
        </nav>

        {courseView === 'completion' && (
          <section aria-labelledby="completion-title" className="mb-6 overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" /> Course completed
                </span>
                <h1 id="completion-title" className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">You did it!</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">You’ve completed {course.title}. Review any lesson, reflect on your progress, or choose what to learn next.</p>
              </div>
              <button type="button" onClick={handleStartLearning} className="btn-primary shrink-0">
                Review course <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4">
                <p className="text-xs text-slate-500">Progress</p><p className="mt-1 text-2xl font-bold text-slate-950">100%</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4">
                <p className="text-xs text-slate-500">Lessons completed</p><p className="mt-1 text-2xl font-bold text-slate-950">{progress?.completed_count ?? completedLessonIds.size} / {progress?.total_lessons ?? flatLessons.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4">
                <p className="text-xs text-slate-500">Course</p><p className="mt-1 line-clamp-1 font-semibold text-slate-950">{course.title}</p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Rate this course</p>
              <p className="mt-1 text-xs text-slate-500">How useful was this learning experience?</p>
              <div className="mt-3 flex items-center gap-1" role="group" aria-label="Rate this course">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setReviewRating(star)} aria-label={`Rate ${star} out of 5 stars`} aria-pressed={reviewRating === star} className="rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
                    <Star className={`h-7 w-7 ${star <= reviewRating ? 'text-amber-400' : 'text-slate-300'}`} fill={star <= reviewRating ? 'currentColor' : 'none'} />
                  </button>
                ))}
                <span className="ml-2 text-sm text-slate-600">{reviewRating} of 5</span>
              </div>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} maxLength={1000} placeholder="Add a comment (optional)" className="input-field mt-3 min-h-20 w-full text-sm" aria-label="Course feedback comment" />
              <button type="button" onClick={submitReview} disabled={reviewSaving} className="btn-primary mt-3">
                {reviewSaving ? 'Saving feedback…' : 'Submit rating'}
              </button>
              {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          {courseView === 'hub' && <p className="text-sm font-semibold text-violet-700">Your course</p>}
          {courseView === 'completion' && <p className="text-sm font-semibold text-emerald-700">Course library</p>}
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{course.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{course.description}</p>
          <div className="mt-6 grid gap-5 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700">Your learning progress</p>
                <p className="text-3xl font-bold tracking-tight text-violet-800">{Math.round(isCompleted ? 100 : progressPct)}<span className="ml-1 text-base font-semibold">%</span></p>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isCompleted ? 100 : Math.round(progressPct)}>
                <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, isCompleted ? 100 : progressPct))}%` }} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">{progress?.completed_count ?? completedLessonIds.size} of {progress?.total_lessons ?? flatLessons.length} lessons completed{estimatedMinutesLeft !== null && !isCompleted ? ` · about ${formatDurationSeconds(estimatedMinutesLeft * 60)} left` : ''}</p>
              {progress?.last_accessed_at && <p className="mt-1 text-xs text-slate-500">Last accessed {formatDate(progress.last_accessed_at)}</p>}
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-white bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next lesson</p>
              <p className="mt-1 line-clamp-2 font-semibold text-slate-900">{isCompleted ? 'Course completed' : nextLesson ? cleanLessonTitle(nextLesson.title, flatLessons.map((lesson) => lesson.title)) : 'Curriculum coming soon'}</p>
              {nextLesson && getLessonDurationSeconds(nextLesson) > 0 && <p className="mt-1 text-xs text-slate-500">{formatDurationSeconds(getLessonDurationSeconds(nextLesson))}</p>}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={handleStartLearning} className="btn-primary max-w-full">
              {isCompleted ? 'Review course' : progressPct > 0 ? 'Continue: ' + cleanLessonTitle(nextLesson?.title || 'learning', flatLessons.map((lesson) => lesson.title)) : 'Start learning'} <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
            {hasRoadmap && <Link to={routes.roadmap(course.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Map className="h-4 w-4" />Open roadmap</Link>}
          </div>
        </section>

        <div className="mt-8 border-b border-slate-200">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Course sections">
            {hubTabs.map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setCourseTab(tab)} className={classNames('shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors', activeTab === tab ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-900')}>
                {{ overview: 'Overview', curriculum: 'Curriculum', notes: 'Notes', about: 'About' }[tab]}
              </button>
            ))}
          </div>
        </div>

        <section role="tabpanel" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
          {activeTab === 'overview' && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Your next lessons</h2>
              <p className="mt-1 text-sm text-slate-500">Pick up where you left off, or preview what comes next.</p>
              <div className="mt-4 space-y-2">
                {flatLessons.filter((lesson) => !completedLessonIds.has(String(lesson.id))).slice(0, 3).map((lesson, index) => {
                  const isNext = String(lesson.id) === String(nextLesson?.id);
                  const LessonIcon: LucideIcon = lesson.type === 'quiz' ? CircleHelp : lesson.type === 'project' ? ListChecks : Play;
                  const title = cleanLessonTitle(lesson.title, flatLessons.map((item) => item.title));
                  const duration = getLessonDurationSeconds(lesson);
                  return <Link key={lesson.id} to={routes.learn(course.id, lesson.id)} className={classNames('flex items-center gap-3 rounded-xl border p-3 transition', isNext ? 'border-violet-200 bg-violet-50/70' : 'border-slate-200 hover:bg-slate-50')}>
                    <span className={classNames('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isNext ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600')}><LessonIcon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-500">{isNext ? 'Up next' : 'Coming up'}</span><span className="mt-0.5 block line-clamp-2 text-sm font-semibold text-slate-900">{title}</span></span>
                    {duration > 0 && <span className="shrink-0 text-xs text-slate-500">{formatDurationSeconds(duration)}</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>;
                })}
                {flatLessons.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">The instructor has not added lessons yet.</p>}
                {isCompleted && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">You’ve completed this course. Use Curriculum to revisit any lesson.</p>}
              </div>
            </div>
            <aside className="space-y-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Recent notes</p>
                {courseNotes.trim() ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{courseNotes.trim()}</p> : <p className="mt-2 text-sm leading-6 text-slate-500">Your course notes will appear here after you save them.</p>}
                <button type="button" onClick={() => setCourseTab('notes')} className="mt-3 text-sm font-semibold text-violet-700 hover:text-violet-900">Open notes</button>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Learning activity</p>
                <p className="mt-2 text-sm text-slate-600">{progress?.last_accessed_at ? 'Last accessed ' + formatDate(progress.last_accessed_at) : 'Your first lesson is ready when you are.'}</p>
                {course.modules.length > 1 && <p className="mt-2 text-xs text-slate-500">{course.modules.length} modules in this course</p>}
              </div>
            </aside>
          </div>}
          {activeTab === 'curriculum' && <>
            <div className="mb-5"><h2 className="text-xl font-semibold text-slate-950">Curriculum</h2><p className="mt-1 text-sm text-slate-500">{course.modules.length} modules · {lessonCount} lessons</p></div>
            <div className="space-y-4">
              {course.modules.map((module, moduleIndex) => <section key={module.id} className="overflow-hidden rounded-2xl border border-slate-200">
                <button type="button" onClick={() => toggleModule(moduleIndex)} aria-expanded={expandedModules.has(moduleIndex)} className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50">
                  <span><span className="block font-semibold text-slate-900">{module.title}</span><span className="mt-1 block text-xs text-slate-500">{module.lessons.length} lessons</span></span>
                  {expandedModules.has(moduleIndex) ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                {expandedModules.has(moduleIndex) && <ul className="divide-y divide-slate-100 border-t border-slate-200">
                  {module.lessons.map((lesson) => {
                    const done = completedLessonIds.has(String(lesson.id));
                    return <li key={lesson.id}><Link to={routes.learn(course.id, lesson.id)} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                      {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Play className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className="min-w-0 flex-1 text-slate-800">{lesson.title}</span><span className="text-xs text-slate-500">{done ? 'Completed' : lesson.type}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link></li>;
                  })}
                </ul>}
              </section>)}
              {course.modules.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Curriculum content will be added soon.</p>}
            </div>
          </>}
          {activeTab === 'roadmap' && <div><h2 className="text-xl font-semibold text-slate-950">Learning roadmap</h2><p className="mt-2 text-sm text-slate-600">Follow the course in order and track your progress as you go.</p><Link to={routes.roadmap(course.id)} className="btn-primary mt-5 inline-flex">Open roadmap <ChevronRight className="h-4 w-4" /></Link></div>}
          {activeTab === 'about' && <div><h2 className="text-xl font-semibold text-slate-950">About this course</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{course.description}</p>{course.learning_outcomes.length > 0 && <><h3 className="mt-6 font-semibold text-slate-900">Learning outcomes</h3><ul className="mt-3 grid gap-3 sm:grid-cols-2">{course.learning_outcomes.map((outcome, index) => <li key={index} className="flex gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{outcome}</li>)}</ul></>}</div>}
          {activeTab === 'notes' && <div><h2 className="text-xl font-semibold text-slate-950">Your notes</h2><p className="mt-2 text-sm text-slate-600">Keep personal notes for this course. Notes remain in this view while it is open.</p><textarea value={courseNotes} onChange={(event) => setCourseNotes(event.target.value)} placeholder="Capture key concepts, questions, or things to revisit…" className="input-field mt-4 min-h-48 w-full resize-y text-sm" aria-label="Course notes" /></div>}
        </section>

        {courseView === 'completion' && <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
          <h2 className="text-xl font-semibold text-slate-950">Next course for you</h2>
          <p className="mt-2 text-sm text-slate-600">Ready to keep building your skills? Explore more courses and choose your next learning goal.</p>
          <Link to={routes.explore()} className="btn-primary mt-4 inline-flex">Explore courses <ChevronRight className="h-4 w-4" /></Link>
        </section>}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{course.title}</p><p className="text-xs text-slate-500">{isCompleted ? 'Completed' : `${Math.round(progressPct)}% complete`}</p></div>
            <button type="button" onClick={handleStartLearning} className="btn-primary shrink-0">{isCompleted ? 'Review' : progressPct > 0 ? 'Continue' : 'Start'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bfs-shell py-8 sm:py-10">
      {showStickyMiniHeader && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{course.title}</p>
              <p className="text-xs text-slate-500">{isPaidCourse ? formatCoursePrice(purchaseChoice === 'individual' ? salePrice : Number(subscriptionPlans[0]?.price || 0), currency) : 'Free'}{course.cardMetadata?.qualityScore != null ? ' · ' + Math.round(course.cardMetadata.qualityScore) + '/100 curated' : ''}</p>
            </div>
            <button type="button" onClick={isPaidCourse ? (purchaseChoice === 'subscription' ? () => navigate(routes.pricing()) : handleCheckout) : handleEnroll} disabled={enrolling || checkoutLoading || !enrollmentEnabled} className="btn-primary shrink-0 px-4 py-2 text-sm">
              {enrolling || checkoutLoading ? 'Please wait…' : isPaidCourse ? (purchaseChoice === 'subscription' ? 'Subscribe' : 'Buy for ' + formatCoursePrice(salePrice, currency)) : 'Enroll free'}
            </button>
          </div>
        </div>
      )}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link to={routes.explore()} className="hover:text-violet-700">Explore</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{displayTopic}</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[60vw] truncate text-slate-700">{course.title}</span>
      </nav>

      {/* Pre-enrollment sales hero */}
      <div ref={heroRef} className="mt-4 overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 p-6 text-white shadow-sm sm:p-9">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{displayTopic}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{course.level}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{sourceType}</span>
          {qualityScore !== null && qualityScore >= 85 && <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-semibold text-emerald-200">Hidden gem</span>}
        </div>
        <h1 className="mt-5 max-w-4xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{course.title}</h1>
        <ExpandableText
          text={getCourseCardDescription(course)}
          maxLength={260}
          className="mt-3 max-w-3xl text-sm leading-6 text-slate-300"
        />
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
          {creatorName && <span>Created by <strong className="text-white">{creatorName}</strong></span>}
          {course.updated_at && <span>Last updated {formatDate(course.updated_at)}</span>}
          {course.modules.length > 1 && <span>{course.modules.length} modules</span>}
          <span>{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</span>
          {course.duration && <span>{course.duration}</span>}
        </div>
      </div>

      <section aria-label="Course trust and key stats" className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Curation score</p><p className="mt-1 text-xl font-bold text-slate-950">{qualityScore !== null ? Math.round(qualityScore) + '/100' : 'Curated content'}</p></div>
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Learners enrolled</p><p className="mt-1 text-xl font-bold text-slate-950">{learnerCount > 0 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(learnerCount) : 'Be among the first'}</p></div>
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Estimated time</p><p className="mt-1 text-xl font-bold text-slate-950">{course.duration || 'Self-paced'}</p></div>
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Learning items</p><p className="mt-1 text-xl font-bold text-slate-950">{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</p></div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Learning outcomes: use author-provided outcomes first, then derive concise outcomes from the visible curriculum. */}
          {outcomes.length > 0 && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 sm:p-7">
              <h2 className="text-xl font-semibold text-slate-950">What you’ll learn</h2>
              <p className="mt-1 text-sm text-slate-500">Key skills and topics covered in this course.</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {outcomes.map((outcome, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="rounded-[24px] border border-slate-200 bg-white p-6 sm:p-7">
            <h2 className="text-xl font-semibold text-slate-950">This course includes</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {courseIncludes.map(({ icon: IncludeIcon, label }) => (
                <li key={label} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <IncludeIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </section>

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
                  onClick={isPaidCourse ? (purchaseChoice === 'subscription' ? () => navigate(routes.pricing()) : handleCheckout) : handleEnroll}
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
