import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import type { Course } from '@/types';
import CourseCard from '@/components/CourseCard';
import { GraduationCap, BookOpen, Trophy, ArrowRight, Code2, Database, Layers, Sparkles, BrainCircuit, Target, Rocket } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

function normalizeCourseId(value: any): string {
  const candidate = value?.course ?? value?.courseId ?? value?.course_id ?? value;
  const id = candidate && typeof candidate === 'object'
    ? candidate._id ?? candidate.id ?? candidate.$oid
    : candidate;
  return id == null ? '' : String(id);
}

export default function Home() {
  const [courses,setCourses]=useState<Course[]>([]);
  const [loading,setLoading]=useState(true);
  const [savedCourseIds,setSavedCourseIds]=useState<Set<string>>(new Set());
  const [enrolledCourseIds,setEnrolledCourseIds]=useState<Set<string>>(new Set());
  const { session } = useAuth();

  useEffect(()=>{async function fetchCourses(){try{const data=await apiFetch('/api/courses?limit=6');setCourses((data.courses||[]).map((course:any)=>({...course,id:String(course._id||course.id),learning_outcomes:course.learningOutcomes||course.learning_outcomes||[],is_published:course.isPublished??course.is_published??false,created_at:course.createdAt||course.created_at,updated_at:course.updatedAt||course.updated_at,created_by:course.createdBy||course.created_by||null})) as Course[])}catch{setCourses([])}finally{setLoading(false)}}fetchCourses()},[]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setSavedCourseIds(new Set());
      setEnrolledCourseIds(new Set());
      return;
    }
    // Load saved/enrolled state independently so a failure in one endpoint
    // does not erase the other state or make saved cards look unsaved.
    apiFetch('/api/saved-courses')
      .then((savedData) => {
        if (!active) return;
        setSavedCourseIds(new Set((savedData.savedCourses || [])
          .map((item: any) => normalizeCourseId(item))
          .filter(Boolean)));
      })
      .catch(() => undefined);

    apiFetch('/api/enrollments')
      .then((enrollmentData) => {
        if (!active) return;
        setEnrolledCourseIds(new Set((enrollmentData.enrollments || [])
          .filter((item: any) => ['active', 'completed'].includes(String(item.status || '').toLowerCase()))
          .map((item: any) => normalizeCourseId(item))
          .filter(Boolean)));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [session]);

  return <div className="overflow-hidden">
    <section className="bfs-hero relative text-slate-950">
      <div className="bfs-shell grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-12 lg:py-20">
        <div className="relative z-10">
          <span className="bfs-tag"><Sparkles className="h-3.5 w-3.5" /> AI-powered learning companion</span>
          <h1 className="bfs-display mt-6 max-w-2xl">
            Find your direction.<br />
            <span className="text-violet-600">Build your future.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Turn your career goal into a structured learning path, discover quality resources, build real projects and see your progress in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/courses" className="btn-primary min-h-12 justify-center">
              Explore courses <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/register" className="btn-secondary min-h-12 justify-center">
              <BrainCircuit className="h-4 w-4 text-violet-600" /> Build a path with AI
            </Link>
          </div>
          <Link to="/courses" className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 pl-4 shadow-sm transition hover:border-violet-300 hover:shadow-md" aria-label="Search learning courses">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><BookOpen className="h-4 w-4" /></span>
            <span className="flex-1 text-left text-sm text-slate-500">What do you want to learn?</span>
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">Search <ArrowRight className="h-3.5 w-3.5" /></span>
          </Link>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Goal-based paths</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> AI-assisted discovery</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Visible progress</span>
          </div>
        </div>
        <div className="bfs-hero-art">
          <div className="bfs-float-chip bfs-float-chip--top"><Sparkles className="h-4 w-4" /> AI learning path</div>
          <img src="/buddyforstudy-mascot.svg" alt="BuddyForStudy's friendly dinosaur learning mascot, reading a book" className="bfs-hero-mascot" />
          <div className="bfs-float-chip bfs-float-chip--bottom"><Trophy className="h-4 w-4" /> Every step counts</div>
          <div className="absolute bottom-5 right-5 z-10 hidden items-center gap-2 rounded-xl border border-violet-100 bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Target className="h-4 w-4" /></span>
            Learn with purpose
          </div>
        </div>
      </div>
    </section>

    <section className="border-y border-slate-200 bg-white">
      <div className="bfs-shell grid grid-cols-2 gap-5 py-6 sm:grid-cols-4 sm:py-8">
        {[
          [BrainCircuit, 'Discover', 'Find the next right skill'],
          [Layers, 'Learn', 'Follow a clear sequence'],
          [Code2, 'Build', 'Practice with real projects'],
          [Trophy, 'Grow', 'Track progress over time']
        ].map(([Icon, title, desc]) => {
          const I = Icon as any;
          return <div key={String(title)} className="flex items-start gap-3">
            <span className="bfs-icon-tile h-10 w-10 shrink-0 rounded-xl"><I className="h-5 w-5" /></span>
            <div><p className="text-sm font-bold text-slate-900">{String(title)}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{String(desc)}</p></div>
          </div>;
        })}
      </div>
    </section>

    <section className="bfs-section">
      <div className="bfs-shell">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="bfs-eyebrow">A smarter way to learn</p><h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to move forward.</h2><p className="mt-4 max-w-2xl text-base leading-7 text-slate-500">No more collecting random tutorials. Connect your goals, skills, resources and projects in one focused learning experience.</p></div>
          <Link to="/courses" className="hidden items-center gap-2 text-sm font-bold text-violet-700 sm:inline-flex">Explore the platform <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: BrainCircuit, title: 'AI learning paths', desc: 'Turn a career goal or any topic into an ordered roadmap built around prerequisites and your level.', tone: 'violet' },
            { icon: BookOpen, title: 'Curated courses', desc: 'Explore structured courses and relevant learning resources without losing track of what matters.', tone: 'blue' },
            { icon: Code2, title: 'Practical projects', desc: 'Reinforce concepts through hands-on work and build skills you can demonstrate.', tone: 'green' },
            { icon: Trophy, title: 'Progress that shows', desc: 'Keep lessons, milestones and achievements visible so it is easier to maintain momentum.', tone: 'amber' }
          ].map(({ icon: Icon, title, desc, tone }) => <article key={title} className="bfs-feature-card bfs-interactive-card">
            <div className="bfs-icon-tile"><Icon className="h-6 w-6" /></div>
            <h3 className="mt-5 text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
            <div className="mt-5 flex items-center gap-2 text-xs font-bold text-violet-700">Learn at your pace <ArrowRight className="h-3.5 w-3.5" /></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="pb-14 sm:pb-18">
      <div className="bfs-shell">
        <div className="bfs-ai-panel relative overflow-hidden p-7 sm:p-10 lg:p-12">
          <div className="absolute -right-10 -top-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative grid items-center gap-7 md:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-white/10 px-3 py-1.5 text-xs font-bold text-violet-200"><Sparkles className="h-3.5 w-3.5" /> Your AI study companion</span>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-white sm:text-3xl">From “I want to learn” to “I know what to do next.”</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/85">Get a clearer path, keep your learning organized and build consistent habits around your career goals.</p>
            </div>
            <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-indigo-950 shadow-lg transition hover:bg-violet-50">Start learning free <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>
    </section>

    <section className="bfs-section bg-white">
      <div className="bfs-shell">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="bfs-eyebrow">Featured learning</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Start with a path that matters.</h2><p className="mt-3 text-slate-500">Explore the courses already available on BuddyForStudy.</p></div>
          <Link to="/courses" className="inline-flex items-center gap-2 text-sm font-bold text-violet-700">View all courses <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-9">{loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5"><div className="bfs-skeleton h-36 rounded-xl" /><div className="bfs-skeleton mt-4 h-4 w-2/3 rounded" /><div className="bfs-skeleton mt-3 h-3 w-full rounded" /><div className="bfs-skeleton mt-2 h-3 w-4/5 rounded" /></div>)}</div> : courses.length === 0 ? <EmptyState icon={<BookOpen className="h-8 w-8" />} title="No courses available yet" description="New learning paths are being added regularly." /> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map(course => <CourseCard key={course.id} course={course} showActions initiallySaved={savedCourseIds.has(course.id)} initiallyEnrolled={enrolledCourseIds.has(course.id)} />)}</div>}</div>
      </div>
    </section>

    <section className="bfs-section">
      <div className="bfs-shell">
        <div className="relative overflow-hidden rounded-[28px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-8 sm:p-12 lg:p-14">
          <div className="pointer-events-none absolute -right-8 -top-12 opacity-10"><img src="/buddyforstudy-mascot.svg" alt="" aria-hidden="true" className="h-64 w-64" /></div>
          <div className="relative max-w-3xl">
            <p className="bfs-eyebrow">Your next chapter</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">You don’t need more tutorials.<br />You need a better path.</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">Choose a goal, build your plan and let BuddyForStudy help you focus on the next meaningful step.</p>
            <Link to="/register" className="mt-7 inline-flex items-center gap-2 btn-primary">Start learning free <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>
    </section>
  </div>;
}
