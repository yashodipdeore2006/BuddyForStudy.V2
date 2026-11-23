import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleHelp, Search } from "lucide-react";
import { Link } from "react-router-dom";

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  featured?: boolean;
  displayOrder?: number;
};

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const BUILT_IN_FAQS: Faq[] = [
  { id: "courses", question: "Where can I find courses?", answer: "Open Explore to browse the courses currently available on BuddyForStudy. Course details show the information available for each course.", category: "courses-learning" },
  { id: "plans", question: "How do I find plans and prices?", answer: "Visit the Pricing page to see subscription plans currently returned by the platform. Availability and prices may change as plans are updated.", category: "plans-payments" },
  { id: "free-learning", question: "Can I learn without a paid subscription?", answer: "Course access depends on the course's displayed price and the access rules shown by the platform. Check the course details before enrolling.", category: "plans-payments" },
  { id: "my-learning", question: "How do I return to a course I started?", answer: "Sign in and open My Learning to find your enrolled learning. The available course actions depend on your current enrollment.", category: "accounts" },
  { id: "policies", question: "Where can I read the platform policies?", answer: "The Legal and Policies section links to the published policy documents. If a document is unavailable, check the policy index for current publications.", category: "privacy-safety" },
];

const CATEGORY_LABELS: Record<string, string> = {
  "getting-started": "Getting started",
  accounts: "Accounts",
  "courses-learning": "Courses & learning",
  "plans-payments": "Plans & payments",
  "technical-support": "Technical support",
  "privacy-safety": "Privacy & safety",
  other: "Other",
};

export default function FAQ() {
  const [faqs, setFaqs] = useState<Faq[]>(BUILT_IN_FAQS);
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
      .then((data: { faqs?: Faq[] }) => {
        if (Array.isArray(data.faqs)) setFaqs(data.faqs);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setServiceUnavailable(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => {
    const values = [...new Set(faqs.map((faq) => faq.category))];
    return values.map((value) => ({ value, label: CATEGORY_LABELS[value] || value }));
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

  return (
    <main className="bfs-public-page">
      <section className="bfs-public-hero bfs-public-hero--compact">
        <span className="bfs-public-eyebrow"><CircleHelp size={15} aria-hidden="true" /> Help centre</span>
        <h1>Frequently asked questions</h1>
        <p>Find practical answers about discovering courses, managing your learning, plans, and platform policies.</p>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-6 sm:px-6" aria-label="Search frequently asked questions">
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
        {categories.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter FAQs by topic">
            <button type="button" onClick={() => setActiveCategory("all")} aria-pressed={activeCategory === "all"} className={"rounded-full border px-3 py-2 text-sm font-semibold transition " + (activeCategory === "all" ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-violet-300")}>All topics</button>
            {categories.map((category) => (
              <button type="button" key={category.value} onClick={() => setActiveCategory(category.value)} aria-pressed={activeCategory === category.value} className={"rounded-full border px-3 py-2 text-sm font-semibold transition " + (activeCategory === category.value ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-violet-300")}>{category.label}</button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">
          <span>{loading ? "Loading help answers…" : filteredFaqs.length + (filteredFaqs.length === 1 ? " answer" : " answers")}</span>
          {serviceUnavailable && <span role="status">The FAQ service is unavailable. Showing the built-in answers.</span>}
        </div>
      </section>

      <section className="bfs-faq-list" aria-label="Frequently asked questions">
        {filteredFaqs.length ? filteredFaqs.map((faq) => (
          <details className="bfs-faq-item" key={faq.id || faq.question}>
            <summary>
              <span>{faq.question}</span>
              {faq.featured && <span className="ml-3 shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">Popular</span>}
            </summary>
            <p className="whitespace-pre-line">{faq.answer}</p>
          </details>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <CircleHelp size={26} className="mx-auto text-slate-400" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-slate-900">No matching answers</h2>
            <p className="mt-1 text-sm text-slate-600">Try a different search phrase or choose another topic.</p>
            <button type="button" className="mt-4 text-sm font-semibold text-violet-700 underline underline-offset-4" onClick={() => { setSearch(""); setActiveCategory("all"); }}>Clear filters</button>
          </div>
        )}
      </section>

      <section className="bfs-public-cta">
        <div><h2>Still need help?</h2><p>Visit the contact page for the support options currently configured by BuddyForStudy.</p></div>
        <Link className="bfs-public-button" to="/contact">Contact us <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </main>
  );
}
