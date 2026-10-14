import { Link } from 'react-router-dom';
import { GraduationCap, ArrowUpRight } from 'lucide-react';

export default function Footer() {
  return <footer className="border-t border-slate-200 bg-white text-slate-900">
    <div className="bfs-shell py-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_.7fr_.7fr]">
        <div><div className="flex items-center gap-2.5"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-black"><GraduationCap className="h-5 w-5"/></div><span className="text-lg font-extrabold">BuddyForStudy</span></div><p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">An AI-powered learning companion that turns ambitious goals into structured paths, practical projects and visible progress.</p></div>
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-900">Product</p><div className="mt-4 space-y-3 text-sm text-slate-600"><Link className="block hover:text-slate-950" to="/courses">Courses</Link><Link className="block hover:text-white" to="/pricing">Pricing</Link><Link className="block hover:text-white" to="/register">Get started</Link></div></div>
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-900">Account</p><div className="mt-4 space-y-3 text-sm text-slate-300"><Link className="block hover:text-white" to="/login">Sign in</Link><Link className="block hover:text-white" to="/dashboard">Dashboard</Link><Link className="block hover:text-white" to="/my-courses">My learning</Link></div></div>
      </div>
      <div className="mt-10 flex flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row"><span>© 2026 BuddyForStudy. All rights reserved.</span><span className="inline-flex items-center gap-1">Built for focused learners <ArrowUpRight className="h-3 w-3"/></span></div>
    </div>
  </footer>;
}