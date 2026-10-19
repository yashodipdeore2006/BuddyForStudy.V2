import { Link } from 'react-router-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';

export default function Footer() {
  return <footer className="border-t border-slate-200 bg-white text-slate-900">
    <div className="bfs-shell bfs-footer-shell py-10 sm:py-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_.7fr_.7fr]">
        <div>
          <Link to="/" className="inline-flex items-center gap-3" aria-label="BuddyForStudy home">
            <span className="bfs-brand-mark h-11 w-11 overflow-hidden"><img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" className="h-10 w-10 object-contain" /></span>
            <span className="bfs-brand-wordmark text-lg">Buddy<span className="brand-accent">For</span>Study</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">Your AI-powered learning companion. Turn ambitious goals into structured paths, practical projects and visible progress.</p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700"><Sparkles className="h-3.5 w-3.5" /> Learn · Plan · Grow</span>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-900">Explore</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <Link className="block transition-colors hover:text-violet-700" to="/courses">Courses</Link>
            <Link className="block transition-colors hover:text-violet-700" to="/pricing">Pricing</Link>
            <Link className="block transition-colors hover:text-violet-700" to="/register">Get started</Link>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-900">Your space</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <Link className="block transition-colors hover:text-violet-700" to="/login">Sign in</Link>
            <Link className="block transition-colors hover:text-violet-700" to="/dashboard">Dashboard</Link>
            <Link className="block transition-colors hover:text-violet-700" to="/my-courses">My learning</Link>
          </div>
        </div>
      </div>
      <div className="mt-10 flex flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row"><span>© 2026 BuddyForStudy. All rights reserved.</span><span className="inline-flex items-center gap-1">Built for focused learners <ArrowUpRight className="h-3 w-3" /></span></div>
    </div>
  </footer>;
}
