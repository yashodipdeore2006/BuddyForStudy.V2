import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  CreditCard,
  GraduationCap,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { routes } from "@/lib/routes";

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  featured?: boolean;
  displayOrder?: number;
};
type Category = { value: string; label: string };
type FaqResponse = { faqs?: Faq[]; categories?: Category[]; usingStarterContent?: boolean };

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const BUILT_IN_FAQS: Faq[] = [
  { id: "courses", question: "Where can I find courses?", answer: "Open Explore to browse the courses currently available on BuddyForStudy. Course details show the information available for each course.", category: "courses-learning", displayOrder: 10 },
  { id: "plans", question: "How do I find plans and prices?", answer: "Visit the Pricing page to see subscription plans currently returned by the platform. Availability and prices may change as plans are updated.", category: "plans-payments", displayOrder: 20 },
  { id: "free-learning", question: "Can I learn without a paid subscription?", answer: "Course access depends on the course's displayed price and the access rules shown by the platform. Check the course details before enrolling.", category: "plans-payments", displayOrder: 30 },
  { id: "my-learning", question: "How do I return to a course I started?", answer: "Sign in and open My Learning to find your enrolled learning. The available course actions depend on your current enrollment.", category: "accounts", displayOrder: 40 },
  { id: "policies", question: "Where can I read the platform policies?", answer: "The Legal and Policies section links to the published policy documents. If a document is unavailable, check the policy index for current publications.", category: "privacy-safety", displayOrder: 50 },
];

const DEFAULT_CATEGORIES: Category[] = [
  { value: "getting-started", label: "Getting started" },
  { value: "accounts", label: "Accounts" },
  { value: "courses-learning", label: "Courses & learning" },
  { value: "plans-payments", label: "Plans & payments" },
  { value: "technical-support", label: "Technical support" },
  { value: "privacy-safety", label: "Privacy & safety" },
  { value: "other", label: "Other" },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "getting-started": GraduationCap,
  accounts: UserRound,
  "courses-learning": BookOpen,
  "plans-payments": CreditCard,
  "technical-support": Wrench,
  "privacy-safety": ShieldCheck,
  other: CircleHelp,
};

const QUICK_LINKS = [
  { title: "Discover courses", description: "Browse the learning content currently available.", href: routes.explore(), icon: BookOpen },
  { title: "My learning", description: "Return to courses and learning you have enrolled in.", href: routes.myLearning(), icon: GraduationCap },
  { title: "Plans and pricing", description: "Review the subscription plans published by the platform.", href: routes.pricing(), icon: CreditCard },
  { title: "Policies and privacy", description: "Read the platform's published legal and privacy documents.", href: "/legal", icon: ShieldCheck },
];

export default function FAQ() {
  const [faqs, setFaqs] = useState<Faq[]>(BUILT_IN_FAQS);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(API_URL + "/api/public/faqs", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("FAQ request failed.");
        return response.json();
      })
      .then((data: FaqResponse) => {
        if (Array.isArray(data.faqs)) setFaqs(data.faqs);
        if (Array.isArray(data.categories) && data.categories.length) setCategories(data.categories);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setServiceUnavailable(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const faq of faqs) counts.set(faq.category, (counts.get(faq.category) || 0) + 1);
    return counts;
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return faqs
      .filter((faq) => activeCategory === "all" || faq.category === activeCategory)
      .filter((faq) => !query || faq.question.toLowerCase().includes(query) || faq.answer.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [faqs, search, activeCategory]);

  const featuredFaqs = useMemo(() => filteredFaqs.filter((faq) => faq.featured).slice(0, 3), [filteredFaqs]);

  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero bfs-public-hero--compact" aria-labelledby="help-centre-title">
        <span className="bfs-public-eyebrow"><CircleHelp size={15} aria-hidden="true" /> Help centre</span>
        <h1 id="help-centre-title">Frequently asked questions</h1>
        <p>
          Find clear answers and useful links for discovering courses, managing
          your learning, understanding plans, and using BuddyForStudy.
        </p>
        <div className="bfs-public-hero__actions">
          <a className="bfs-public-button" href="#help-answers">
            Browse help answers <ArrowRight size={17} aria-hidden="true" />
          </a>
          <Link className="bfs-public-button bfs-public-button--secondary" to={routes.contact()}>
            Contact support <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="help-quick-links-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Quick links</span>
          <h2 id="help-quick-links-title">What would you like to do?</h2>
          <p>Go directly to the part of BuddyForStudy that can help with your task.</p>
        </div>
        <div className="bfs-public-pillar-grid">
          {QUICK_LINKS.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={title}
              to={href}
              className="bfs-public-pillar bfs-interactive-card block no-underline"
            >
              <span className="bfs-public-pillar__icon"><Icon size={21} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                Open page <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="help-topics-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Browse by topic</span>
          <h2 id="help-topics-title">Choose a help topic</h2>
          <p>Filter the published answers by the subject you need help with.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            aria-pressed={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
            className={"flex min-h-20 items-center gap-3 rounded-2xl border bg-white p-4 text-left " + (activeCategory === "all" ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200 hover:border-violet-300")}
          >
            <span className="bfs-public-pillar__icon"><CircleHelp size={20} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">All topics</span><span className="text-xs text-slate-500">{faqs.length} published {faqs.length === 1 ? "answer" : "answers"}</span></span>
            <ArrowRight size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
          </button>
          {categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.value] || CircleHelp;
            const count = categoryCounts.get(category.value) || 0;
            return (
              <button
                type="button"
                key={category.value}
                aria-pressed={activeCategory === category.value}
                onClick={() => setActiveCategory(category.value)}
                className={"flex min-h-20 items-center gap-3 rounded-2xl border bg-white p-4 text-left " + (activeCategory === category.value ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200 hover:border-violet-300")}
              >
                <span className="bfs-public-pillar__icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{category.label}</span><span className="text-xs text-slate-500">{count} {count === 1 ? "answer" : "answers"}</span></span>
                <ArrowRight size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <section id="help-answers" className="mt-10 scroll-mt-24" aria-labelledby="help-answers-title">
        <div className="bfs-public-section-heading">
          <span className="bfs-public-eyebrow">Help answers</span>
          <h2 id="help-answers-title">Find an answer</h2>
          <p>Search by keyword or open a question to read its answer.</p>
        </div>
        <div className="mx-auto w-full max-w-4xl pb-5">
          <label htmlFor="public-faq-search" className="sr-only">Search frequently asked questions</label>
          <div className="relative">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="public-faq-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions or answers…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">
            <span>{loading ? "Loading help answers…" : filteredFaqs.length + (filteredFaqs.length === 1 ? " answer" : " answers")}</span>
            {serviceUnavailable && <span role="status">The FAQ service is unavailable. Showing the built-in answers.</span>}
            {(search || activeCategory !== "all") && (
              <button type="button" className="font-semibold text-violet-700 underline underline-offset-4" onClick={() => { setSearch(""); setActiveCategory("all"); }}>
                Clear search and topic
              </button>
            )}
          </div>
        </div>

        {featuredFaqs.length > 0 && !search.trim() && activeCategory === "all" && (
          <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
            <h3 className="text-base font-bold text-slate-900">Popular answers</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {featuredFaqs.map((faq) => (
                <a key={faq.id} href={"#faq-" + faq.id} className="rounded-full border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-violet-400">
                  {faq.question}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="bfs-faq-list" aria-label="Frequently asked questions">
          {filteredFaqs.length ? filteredFaqs.map((faq) => (
            <details className="bfs-faq-item" id={"faq-" + faq.id} key={faq.id || faq.question}>
              <summary>
                <span>{faq.question}</span>
                {faq.featured && <span className="ml-3 shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">Popular</span>}
              </summary>
              <p className="whitespace-pre-line">{faq.answer}</p>
            </details>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <CircleHelp size={26} className="mx-auto text-slate-400" aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold text-slate-900">No matching answers</h3>
              <p className="mt-1 text-sm text-slate-600">Try a different search phrase or choose another topic.</p>
              <button type="button" className="mt-4 text-sm font-semibold text-violet-700 underline underline-offset-4" onClick={() => { setSearch(""); setActiveCategory("all"); }}>Clear filters</button>
            </div>
          )}
        </div>
      </section>

      <section className="bfs-public-cta mt-10">
        <div>
          <h2>Still need help?</h2>
          <p>Visit the contact page to see the official support options currently configured by BuddyForStudy.</p>
        </div>
        <Link className="bfs-public-button" to={routes.contact()}>
          Contact us <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
