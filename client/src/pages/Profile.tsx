import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";
import {
  ArrowUpRight, Award, BookOpen, CheckCircle2, CreditCard, Flame, Loader2,
  Settings2, Target, Trophy
} from "lucide-react";

type LearningStats = {
  currentStreak?: number;
  longestStreak?: number;
  totalLessonsCompleted?: number;
  dailyGoalLessons?: number;
  achievements?: Array<{ key?: string; title?: string; description?: string; unlockedAt?: string }>;
};

type EnrollmentSummary = {
  status?: string;
  course?: { title?: string } | string | null;
};

function Metric({ icon: Icon, label, value, detail }: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />{label}
      </div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default function Profile() {
  const { profile, session } = useAuth();
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/api/achievements/me"),
      apiFetch("/api/enrollments")
    ]).then(([achievementData, enrollmentData]) => {
      if (cancelled) return;
      setStats(achievementData.stats || null);
      setEnrollments(Array.isArray(enrollmentData.enrollments) ? enrollmentData.enrollments : []);
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "Unable to load learning overview.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (!profile) return null;

  const initials = profile.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "B";
  const activeCourses = enrollments.filter((item) => ["active", "completed"].includes(String(item.status || "").toLowerCase())).length;
  const completedCourses = enrollments.filter((item) => String(item.status || "").toLowerCase() === "completed").length;
  const achievements = Array.isArray(stats?.achievements) ? stats.achievements : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Your profile" subtitle="Your learner identity, progress and achievements." />

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-extrabold shadow-lg">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-white">{profile.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />{profile.is_active ? "Account active" : "Account inactive"}
                </span>
              </div>
              <p className="mt-2 break-all text-sm text-slate-300">{session?.user.email || "Email unavailable"}</p>
              <p className="mt-1 text-xs text-slate-300">{profile.role === "admin" ? "Administrator account" : "BuddyForStudy learner"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={routes.settings()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">
                <Settings2 className="h-4 w-4" /> Account settings
              </Link>
              <Link to={routes.billing()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">
                <CreditCard className="h-4 w-4" /> Purchases & payments
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          <Metric icon={BookOpen} label="Courses" value={loading ? "—" : activeCourses} detail="Courses in your learning record" />
          <Metric icon={CheckCircle2} label="Completed courses" value={loading ? "—" : completedCourses} detail="Courses marked as completed" />
          <Metric icon={Flame} label="Current streak" value={loading ? "—" : stats?.currentStreak ?? 0} detail="Consecutive learning days" />
          <Metric icon={Target} label="Lessons completed" value={loading ? "—" : stats?.totalLessonsCompleted ?? 0} detail="Recorded completed lessons" />
        </div>
      </section>

      {loadError && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{loadError}</p>}
      {loading && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your learning activity…</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section id="learning-activity" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Trophy className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold text-slate-950">Learning activity</h2>
              <p className="mt-1 text-sm text-slate-500">A snapshot of your learning consistency and progress.</p>
            </div>
            <Link to={routes.myLearning()} className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800">My learning <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Longest streak</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-950">{stats?.longestStreak ?? 0} days</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Daily lesson goal</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-950">{stats?.dailyGoalLessons ?? 1} lessons</p>
            </div>
          </div>
        </section>

        <section id="achievements" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Award className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-extrabold text-slate-950">Achievements</h2><p className="mt-1 text-sm text-slate-500">Milestones earned through learning.</p></div>
          </div>
          {achievements.length ? (
            <ul className="mt-5 space-y-3">
              {achievements.map((achievement, index) => (
                <li key={achievement.key || index} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div><p className="text-sm font-bold text-slate-900">{achievement.title || "Achievement unlocked"}</p>{achievement.description && <p className="mt-1 text-xs text-slate-500">{achievement.description}</p>}</div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Your achievements will appear here as you reach learning milestones.</p>}
        </section>
      </div>


    </div>
  );
}
