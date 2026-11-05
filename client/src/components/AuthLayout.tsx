import { Link } from 'react-router-dom';
import { Sparkles, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { routes } from "@/lib/routes";
import brandLogo from "../../logo_new.png";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-white lg:grid lg:grid-cols-2">
      <section className="group/auth relative hidden overflow-hidden bg-[#171936] text-white lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_16%_18%,rgba(139,92,246,0.24),transparent_38%),radial-gradient(ellipse_at_85%_78%,rgba(59,130,246,0.18),transparent_42%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full border border-white/[0.06] transition-transform duration-700 ease-out group-hover/auth:scale-110 motion-reduce:transition-none" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-[30%] h-48 w-48 rounded-full border border-white/[0.08] transition-transform duration-700 ease-out group-hover/auth:scale-110 motion-reduce:transition-none" />
        <div className="relative z-10 flex w-full flex-col justify-between p-8 xl:p-12 2xl:p-16">
          <div className="flex w-full justify-center lg:justify-start">
            <Link to={routes.landing()} aria-label="BuddyForStudy home" className="group/brand inline-flex items-center justify-center rounded-full outline-none transition-transform duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#171936] motion-reduce:transform-none">
              <img src={brandLogo} alt="BuddyForStudy logo" className="h-24 w-24 rounded-full bg-transparent object-contain drop-shadow-[0_8px_18px_rgba(8,8,35,0.28)] transition-transform duration-300 group-hover/brand:scale-105 xl:h-28 xl:w-28" />
            </Link>
          </div>
          <div className="my-8 max-w-xl 2xl:my-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200/25 bg-violet-300/10 px-3 py-1.5 text-xs font-semibold text-violet-100 shadow-sm shadow-violet-950/20">
              <Sparkles className="h-3.5 w-3.5" /> AI-powered learning
            </span>
            <h2 className="mt-6 text-3xl font-semibold leading-[1.12] tracking-tight !text-white sm:text-4xl xl:mt-7 xl:text-5xl">A clearer path to what you want to become.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 !text-slate-200 sm:text-base sm:leading-7">Discover structured learning, personalized roadmaps and real projects without losing sight of the next step.</p>
            <div className="mt-6 grid gap-2.5 xl:mt-8 xl:gap-3">
              {["Prerequisite-aware learning paths", "Hands-on projects and progress tracking", "One place for your entire learning journey"].map((item) => (
                <div key={item} className="group/feature flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-sm !text-slate-100 transition duration-200 hover:translate-x-1 hover:border-violet-200/25 hover:bg-white/[0.08] hover:shadow-md hover:shadow-black/10 focus-within:ring-2 focus-within:ring-violet-300 motion-reduce:transform-none">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-200/20 bg-violet-300/[0.08] !text-violet-100 transition-colors duration-200 group-hover/feature:border-violet-200/40 group-hover/feature:bg-violet-300/15"><Check className="h-4 w-4" /></span>
                  <span className="leading-5">{item}</span>
                  <span aria-hidden="true" className="ml-auto translate-x-[-4px] text-violet-200 opacity-0 transition duration-200 group-hover/feature:translate-x-0 group-hover/feature:opacity-100">↗</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs !text-slate-400">© 2026 BuddyForStudy</p>
        </div>
      </section>
      <section className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#f1f4f7] px-4 py-4 sm:px-6 sm:py-5 lg:py-3">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-3">
              <span className="bfs-brand-mark h-10 w-10 overflow-hidden"><img src="/buddyforstudy-mascot.webp" alt="" aria-hidden="true" className="h-9 w-9 object-contain" /></span>
              <span className="bfs-brand-wordmark text-lg">Buddy<span className="brand-accent">For</span>Study</span>
            </Link>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6">
            <h1 className="text-2xl font-medium tracking-tight text-slate-950">{title}</h1>
            <p className="mt-1.5 text-sm leading-5 text-slate-600">{subtitle}</p>
            <div className="mt-5">{children}</div>
            <div className="mt-4 border-t border-slate-200 pt-3 text-center text-sm text-slate-600">{footer}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
