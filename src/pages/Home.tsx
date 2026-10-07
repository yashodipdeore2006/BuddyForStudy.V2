import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Course } from '@/types';
import CourseCard from '@/components/CourseCard';
import { GraduationCap, BookOpen, Trophy, ArrowRight, Code2, Database, Layers, Sparkles, BrainCircuit, Target, Rocket } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

export default function Home() {
  const [courses,setCourses]=useState<Course[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{async function fetchCourses(){try{const data=await apiFetch('/api/courses?limit=6');setCourses((data.courses||[]).map((course:any)=>({...course,id:String(course._id||course.id),learning_outcomes:course.learningOutcomes||course.learning_outcomes||[],is_published:course.isPublished??course.is_published??false,created_at:course.createdAt||course.created_at,updated_at:course.updatedAt||course.updated_at,created_by:course.createdBy||course.created_by||null})) as Course[])}catch{setCourses([])}finally{setLoading(false)}}fetchCourses()},[]);

  return <div className="overflow-hidden">
    <section className="relative bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(47,99,245,.32),transparent_34%),radial-gradient(circle_at_85%_30%,rgba(112,79,242,.28),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(47,99,245,.18),transparent_42%)]"/>
      <div className="relative bfs-shell py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-5xl text-center">
          <div className="badge bg-white/10 text-blue-100 backdrop-blur"><Sparkles className="h-3.5 w-3.5"/> AI-powered learning OS</div>
          <h1 className="mt-7 text-5xl font-extrabold leading-[.98] tracking-[-.04em] sm:text-6xl lg:text-7xl">Learn with direction.<br/><span className="text-blue-300">Build with purpose.</span></h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Turn a career goal into a structured learning path, high-quality resources, real projects and visible progress — all in one place.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/courses" className="btn-primary min-w-44"><BookOpen className="h-4 w-4"/>Explore learning<ArrowRight className="h-4 w-4"/></Link>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/10">Create free account</Link>
          </div>
          <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-white/[.06] p-2 shadow-2xl backdrop-blur-xl">
            <Link to="/courses" className="flex items-center gap-3 rounded-xl bg-white px-4 py-4 text-left text-sm text-slate-400 shadow-sm"><span className="text-xl">⌕</span><span className="flex-1">What do you want to learn?</span><span className="hidden rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white sm:inline">Search</span></Link>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs font-medium text-slate-400"><span>Prerequisite-aware</span><span>•</span><span>Project-focused</span><span>•</span><span>Progress-driven</span></div>
        </div>
      </div>
    </section>

    <section className="border-b border-slate-200 bg-white">
      <div className="bfs-shell grid grid-cols-2 gap-6 py-7 sm:grid-cols-4 sm:py-9">
        {[['01','Discover','the right path'],['02','Learn','in the right order'],['03','Build','real projects'],['04','Grow','with measurable progress']].map(([n,a,b])=><div key={n} className="flex items-start gap-3"><span className="text-xs font-extrabold text-blue-600">{n}</span><div><p className="text-sm font-bold text-slate-900">{a}</p><p className="mt-0.5 text-xs text-slate-500">{b}</p></div></div>)}
      </div>
    </section>

    <section className="bfs-section">
      <div className="bfs-shell">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div><p className="bfs-eyebrow">The learning engine</p><h2 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-[-.03em] sm:text-5xl">A learning experience that adapts to the goal.</h2><p className="mt-4 max-w-2xl text-base leading-7 text-slate-500">Stop collecting random tutorials. BuddyForStudy connects skills, prerequisites, projects and progress into one continuous experience.</p></div>
          <Link to="/courses" className="hidden items-center gap-2 text-sm font-bold text-blue-600 sm:inline-flex">Explore the platform <ArrowRight className="h-4 w-4"/></Link>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[[BrainCircuit,'AI Roadmaps','Tell us what you want to become and get a prerequisite-aware path built around your current level.'],[Target,'Structured Learning','Move through modules and lessons in an intentional order instead of guessing what comes next.'],[Rocket,'Real Projects','Convert knowledge into portfolio-ready work and keep progress visible as you learn.']].map(([Icon,title,desc])=>{const I=Icon as any;return <div key={String(title)} className="group rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_8px_30px_rgba(13,18,32,.04)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(13,18,32,.10)]"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><I className="h-6 w-6"/></div><h3 className="mt-6 text-xl font-extrabold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{String(desc)}</p><div className="mt-6 text-xs font-bold text-blue-600">Learn more →</div></div>})}
        </div>
      </div>
    </section>

    <section className="bfs-section bg-white">
      <div className="bfs-shell">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="bfs-eyebrow">Featured learning</p><h2 className="mt-3 text-4xl font-extrabold tracking-[-.03em]">Start with a path that matters.</h2><p className="mt-3 text-slate-500">Explore the courses already available on BuddyForStudy.</p></div><Link to="/courses" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600">View all courses <ArrowRight className="h-4 w-4"/></Link></div>
        <div className="mt-10">{loading?<div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"/></div>:courses.length===0?<EmptyState icon={<BookOpen className="h-8 w-8"/>} title="No courses available yet" description="New learning paths are being added regularly."/>:<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map(course=><CourseCard key={course.id} course={course}/>)}</div>}</div>
      </div>
    </section>

    <section className="bfs-section bg-slate-950 text-white">
      <div className="bfs-shell"><div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-blue-600/30 via-indigo-600/10 to-transparent p-8 sm:p-12 lg:p-16"><div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"/><div className="relative max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Your next chapter</p><h2 className="mt-4 text-4xl font-extrabold tracking-[-.03em] sm:text-5xl">You don't need more tutorials.<br/>You need a better path.</h2><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Build your account, choose a goal and let BuddyForStudy turn it into the next step you can actually take.</p><Link to="/register" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-blue-50">Start learning free <ArrowRight className="h-4 w-4"/></Link></div></div></div>
    </section>
  </div>;
}
