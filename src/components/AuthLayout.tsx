import { Link } from 'react-router-dom';
import { GraduationCap, Sparkles, Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-white lg:grid lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#0a1317] text-white lg:flex">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 18% 22%, rgba(255,255,255,.18), transparent 34%), radial-gradient(circle at 80% 78%, rgba(0,100,224,.28), transparent 38%)' }} />
        <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-950"><GraduationCap className="h-5 w-5" /></span>
            <span className="text-lg font-bold tracking-tight">BuddyForStudy</span>
          </Link>
          <div className="max-w-xl">
            <span className="badge border border-white/20 bg-white/10 text-white"><Sparkles className="h-3.5 w-3.5" /> AI-powered learning</span>
            <h2 className="mt-7 text-4xl font-medium leading-tight tracking-tight xl:text-5xl">A clearer path to what you want to become.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/75">Discover structured learning, personalized roadmaps and real projects without losing sight of the next step.</p>
            <div className="mt-8 space-y-4">
              {['Prerequisite-aware learning paths', 'Hands-on projects and progress tracking', 'One place for your entire learning journey'].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-white/85">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20"><Check className="h-4 w-4" /></span>{item}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/50">© 2026 BuddyForStudy</p>
        </div>
      </section>
      <section className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#f1f4f7] px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"><GraduationCap className="h-5 w-5" /></span>
              <span className="text-lg font-bold text-slate-950">BuddyForStudy</span>
            </Link>
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 sm:p-9">
            <h1 className="text-3xl font-medium tracking-tight text-slate-950">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{subtitle}</p>
            <div className="mt-7">{children}</div>
            <div className="mt-7 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">{footer}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
