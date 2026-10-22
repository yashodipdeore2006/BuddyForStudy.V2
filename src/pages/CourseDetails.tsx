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
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Play,
  AlertCircle,
  Loader2,
  ListChecks,
  Star,
  Share2,
  ShieldCheck,
  Video,
  Smartphone,
  Award,
  CircleHelp,
  Sparkles,
  NotebookPen,
  Flame,
} from 'lucide-react';
import { classNames, formatDate } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import ExpandableText from '@/components/ExpandableText';
import { routes } from "@/lib/routes";
import { getCourseCardDescription } from "@/lib/courseCardDescription";
import { shareCourseLink } from "@/lib/shareCourse";
import {
  courseTimestampNotesKey,
  formatMediaTimestamp,
  loadTimestampedCourseNotes,
  type TimestampedCourseNote,
} from "@/lib/courseNotes";

function formatCoursePrice(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

type CourseReview = { _id: string; rating: number; comment?: string; createdAt?: string; moderationStatus?: string; user?: { _id?: string; id?: string; name?: string } | null; };
type CourseReviewStats = { count: number; average: number; distribution?: Record<string, number>; };

type RelatedCourseCard = {
  id: string;
  title: string;
  category: string;
  description: string;
  duration: string;
  thumbnail: string | null;
  pricing?: Course['pricing'];
  level: string;
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

function parseLessonDuration(value: unknown): number {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 0;
  const iso = text.match(/^pt(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const clock = text.match(/^\d+(?::\d{1,2}){1,2}$/);
  if (clock) {
    const parts = text.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+)\s*m/);
  const seconds = text.match(/(\d+)\s*s/);
  return Math.round(Number(hours?.[1] || 0) * 3600 + Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0));
}

function getLessonDurationSeconds(lesson: Course['modules'][number]['lessons'][number]): number {
  if (Number(lesson.durationSeconds) > 0) return Number(lesson.durationSeconds);
  const tutorialVideos = lesson.tutorial?.videos || [];
  const projectVideos = lesson.project?.videos || [];
  const videos = [...tutorialVideos, ...projectVideos];
  const videoDuration = videos.reduce((sum, video) =>
    sum + Math.max(0, Number(video.durationSeconds) || parseLessonDuration('duration' in video ? video.duration : undefined)), 0);
  return videoDuration || Math.max(0, parseLessonDuration((lesson as typeof lesson & { duration?: string }).duration));
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

type SubscriptionPlanSummary = { price?: number | string; billingInterval?: string };
type RawCourseLesson = { _id?: string; id?: string; lessonId?: string; type?: string; completedAt?: string; [key: string]: unknown };
type RawCourseModule = { _id?: string; id?: string; lessons?: RawCourseLesson[]; [key: string]: unknown };
type RawCompletedLesson = { lessonId?: string; type?: string; completedAt?: string };

export default function CourseDetails() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [learningStats, setLearningStats] = useState<{ currentStreak?: number; longestStreak?: number } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0]));
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [reviewStats, setReviewStats] = useState<CourseReviewStats>({ count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const myReview = session ? reviews.find((review) => String(review.user?._id ?? review.user?.id ?? '') === String(session.user.id)) : undefined;

  useEffect(() => {
    if (!myReview) return;
    setReviewRating(myReview.rating);
    setReviewComment(myReview.comment || '');
  }, [myReview]);
  const [shareNotice, setShareNotice] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlanSummary[]>([]);
  const [planCourseAccess, setPlanCourseAccess] = useState(false);
  const [purchaseChoice, setPurchaseChoice] = useState<'subscription' | 'individual'>('subscription');
  const [courseNotes, setCourseNotes] = useState('');
  const [notesStorageReady, setNotesStorageReady] = useState(false);
  const [loadedNotesKey, setLoadedNotesKey] = useState('');
  const [timestampedNotes, setTimestampedNotes] = useState<TimestampedCourseNote[]>([]);
  const [relatedCourses, setRelatedCourses] = useState<RelatedCourseCard[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showStickyMiniHeader, setShowStickyMiniHeader] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const notesStorageKey = courseId ? 'bfs-course-notes:' + String(session?.user?.id || 'anonymous') + ':' + courseId : '';
  const timestampNotesKey = courseId ? courseTimestampNotesKey(String(session?.user?.id || 'anonymous'), courseId) : '';

  useEffect(() => {
    setNotesStorageReady(false);
    if (!notesStorageKey) {
      setCourseNotes('');
      setLoadedNotesKey('');
      return;
    }
    let saved = '';
    try { saved = window.localStorage.getItem(notesStorageKey) || ''; } catch { /* Storage may be unavailable in private browsing. */ }
    setCourseNotes(saved);
    setLoadedNotesKey(notesStorageKey);
    setNotesStorageReady(true);
  }, [notesStorageKey]);

  useEffect(() => {
    if (!notesStorageReady || !notesStorageKey || loadedNotesKey !== notesStorageKey) return;
    try { window.localStorage.setItem(notesStorageKey, courseNotes); } catch { /* Keep notes usable for the current page if storage is unavailable. */ }
  }, [courseNotes, loadedNotesKey, notesStorageKey, notesStorageReady]);

  useEffect(() => {
    setTimestampedNotes(timestampNotesKey ? loadTimestampedCourseNotes(timestampNotesKey) : []);
  }, [timestampNotesKey]);

  useEffect(() => {
    if (!course?.id) return;
    let active = true;
    apiFetch('/api/courses?page=1&limit=30')
      .then((data) => {
        if (!active) return;
        const topicTokens = getDisplayTopic(course).toLowerCase().match(/[a-z]+/g)?.filter((token) => token.length > 3) || [];
        const rows: RelatedCourseCard[] = (data.courses || data.items || []).map((raw: Record<string, unknown>) => ({
          id: String(raw?._id ?? raw?.id ?? ''),
          title: String(raw?.title ?? ''),
          category: String(raw?.category ?? ''),
          description: String(raw?.description ?? ''),
          duration: String(raw?.duration ?? ''),
          thumbnail: raw?.thumbnail || null,
          pricing: raw?.pricing,
          level: String(raw?.level ?? 'Beginner'),
        })).filter((item: RelatedCourseCard) => item.id && item.id !== String(course.id) && item.title);
        const ranked = rows.map((item) => {
          const haystack = (item.title + ' ' + item.description + ' ' + item.category).toLowerCase();
          const score = topicTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
          const sameCategory = course.category && !/^(youtube discovery|ai course search|youtube|course search|discovery)$/i.test(course.category)
            && item.category.toLowerCase() === course.category.toLowerCase();
          return { item, score: score + (sameCategory ? 2 : 0) };
        }).filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((entry) => entry.item);
        setRelatedCourses(ranked);
      })
      .catch(() => { if (active) setRelatedCourses([]); });
    return () => { active = false; };
  }, [course?.id]);

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
        if (active) setSubscriptionPlans([...(data.plans || [])].sort((a, b) => Number(a.price || 0) - Number(b.price || 0)));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setReviews([]);
    setReviewStats({ count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    setReviewsLoading(true);
    setReviewsError('');
    apiFetch(`/api/reviews/courses/${courseId}`)
      .then((reviewData) => {
        if (!active) return;
        setReviews(Array.isArray(reviewData.reviews) ? reviewData.reviews : []);
        setReviewStats(reviewData.stats || { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
      })
      .catch((reviewError) => {
        if (!active) return;
        console.warn('Course reviews unavailable:', reviewError);
        setReviewsError('Ratings and reviews are temporarily unavailable. Please try again.');
      })
      .finally(() => { if (active) setReviewsLoading(false); });
    return () => { active = false; };
  }, [courseId]);

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
          modules: (raw.modules || []).map((m: RawCourseModule) => ({
            ...m,
            id: String(m._id ?? m.id),
            lessons: (m.lessons || []).map((l: RawCourseLesson) => ({
              ...l,
              id: String(l._id ?? l.id),
            })),
          })),
        } as Course);

        if (session) {
          try {
            const entitlementData = await apiFetch('/api/billing/entitlements');
            const hasPlanAccess = raw.pricing?.mode === 'paid' && Boolean(entitlementData?.features?.published_courses);
            setPlanCourseAccess(hasPlanAccess);

            let enrollmentData: { enrollment?: Enrollment } | null = null;
            try {
              enrollmentData = await apiFetch(`/api/enrollments/course/${courseId}`);
            } catch {
              // A learner with an eligible all-courses plan can be enrolled
              // without paying for the course individually.
              if (hasPlanAccess) {
                enrollmentData = await apiFetch(`/api/enrollments/${courseId}`, { method: 'POST' });
              }
            }
            if (enrollmentData?.enrollment) setEnrollment(enrollmentData.enrollment);

            const pData = await apiFetch(`/api/progress/${courseId}`);
            const rawProgress = pData.progress;
            setProgress({
              ...rawProgress,
              id: String(rawProgress._id ?? rawProgress.id),
              user_id: String(rawProgress.user ?? rawProgress.user_id),
              course_id: String(rawProgress.course ?? rawProgress.course_id),
              completed_lessons: (rawProgress.completedLessons ?? []).map((item: RawCompletedLesson) => ({
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
        } else {
          setPlanCourseAccess(false);
        }

        if (session) {
          try {
            const achievementData = await apiFetch('/api/achievements/me');
            setLearningStats(achievementData.stats ?? null);
          } catch {
            setLearningStats(null);
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
            window.dispatchEvent(new CustomEvent("bfs:course-enrollment-updated", { detail: { courseId: String(courseId), status: String(enrollmentData.enrollment?.status || "active") } }));
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
    if (course.pricing?.mode === 'paid' && !planCourseAccess) { await handleCheckout(); return; }
    setEnrolling(true); setError(null);
    try {
      const data = await apiFetch(`/api/enrollments/${courseId}`, { method: 'POST' });
      setEnrollment(data.enrollment);
      window.dispatchEvent(new CustomEvent("bfs:course-enrollment-updated", { detail: { courseId: String(courseId), status: String(data.enrollment?.status || "active") } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll. Please try again.');
    } finally { setEnrolling(false); }
  };

  const handleSelectedPurchase = () => {
    if (isPaidCourse && planCourseAccess) {
      void handleEnroll();
      return;
    }
    if (isPaidCourse && purchaseChoice === 'subscription') {
      if (!session) {
        navigate(routes.login(), { state: { from: { pathname: routes.pricing() } } });
        return;
      }
      navigate(routes.pricing());
      return;
    }
    if (isPaidCourse) {
      void handleCheckout();
      return;
    }
    void handleEnroll();
  };


  const submitReview = async () => {
    if (!courseId || !session || reviewSaving) return;
    setReviewSaving(true);
    setError(null);
    setReviewNotice('');
    try {
      const data = await apiFetch(`/api/reviews/courses/${courseId}`, {
        method: 'POST',
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      const savedReview = data.review as CourseReview;
      setReviewNotice(savedReview?.moderationStatus === 'pending'
        ? 'Your review was submitted and will appear after moderation.'
        : 'Your review has been saved.');

      try {
        const reviewData = await apiFetch(`/api/reviews/courses/${courseId}`);
        setReviews(Array.isArray(reviewData.reviews) ? reviewData.reviews : []);
        setReviewStats(reviewData.stats || { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
        setReviewsError('');
      } catch {
        setReviewsError('Your review was saved, but the published reviews could not be refreshed. Please retry.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save review');
    } finally {
      setReviewSaving(false);
    }
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
    const lessons = getAllLessonsFlat(course.modules);
    const completed = new Set((progress?.completed_lessons || []).map((item) => String(item.lessonId)));
    const next = lessons.find((lesson) => !completed.has(String(lesson.id)));
    // Keep the next module open during learning; after completion, reopen the
    // last accessed/completed module so learners can review without hunting.
    const focusLessonId = next?.id ?? progress?.last_lesson_id ?? progress?.completed_lessons?.[progress.completed_lessons.length - 1]?.lessonId;
    const targetIndex = focusLessonId
      ? course.modules.findIndex((module) => module.lessons.some((lesson) => String(lesson.id) === String(focusLessonId)))
      : 0;
    if (targetIndex >= 0) setExpandedModules(new Set([targetIndex]));
  }, [course?.id, enrollment?.status, progress?.last_lesson_id, progress?.percentage, progress?.completed_count]);

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
  const displayTopic = getDisplayTopic(course);
  const handleShareCourse = async () => {
    const result = await shareCourseLink({ courseId: String(course.id), title: course.title, text: "Explore " + course.title + " on BuddyForStudy" });
    setShareNotice(result === "shared" ? "Course shared." : result === "copied" ? "Course link copied." : "Unable to share this course.");
    if (result !== "failed") window.setTimeout(() => setShareNotice(""), 2500);
  };
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
    lessonCount > 0 ? { icon: NotebookPen, label: 'Timestamped notes for each lesson' } : null,
    projectCount > 0 ? { icon: ListChecks, label: projectCount + ' practical project' + (projectCount === 1 ? '' : 's') } : null,
    course.certificateEnabled !== false ? { icon: Award, label: 'Certificate eligibility enabled' } : null,
    { icon: Smartphone, label: 'Access on desktop and mobile' },
  ].filter((item): item is { icon: LucideIcon; label: string } => Boolean(item));
  // CP-01..CP-11: this route renders sales content before enrollment and a learning dashboard afterward.
  const isCompleted = isEnrolled && (enrollment?.status === 'completed' || progressPct >= 100);
  const durationMinutes = parseCourseDurationMinutes(course.duration || '');
  const estimatedMinutesLeft = durationMinutes === null ? null : Math.ceil(durationMinutes * (100 - Math.min(100, Math.max(0, isCompleted ? 100 : progressPct))) / 100);
  const courseView = !isEnrolled ? 'sales' : isCompleted ? 'completion' : 'hub';
  const hubTabs = ['overview', 'curriculum', 'reviews', 'notes', 'about'];
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <Link to={routes.myLearning()} className="hover:text-violet-700">My learning</Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-slate-800">{course.title}</span>
          </nav>
          <button type="button" onClick={() => void handleShareCourse()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-300 hover:text-violet-700" aria-label="Share course"><Share2 className="h-4 w-4" aria-hidden="true" />Share</button>
        </div>
        {shareNotice && <p role="status" className="mb-3 text-right text-sm text-emerald-700">{shareNotice}</p>}

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
          <ExpandableText
              text={getCourseCardDescription(course)}
              maxLength={140}
              lines={2}
              presentation="popup"
              popupTitle={course.title + " — Description"}
              className="mt-3 max-w-3xl text-sm leading-6 text-slate-600"
            />
          <button type="button" onClick={() => setCourseTab('reviews')} className="mt-4 inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50/70"><span className="inline-flex items-center gap-1.5 font-bold text-slate-900"><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />{reviewStats.count ? reviewStats.average.toFixed(1) : 'New course'}</span><span className="text-sm text-slate-600">{reviewStats.count ? reviewStats.count + (reviewStats.count === 1 ? ' review' : ' reviews') : 'Be the first to review'}</span><span className="text-sm font-semibold text-violet-700">Read reviews <ChevronRight className="inline h-4 w-4" aria-hidden="true" /></span></button>
          <div className="mt-6 grid gap-5 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700">Your learning progress</p>
                <p className="text-3xl font-bold tracking-tight text-violet-800">{Math.round(isCompleted ? 100 : progressPct)}<span className="ml-1 text-base font-semibold">%</span></p>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isCompleted ? 100 : Math.round(progressPct)}>
                <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, isCompleted ? 100 : progressPct))}%` }} />
              </div>
              {flatLessons.length > 0 ? <p className="mt-3 text-sm font-medium text-slate-800">{progress?.completed_count ?? completedLessonIds.size} of {progress?.total_lessons ?? flatLessons.length} lessons completed{estimatedMinutesLeft !== null && !isCompleted ? ` · about ${formatDurationSeconds(estimatedMinutesLeft * 60)} left` : ''}</p> : <p className="mt-3 text-sm text-slate-600">Progress tracking begins when lessons are available.</p>}
              {progress?.last_accessed_at && <p className="mt-1 text-xs text-slate-500">Last accessed {formatDate(progress.last_accessed_at)}</p>}
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-white bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next lesson</p>
              <p className="mt-1 line-clamp-2 font-semibold text-slate-900">{isCompleted ? 'Course completed' : nextLesson ? cleanLessonTitle(nextLesson.title, flatLessons.map((lesson) => lesson.title)) : 'Curriculum coming soon'}</p>
              {nextLesson && getLessonDurationSeconds(nextLesson) > 0 && <p className="mt-1 text-xs text-slate-500">{formatDurationSeconds(getLessonDurationSeconds(nextLesson))}</p>}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => navigate(routes.roadmap(String(course.id)))} className="btn-secondary max-w-full">Journey Roadmap</button>
            <button type="button" onClick={handleStartLearning} className="btn-primary max-w-full">
              {isCompleted ? 'Review course' : progressPct > 0 ? 'Continue: ' + cleanLessonTitle(nextLesson?.title || 'learning', flatLessons.map((lesson) => lesson.title)) : 'Start learning'} <ChevronRight className="h-4 w-4 shrink-0" />
            </button>

          </div>
        </section>

        <div className="mt-8 border-b border-slate-200">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Course sections">
            {hubTabs.map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setCourseTab(tab)} className={classNames('shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors', activeTab === tab ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-900')}>
                {{ overview: 'Overview', curriculum: 'Curriculum', reviews: 'Ratings & Reviews', notes: 'Notes', about: 'About' }[tab]}
              </button>
            ))}
          </div>
        </div>

        <section id={activeTab === 'reviews' ? 'reviews' : undefined} role="tabpanel" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
          {activeTab === 'overview' && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Your next lessons</h2>
              <p className="mt-1 text-sm text-slate-500">Pick up where you left off, or preview what comes next.</p>
              <div className="mt-4 space-y-2">
                {flatLessons.filter((lesson) => !completedLessonIds.has(String(lesson.id))).slice(0, 3).map((lesson) => {
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
                {timestampedNotes.length > 0 && <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest lesson notes</p>
                  {timestampedNotes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map((note) => (
                    <Link key={note.id} to={routes.learn(course.id, note.lessonId)} className="block rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <span className="flex items-center justify-between gap-2 text-xs font-semibold text-violet-700"><span className="line-clamp-1">{note.lessonTitle}</span><span>{formatMediaTimestamp(note.timestampSeconds)}</span></span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-600">{note.content}</span>
                    </Link>
                  ))}
                </div>}
                <button type="button" onClick={() => setCourseTab('notes')} className="mt-3 text-sm font-semibold text-violet-700 hover:text-violet-900">Open notes</button>
              </div>
              {isEnrolled && progressPct >= 25 && session && !reviews.some((review) => String(review.user?._id ?? review.user?.id ?? '') === String(session.user.id)) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-semibold text-slate-900">How’s the course going?</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">You’ve made progress. Share a rating to help other learners decide.</p>
                  <div className="mt-2 flex gap-1" role="group" aria-label="Rate this course">
                    {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => setReviewRating(star)} aria-label={'Rate ' + star + ' of 5 stars'} aria-pressed={reviewRating === star} className="rounded p-0.5"><Star className={classNames('h-5 w-5', star <= reviewRating ? 'text-amber-500' : 'text-slate-300')} fill={star <= reviewRating ? 'currentColor' : 'none'} /></button>)}
                  </div>
                  <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={1000} placeholder="Optional feedback" aria-label="Course feedback" className="input-field mt-3 min-h-16 w-full text-sm" />
                  <button type="button" onClick={submitReview} disabled={reviewSaving} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{reviewSaving ? 'Saving…' : 'Rate this course'}</button>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Learning activity</p>
                <p className="mt-2 text-sm text-slate-600">{progress?.last_accessed_at ? 'Last accessed ' + formatDate(progress.last_accessed_at) : 'Your first lesson is ready when you are.'}</p>
                {learningStats && <p className="mt-2 flex items-center gap-2 text-sm font-medium text-amber-700"><Flame className="h-4 w-4" aria-hidden="true" />{Number(learningStats.currentStreak || 0)}-day learning streak{Number(learningStats.longestStreak || 0) > Number(learningStats.currentStreak || 0) ? ' · best ' + Number(learningStats.longestStreak) + ' days' : ''}</p>}
                {course.modules.length > 1 && <p className="mt-2 text-xs text-slate-500">{course.modules.length} modules in this course</p>}
              </div>
            </aside>
          </div>}
          {activeTab === 'curriculum' && <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Curriculum</h2>
                <p className="mt-1 text-sm text-slate-500">{course.modules.length > 1 ? course.modules.length + ' modules · ' : ''}{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</p>
              </div>
              {course.modules.length > 0 && <button type="button" onClick={() => setExpandedModules((previous) => previous.size === course.modules.length ? new Set() : new Set(course.modules.map((_, index) => index)))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {expandedModules.size === course.modules.length ? 'Collapse all' : 'Expand all'}
              </button>}
            </div>
            <div className="space-y-4">
              {course.modules.map((module, moduleIndex) => {
                const moduleDone = module.lessons.filter((lesson) => completedLessonIds.has(String(lesson.id))).length;
                const isExpanded = expandedModules.has(moduleIndex);
                const moduleDuration = module.lessons.reduce((sum, lesson) => sum + getLessonDurationSeconds(lesson), 0);
                const moduleDurationLabel = moduleDuration > 0 ? formatDurationSeconds(moduleDuration) : course.modules.length === 1 ? course.duration : '';
                const titles = module.lessons.map((lesson) => lesson.title);
                return <section key={module.id} id={"curriculum-module-" + moduleIndex} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200">
                  <button type="button" onClick={() => toggleModule(moduleIndex)} aria-expanded={isExpanded} className={classNames('flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-slate-50', isExpanded ? 'bg-violet-50/40' : 'bg-white')}>
                    <span className="flex min-w-0 items-start gap-3">
                      {isExpanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{module.title}</span>
                        <span className="mt-1 block text-xs text-slate-500">{module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}{moduleDurationLabel ? ' · ' + moduleDurationLabel : ''} · {moduleDone}/{module.lessons.length} done</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">{module.lessons.length ? Math.round(moduleDone / module.lessons.length * 100) : 0}%</span>
                  </button>
                  {isExpanded && <ul className="divide-y divide-slate-100 border-t border-slate-200">
                    {module.lessons.map((lesson) => {
                      const done = completedLessonIds.has(String(lesson.id));
                      const isNext = !isCompleted && String(nextLesson?.id) === String(lesson.id);
                      const LessonIcon: LucideIcon = lesson.type === 'quiz' ? CircleHelp : lesson.type === 'project' ? ListChecks : Play;
                      const title = cleanLessonTitle(lesson.title, titles);
                      const duration = getLessonDurationSeconds(lesson);
                      const statusText = done ? 'Completed' : isNext ? 'Up next' : lesson.type === 'quiz' ? 'Quiz' : lesson.type === 'project' ? 'Project' : 'Video lesson';
                      return <li key={lesson.id}>
                        <Link to={routes.learn(course.id, lesson.id)} className={classNames('flex items-center gap-3 px-4 py-3 text-sm transition', isNext ? 'bg-violet-50/70 hover:bg-violet-50' : 'hover:bg-slate-50')}>
                          {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : isNext ? <Play className="h-4 w-4 shrink-0 text-violet-600" /> : <LessonIcon className="h-4 w-4 shrink-0 text-slate-400" />}
                          <span className="min-w-0 flex-1"><span className="block line-clamp-2 font-medium text-slate-800">{title}</span>{isNext && <span className="mt-0.5 block text-xs font-semibold text-violet-700">Your next lesson</span>}</span>
                          <span className="shrink-0 text-xs text-slate-500">{duration > 0 ? formatDurationSeconds(duration) : statusText}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </Link>
                      </li>;
                    })}
                  </ul>}
                </section>;
              })}
              {course.modules.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Curriculum content will be added soon.</p>}
            </div>
          </>}
          {activeTab === 'reviews' && <section aria-labelledby="learner-reviews-title" className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Learner feedback</p><h2 id="learner-reviews-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Ratings & Reviews</h2><p className="mt-1 text-sm text-slate-500">Reviews from learners of this course.</p></div>
              <button type="button" disabled={reviewsLoading} onClick={async () => { setReviewsLoading(true); setReviewsError(''); try { const data = await apiFetch('/api/reviews/courses/' + courseId); setReviews(Array.isArray(data.reviews) ? data.reviews : []); setReviewStats(data.stats || { count: 0, average: 0, distribution: {} }); } catch { setReviewsError('Unable to refresh reviews right now.'); } finally { setReviewsLoading(false); } }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{reviewsLoading ? 'Refreshing…' : 'Refresh reviews'}</button>
            </div>
            <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <p className="text-sm font-semibold text-slate-600">Course rating</p>
                <div className="mt-2 flex items-end gap-2"><span className="text-5xl font-extrabold tracking-tight text-slate-950">{reviewStats.count ? reviewStats.average.toFixed(1) : '—'}</span><span className="pb-1 text-sm text-slate-500">out of 5</span></div>
                <div className="mt-2 flex items-center gap-1 text-amber-400" aria-label={reviewStats.count ? reviewStats.average.toFixed(1) + ' out of 5 stars' : 'No ratings yet'}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-5 w-5" fill={reviewStats.count > 0 && star <= Math.round(reviewStats.average) ? 'currentColor' : 'none'} />)}</div>
                <p className="mt-2 text-xs text-slate-500">Based on {reviewStats.count} {reviewStats.count === 1 ? 'review' : 'reviews'}</p>
                <div className="mt-5 space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => { const count = Number(reviewStats.distribution?.[String(star)] || 0); const percent = reviewStats.count ? count / reviewStats.count * 100 : 0; return <div key={star} className="flex items-center gap-2 text-xs"><span className="w-3 text-slate-600">{star}</span><Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" /><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: percent + '%' }} /></div><span className="w-5 text-right text-slate-500">{count}</span></div>; })}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">{myReview ? 'Your review' : 'Share your experience'}</h3><p className="mt-1 text-sm text-slate-500">{myReview ? 'Update your existing rating or comment below.' : 'Your feedback helps other learners choose the right course.'}</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{isCompleted ? 'Course completed' : 'Enrolled learner'}</span></div>
                <div className="mt-4 flex items-center gap-1" role="group" aria-label="Choose a rating from 1 to 5 stars">
                  {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => setReviewRating(star)} aria-label={'Rate ' + star + ' out of 5 stars'} aria-pressed={reviewRating === star} className="rounded-lg p-1 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600"><Star className={classNames('h-7 w-7', star <= reviewRating ? 'text-amber-400' : 'text-slate-300')} fill={star <= reviewRating ? 'currentColor' : 'none'} /></button>)}
                  <span className="ml-2 text-sm font-semibold text-slate-700">{reviewRating}/5</span>
                </div>
                <label htmlFor="course-review-comment" className="mt-4 block text-sm font-semibold text-slate-700">Your comment <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea id="course-review-comment" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={1000} placeholder="What did you learn? What worked well?" className="input-field mt-2 min-h-28 w-full resize-y text-sm" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-400">{reviewComment.length}/1000 characters</span><button type="button" onClick={() => void submitReview()} disabled={reviewSaving} className="btn-primary">{reviewSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving review…</> : myReview ? 'Update review' : 'Submit review'}</button></div>
                {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                {reviewNotice && <p role="status" className="mt-3 text-sm text-emerald-700">{reviewNotice}</p>}
                <p className="mt-3 text-xs leading-5 text-slate-500">Your submission updates your existing review instead of creating a duplicate.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div><h3 className="text-lg font-bold text-slate-950">Learner reviews</h3><p className="mt-1 text-sm text-slate-500">{reviewStats.count} published {reviewStats.count === 1 ? 'review' : 'reviews'}</p></div></div>
            {reviewsError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{reviewsError}</p>}
            {reviewsLoading ? <div className="space-y-3" role="status" aria-label="Loading course reviews">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div> : reviews.length ? <div className="space-y-3">
              {reviews.map((review) => <article key={review._id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{(review.user?.name || 'Learner').trim().charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{review.user?.name || 'Learner'}</p><p className="mt-0.5 text-xs text-slate-500">{review.createdAt ? formatDate(review.createdAt) : 'Review'}</p></div></div><div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-700" aria-label={review.rating + ' out of 5 stars'}><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />{review.rating}.0</div></div>
                <div className="mt-3">{review.comment?.trim() ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{review.comment}</p> : <p className="text-sm italic text-slate-500">Rated this course without leaving a comment.</p>}</div>
                {session && String(review.user?._id ?? review.user?.id ?? '') === String(session.user.id) && <p className="mt-3 text-xs font-semibold text-violet-700">Your review</p>}
              </article>)}
            </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm"><Star className="h-6 w-6" /></div><h4 className="mt-4 font-bold text-slate-900">No published reviews yet</h4><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">Be the first to share your experience with this course.</p></div>}
          </section>}
          {activeTab === 'about' && <div><h2 className="text-xl font-semibold text-slate-950">About this course</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{getCourseCardDescription(course)}</p>{outcomes.length > 0 && <><h3 className="mt-6 font-semibold text-slate-900">Learning outcomes</h3><ul className="mt-3 grid gap-3 sm:grid-cols-2">{outcomes.map((outcome, index) => <li key={index} className="flex gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{outcome}</li>)}</ul></>}{creatorName && <div className="mt-7 rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source creator</p><p className="mt-1 font-semibold text-slate-900">{creatorName}</p></div>}</div>}
          {activeTab === 'notes' && <div>
            <h2 className="text-xl font-semibold text-slate-950">Your notes</h2>
            <p className="mt-2 text-sm text-slate-600">Course notes and timestamped notes are saved in this browser for this account and course.</p>
            <label className="mt-4 block text-sm font-semibold text-slate-800" htmlFor="course-wide-notes">Course notes</label>
            <textarea id="course-wide-notes" value={courseNotes} onChange={(event) => setCourseNotes(event.target.value)} placeholder="Capture key concepts, questions, or items to revisit…" className="input-field mt-2 min-h-36 w-full resize-y text-sm" aria-label="Course notes" />
            <section className="mt-8" aria-labelledby="timestamped-course-notes-title">
              <h3 id="timestamped-course-notes-title" className="text-lg font-semibold text-slate-950">Notes by lesson</h3>
              {timestampedNotes.length === 0 ? <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No timestamped lesson notes yet. Open a lesson and save a note at the relevant timestamp.</p> : (
                <div className="mt-3 space-y-4">
                  {Array.from(new Map<string, string>(timestampedNotes.map((note): [string, string] => [note.lessonId, note.lessonTitle])).entries()).map(([lessonKey, lessonTitle]) => (
                    <section key={lessonKey} className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                        <h4 className="font-semibold text-slate-900">{lessonTitle}</h4>
                        <Link to={routes.learn(course.id, lessonKey)} className="shrink-0 text-xs font-semibold text-violet-700 hover:underline">Open lesson</Link>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {timestampedNotes.filter((note) => note.lessonId === lessonKey).sort((a, b) => a.timestampSeconds - b.timestampSeconds).map((note) => (
                          <li key={note.id} className="flex items-start gap-3 p-4">
                            <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{formatMediaTimestamp(note.timestampSeconds)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.content}</p>
                              <p className="mt-1 text-xs text-slate-400">{formatDate(note.createdAt)}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </div>}
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
            <button type="button" onClick={handleSelectedPurchase} disabled={enrolling || checkoutLoading || !course.is_published || !enrollmentEnabled} className="btn-primary shrink-0 px-4 py-2 text-sm">
              {enrolling || checkoutLoading ? 'Please wait…' : isPaidCourse ? (purchaseChoice === 'subscription' ? (session ? 'Subscribe' : 'Sign in to subscribe') : (session ? 'Buy for ' + formatCoursePrice(salePrice, currency) : 'Sign in to buy')) : (session ? 'Enroll free' : 'Sign in to enroll')}
            </button>
          </div>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link to={routes.explore()} className="hover:text-violet-700">Explore</Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{displayTopic}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="max-w-[45vw] truncate text-slate-700">{course.title}</span>
        </nav>
        <button type="button" onClick={() => void handleShareCourse()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-300 hover:text-violet-700" aria-label="Share course"><Share2 className="h-4 w-4" aria-hidden="true" />Share</button>
      </div>
      {shareNotice && <p role="status" className="mb-3 text-right text-sm text-emerald-700">{shareNotice}</p>}

      {/* Pre-enrollment sales hero */}
      <div ref={heroRef} className="mt-4 overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 p-6 text-white shadow-sm sm:p-9">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{displayTopic}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{course.level}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{sourceType}</span>
          {qualityScore !== null && qualityScore >= 85 && <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-semibold text-emerald-200">Hidden gem</span>}
        </div>
        <h1 className="mt-5 max-w-4xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">{course.title}</h1>
        <ExpandableText
          text={getCourseCardDescription(course)}
          maxLength={180}
          lines={2}
          presentation="popup"
          popupTitle={course.title + " — Description"}
          className="mt-3 max-w-3xl text-sm leading-6 text-slate-300"
        />
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
          {creatorName && <span>Created by {course.cardMetadata?.creatorUrl ? <a href={course.cardMetadata.creatorUrl} target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">{creatorName}</a> : previewVideoId ? <a href={'https://www.youtube.com/watch?v=' + encodeURIComponent(previewVideoId)} target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">{creatorName}</a> : <strong className="text-white">{creatorName}</strong>}</span>}
          {course.updated_at && <span>Last updated {formatDate(course.updated_at)}</span>}
          {course.modules.length > 1 && <span>{course.modules.length} modules</span>}
          <span>{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</span>
          {course.duration && <span>{course.duration}</span>}
        </div>
      </div>

      <section aria-label="Course trust and key stats" className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-5">
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Curation score</p><p className="mt-1 text-xl font-bold text-slate-950">{qualityScore !== null ? Math.round(qualityScore) + '/100' : 'Curated content'}</p></div>
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Learners enrolled</p><p className="mt-1 text-xl font-bold text-slate-950">{learnerCount > 0 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(learnerCount) : 'Be among the first'}</p></div>
        <div className="bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Learner rating</p><p className="mt-1 flex items-center gap-1 text-xl font-bold text-slate-950"><Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />{reviewStats.count > 0 ? reviewStats.average.toFixed(1) : '0.0'} <span className="text-xs font-medium text-slate-500">({reviewStats.count} {reviewStats.count === 1 ? 'rating' : 'ratings'})</span></p></div>
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

          <section id="reviews" className="scroll-mt-24 rounded-[24px] border border-slate-200 bg-white p-6 sm:p-8" aria-labelledby="reviews-heading">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Learner feedback</p><h2 id="reviews-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Ratings & Reviews</h2><p className="mt-1 text-sm text-slate-500">Read feedback from learners who have taken this course.</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3"><div className="flex items-center gap-2"><Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true"/><span className="text-2xl font-extrabold text-slate-950">{reviewStats.count > 0 ? reviewStats.average.toFixed(1) : "—"}</span><span className="text-sm text-slate-500">/ 5</span></div><p className="mt-1 text-xs text-slate-500">{reviewStats.count} published {reviewStats.count === 1 ? "review" : "reviews"}</p></div>
              <button type="button" disabled={reviewsLoading} onClick={async () => { setReviewsLoading(true); setReviewsError(''); try { const data = await apiFetch('/api/reviews/courses/' + courseId); setReviews(Array.isArray(data.reviews) ? data.reviews : []); setReviewStats(data.stats || { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }); } catch { setReviewsError('Unable to refresh reviews right now. Please try again.'); } finally { setReviewsLoading(false); } }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{reviewsLoading ? 'Refreshing…' : 'Refresh reviews'}</button>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
              <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <p className="text-sm font-semibold text-slate-700">Rating breakdown</p>
                <div className="mt-4 space-y-3">{[5,4,3,2,1].map((star) => { const count = Number(reviewStats.distribution?.[String(star)] || 0); const percent = reviewStats.count ? count / reviewStats.count * 100 : 0; return <div key={star} className="flex items-center gap-2 text-xs"><span className="w-3 text-slate-600">{star}</span><Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true"/><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-400 transition-all" style={{width: percent + "%"}}/></div><span className="w-5 text-right text-slate-500">{count}</span></div>; })}</div>
                {isEnrolled ? <div className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm font-semibold text-slate-900">{myReview ? "Update your review" : "Rate this course"}</p><div className="mt-2 flex gap-1" role="group" aria-label="Choose a rating from 1 to 5 stars">{[1,2,3,4,5].map((star) => <button key={star} type="button" onClick={() => setReviewRating(star)} aria-label={"Rate " + star + " out of 5 stars"} aria-pressed={reviewRating === star} className="rounded p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600"><Star className={classNames("h-6 w-6", star <= reviewRating ? "text-amber-400" : "text-slate-300")} fill={star <= reviewRating ? "currentColor" : "none"}/></button>)}</div><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={1000} placeholder="Share your experience (optional)" className="input-field mt-3 min-h-24 w-full resize-y text-sm" aria-label="Review comment (optional)"/><button type="button" onClick={() => void submitReview()} disabled={reviewSaving} className="btn-primary mt-3 w-full">{reviewSaving ? "Saving review…" : myReview ? "Update review" : "Submit review"}</button>{error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}{reviewNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{reviewNotice}</p>}</div> : <div className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm leading-6 text-slate-600">You can read all reviews without enrolling.</p><button type="button" onClick={() => void handleEnroll()} className="mt-2 font-semibold text-violet-700 hover:text-violet-900">Enroll to review <ChevronRight className="inline h-4 w-4" aria-hidden="true" /></button></div>}
              </aside>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-950">Learner reviews</h3>
                {reviewsError && <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{reviewsError}</p>}
                {reviewsLoading ? <div className="mt-4 space-y-3" role="status" aria-label="Loading course reviews">{[1,2,3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100"/> )}</div> : reviews.length ? <div className="mt-3 space-y-3">{reviews.map((review) => <article key={review._id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{(review.user?.name || "Learner").trim().charAt(0).toUpperCase()}</span><div><p className="font-semibold text-slate-900">{review.user?.name || "Learner"}</p><p className="mt-0.5 text-xs text-slate-500">{review.createdAt ? formatDate(review.createdAt) : "Course review"}</p></div></div><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-700"><Star className="h-4 w-4 fill-amber-400 text-amber-400"/>{review.rating}.0</span></div>{review.comment?.trim() ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{review.comment}</p> : <p className="mt-3 text-sm italic text-slate-500">Rated this course without a written comment.</p>}</article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center"><Star className="mx-auto h-8 w-8 text-amber-400"/><h4 className="mt-3 font-semibold text-slate-900">No published reviews yet</h4><p className="mt-1 text-sm text-slate-500">Be the first learner to share your experience.</p></div>}
              </div>
            </div>
          </section>

          {/* Curriculum */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Course curriculum</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {course.modules.length > 1 ? course.modules.length + ' modules · ' : ''}{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
                  {course.duration ? ' · ' + course.duration : ''}
                </p>
              </div>
              {course.modules.length > 0 && <button type="button" onClick={() => setExpandedModules((previous) => previous.size === course.modules.length ? new Set() : new Set(course.modules.map((_, index) => index)))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {expandedModules.size === course.modules.length ? 'Collapse all' : 'Expand all'}
              </button>}
            </div>

            <div className="mt-5 space-y-3">
              {course.modules.map((module, mIdx) => {
                const isExpanded = expandedModules.has(mIdx);
                const moduleDone = module.lessons.filter((lesson) => completedLessonIds.has(String(lesson.id))).length;
                const moduleDuration = module.lessons.reduce((sum, lesson) => sum + getLessonDurationSeconds(lesson), 0);
                const moduleDurationLabel = moduleDuration > 0 ? formatDurationSeconds(moduleDuration) : course.modules.length === 1 ? course.duration : '';
                const moduleLessonTitles = module.lessons.map((lesson) => lesson.title);
                return (
                  <div key={module.id} className="overflow-hidden rounded-2xl border border-slate-200">
                    <button type="button" onClick={() => toggleModule(mIdx)} aria-expanded={isExpanded} className={classNames("flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-slate-50", isExpanded ? "bg-slate-50/70" : "bg-white")}>
                      <span className="flex min-w-0 items-start gap-3">
                        {isExpanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-900">{module.title}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}{moduleDurationLabel ? ' · ' + moduleDurationLabel : ''}{isEnrolled ? ' · ' + moduleDone + '/' + module.lessons.length + ' done' : ''}
                          </span>
                        </span>
                      </span>
                      {isEnrolled && <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:block">{module.lessons.length ? Math.round(moduleDone / module.lessons.length * 100) : 0}%</span>}
                    </button>
                    {isExpanded && (
                      <ul className="divide-y divide-slate-100 border-t border-slate-200">
                        {module.lessons.map((lesson) => {
                          const done = completedLessonIds.has(String(lesson.id));
                          const isNext = Boolean(!isCompleted && nextLesson && String(lesson.id) === String(nextLesson.id));
                          const LessonIcon: LucideIcon = lesson.type === 'quiz' ? CircleHelp : lesson.type === 'project' ? ListChecks : Play;
                          const title = cleanLessonTitle(lesson.title, moduleLessonTitles);
                          const durationSeconds = getLessonDurationSeconds(lesson);
                          const durationLabel = durationSeconds > 0 ? formatDurationSeconds(durationSeconds) : '';
                          const lessonStatus = done ? 'Completed' : isNext ? 'Up next' : lesson.type === 'quiz' ? 'Quiz' : lesson.type === 'project' ? 'Project' : 'Video lesson';
                          return (
                            <li key={lesson.id}>
                              {isEnrolled ? (
                                <Link to={routes.learn(course.id, lesson.id)} className={classNames("flex items-center gap-3 px-4 py-3 text-sm transition", isNext ? "bg-violet-50/70 hover:bg-violet-50" : "hover:bg-slate-50")}>
                                  {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : isNext ? <Play className="h-4 w-4 shrink-0 text-violet-600" /> : <LessonIcon className="h-4 w-4 shrink-0 text-slate-400" />}
                                  <span className="min-w-0 flex-1"><span className="block line-clamp-2 font-medium text-slate-800">{title}</span>{isNext && <span className="mt-0.5 block text-xs font-semibold text-violet-700">Your next lesson</span>}</span>
                                  <span className="shrink-0 text-xs text-slate-500">{durationLabel || lessonStatus}</span>
                                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                </Link>
                              ) : (
                                <div className="flex items-center gap-3 px-4 py-3 text-sm">
                                  <LessonIcon className="h-4 w-4 shrink-0 text-slate-400" />
                                  <span className="min-w-0 flex-1 font-medium text-slate-800">{title}</span>
                                  <span className="shrink-0 text-xs text-slate-500">{durationLabel || (lesson.type === 'quiz' ? 'Quiz' : lesson.type === 'project' ? 'Project' : 'Video lesson')}</span>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {course.modules.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Curriculum content will be added soon.</p>}
            </div>
          </div>

          <section className="rounded-[24px] border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><GraduationCap className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Who this course is for</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Learners interested in {displayTopic.toLowerCase()} at the {String(course.level || 'all').toLowerCase()} level.</p>
              </div>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="font-semibold text-slate-900">Requirements & prerequisites</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">No specific prerequisites have been provided in the course information.</p>
            </div>
          </section>

          {creatorName && <section className="rounded-[24px] border border-slate-200 bg-white p-6 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Course creator</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{creatorName}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">This course includes resources selected from {creatorName}. BuddyForStudy surfaces the source so learners can understand where the learning material comes from.</p>
          </section>}

          <section className="rounded-[24px] border border-slate-200 bg-white p-6 sm:p-7">
            <h2 className="text-lg font-semibold text-slate-950">Frequently asked questions</h2>
            <div className="mt-3 divide-y divide-slate-100">
              <details className="py-3">
                <summary className="cursor-pointer font-medium text-slate-900">How long will this course take?</summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">{course.duration ? 'The listed estimated duration is ' + course.duration + '. You can learn at your own pace.' : 'The course is self-paced; the total duration has not been provided.'}</p>
              </details>
              <details className="py-3">
                <summary className="cursor-pointer font-medium text-slate-900">Can I use this course on mobile?</summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">Yes. BuddyForStudy is designed to work on desktop and mobile screens.</p>
              </details>
              <details className="py-3">
                <summary className="cursor-pointer font-medium text-slate-900">Does this course include a certificate?</summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">{course.certificateEnabled === false ? 'Certificate eligibility is not enabled for this course.' : 'Certificate eligibility is enabled in course settings, but automatic certificate issuance is not yet available in this learning page.'}</p>
              </details>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
              <button type="button" onClick={() => setPreviewOpen(true)} aria-label={previewVideoId ? 'Play course preview' : 'View course preview information'} className="group relative block aspect-video w-full overflow-hidden bg-slate-900 text-white disabled:cursor-not-allowed">
                {course.thumbnail ? <img src={course.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-950" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/10" />
                <span className="absolute inset-0 flex items-center justify-center"><span className={classNames("flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-white/95 text-slate-950 shadow-lg transition", previewVideoId ? "group-hover:scale-105" : "opacity-70")}><Play className="ml-0.5 h-6 w-6 fill-current" /></span></span>
                <span className="absolute bottom-3 left-3 right-3 text-left text-sm font-semibold text-white">{previewVideoId ? 'Preview this course' : 'Video preview unavailable'}</span>
              </button>
              <div className="bg-white p-3 text-xs leading-5 text-slate-500">{creatorName ? 'Source creator: ' + creatorName : 'Preview the learning content before enrolling.'}</div>
            </div>
            {!isPaidCourse && (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Course price</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-900">Free</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">Enroll to add this course to your learning library.</p>
              </div>
            )}
            {isPaidCourse && planCourseAccess && !isEnrolled && (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" />Included with your active plan</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">Your subscription includes access to this course. You do not need to buy it separately.</p>
              </div>
            )}
            {isPaidCourse && !planCourseAccess && !isEnrolled && (
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
                      <span className="mt-1 block text-xs text-slate-500">One-time payment · full lifetime access</span>
                      {discountPercent > 0 && <span className="mt-2 inline-flex w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Save {discountPercent}%</span>}
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
                  onClick={handleSelectedPurchase}
                  disabled={enrolling || checkoutLoading || !course.is_published || !enrollmentEnabled}
                  className={classNames("flex w-full items-center justify-center gap-2", isPaidCourse && purchaseChoice === 'individual' ? "btn-buy" : "btn-primary")}
                >
                  {enrolling || checkoutLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{checkoutLoading ? 'Processing checkout...' : 'Enrolling...'}</>
                  ) : isPaidCourse && planCourseAccess ? (
                    session ? 'Start learning with your plan' : 'Sign in to access course'
                  ) : isPaidCourse ? (
                    purchaseChoice === 'subscription' ? (session ? 'Subscribe' : 'Sign in to subscribe') : (session ? 'Buy for ' + formatCoursePrice(salePrice, currency) : 'Sign in to buy')
                  ) : session ? 'Enroll free' : 'Sign in to enroll'}
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
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-500">Topic</span>
                <span className="text-right font-medium text-slate-900">{displayTopic}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-500">Source type</span>
                <span className="text-right font-medium text-slate-900">{sourceType}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-500">Duration</span>
                <span className="text-right font-medium text-slate-900">{course.duration || 'Self-paced'}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-500">Lessons</span>
                <span className="text-right font-medium text-slate-900">{lessonCount}</span>
              </div>
              {course.updated_at && <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-500">Last updated</span>
                <span className="text-right font-medium text-slate-900">{formatDate(course.updated_at)}</span>
              </div>}
              {creatorName && <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-500">Creator</span>
                {previewVideoId ? <a href={'https://www.youtube.com/watch?v=' + encodeURIComponent(previewVideoId)} target="_blank" rel="noreferrer" className="text-right font-semibold text-violet-700 hover:underline">{creatorName}</a> : <span className="text-right font-medium text-slate-900">{creatorName}</span>}
              </div>}
            </div>
          </div>
        </div>
      </div>

      {relatedCourses.length > 0 && (
        <section className="mt-10" aria-labelledby="related-courses-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Keep learning</p>
              <h2 id="related-courses-title" className="mt-1 text-2xl font-semibold text-slate-950">Related courses</h2>
              <p className="mt-1 text-sm text-slate-500">More learning paths based on this course’s topic.</p>
            </div>
            <Link to={routes.explore()} className="text-sm font-semibold text-violet-700 hover:underline">Browse all courses</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {relatedCourses.map((item) => (
              <Link key={item.id} to={routes.course(item.id)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
                <div className="aspect-video overflow-hidden bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-950">
                  {item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />}
                </div>
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">{item.level}</span>
                    <span>{item.category}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 font-semibold text-slate-950">{item.title}</h3>
                  {item.description && !/^(an ai-assembled|ai-selected|ai-generated|this course covers the following|a comprehensive curriculum designed)/i.test(item.description.trim()) && <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{item.description}</p>}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-950">{item.pricing?.mode === 'paid' ? formatCoursePrice(Number(item.pricing.saleEnabled && item.pricing.salePrice != null ? item.pricing.salePrice : item.pricing.price), item.pricing.currency || 'INR') : 'Free'}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700">View course <ChevronRight className="h-4 w-4" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="course-preview-title" className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0"><h2 id="course-preview-title" className="truncate font-semibold text-slate-950">Course preview</h2><p className="truncate text-xs text-slate-500">{course.title}</p></div>
              <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </div>
            {previewVideoId ? (
              <div className="aspect-video bg-black">
                <iframe title={'Preview: ' + course.title} src={'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(previewVideoId) + '?autoplay=1&rel=0&playsinline=1'} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                {course.thumbnail && <img src={course.thumbnail} alt="" className="max-h-56 rounded-xl object-cover" />}
                <p className="font-semibold text-slate-900">A video preview is not available for this course yet.</p>
                <p className="text-sm text-slate-500">The course information and curriculum remain available below.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
