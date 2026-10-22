import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Sparkles, Tags } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type CourseRow = {
  _id: string;
  title: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  status?: string;
  isPublished?: boolean;
  pricing?: { mode?: "free" | "paid"; price?: number; compareAtPrice?: number; currency?: string; saleEnabled?: boolean; salePrice?: number };
  updatedAt?: string;
};
type Pricing = { mode: string; price: number; compareAtPrice: number; currency: string; saleEnabled: boolean; salePrice: number };
type PreviewItem = { courseId: string; title: string; updatedAt: string; before: Pricing; after: Pricing | null; status: string; note?: string };
type Rule = { _id: string; name: string; enabled: boolean; autoApply: boolean; priority: number; filters: Record<string, unknown>; operation: Record<string, unknown>; createdAt?: string };
type PricingBatchHistory = { _id: string; status: string; reason?: string; operation?: { type?: string }; appliedCount?: number; skippedCount?: number; createdAt: string };
type Band = { min: number; max: number };
const defaultBands = { Beginner: { min: 199, max: 499 }, Intermediate: { min: 499, max: 999 }, Advanced: { min: 999, max: 1999 } };
const money = (amount?: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export default function AdminPricingStudio() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, free: 0 });
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [filters, setFilters] = useState({ q: "", category: "", level: "", mode: "", status: "all", minPrice: "", maxPrice: "" });
  const [operationType, setOperationType] = useState("fixed");
  const [amount, setAmount] = useState("499");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [saleHandling, setSaleHandling] = useState("preserve");
  const [bands, setBands] = useState<Record<string, Band>>({ ...defaultBands });
  const [depthAdjustmentPerModule, setDepthAdjustmentPerModule] = useState("2");
  const [projectAdjustment, setProjectAdjustment] = useState("5");
  const [preview, setPreview] = useState<{ previewId: string; kind: string; matchedCount: number; eligibleCount: number; skippedCount: number; expiresAt: string; items: PreviewItem[] } | null>(null);
  const [reason, setReason] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleName, setRuleName] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [ruleLevel, setRuleLevel] = useState("");
  const [ruleMode, setRuleMode] = useState("");
  const [ruleMinPrice, setRuleMinPrice] = useState("");
  const [ruleMaxPrice, setRuleMaxPrice] = useState("");
  const [rulePriority, setRulePriority] = useState("100");
  const [ruleType, setRuleType] = useState("fixed");
  const [ruleAmount, setRuleAmount] = useState("499");
  const [ruleAutoApply, setRuleAutoApply] = useState(false);
  const [history, setHistory] = useState<PricingBatchHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== "") params.set(key, value); });
    params.set("page", "1"); params.set("limit", "50");
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [catalogue, ruleData, historyData] = await Promise.all([
        adminFetch("/api/admin/pricing/courses?" + query),
        adminFetch("/api/admin/pricing/rules"),
        adminFetch("/api/admin/pricing/history?limit=8")
      ]);
      setCourses(catalogue.courses || []); setMatchedTotal(Number(catalogue.total || 0)); setCategories(catalogue.categories || []);
      setSummary(catalogue.summary || { total: 0, paid: 0, free: 0 });
      setRules(ruleData.rules || []); setHistory(historyData.batches || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load pricing data."); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const makePreview = async (kind: "bulk" | "recommend") => {
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    try {
      const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => value !== "" && key !== "status" || (key === "status" && value !== "all")));
      const body = kind === "bulk"
        ? { kind, filters: cleanFilters, operation: { type: operationType, amount: Number(amount || 0), ...(operationType !== "set_compare_at" && minPrice !== "" ? { minPrice: Number(minPrice) } : {}), ...(operationType !== "set_compare_at" && maxPrice !== "" ? { maxPrice: Number(maxPrice) } : {}), saleHandling } }
        : { kind, filters: cleanFilters, profile: { ...(filters.category ? { categories: [{ category: filters.category, levels: bands }] } : { levels: bands }), depthAdjustmentPerModule: Number(depthAdjustmentPerModule), projectAdjustment: Number(projectAdjustment) } };
      const data = await adminFetch("/api/admin/pricing/preview", { method: "POST", body: JSON.stringify(body) });
      setPreview(data); setNotice("Preview ready. No prices have changed yet.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate preview."); }
    finally { setBusy(false); }
  };

  const applyPreview = async () => {
    if (!preview) return;
    if (reason.trim().length < 10) { setError("Enter a reason of at least 10 characters before applying changes."); return; }
    if (!window.confirm("Apply this pricing batch? Only the prices shown in this preview will be changed.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/pricing/apply", { method: "POST", body: JSON.stringify({ previewId: preview.previewId, reason: reason.trim() }) });
      setNotice(`Batch complete: ${data.appliedCount} updated, ${data.skippedCount} skipped. Stale courses were left unchanged.`);
      setPreview(null); setReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply pricing preview."); }
    finally { setBusy(false); }
  };

  const saveRule = async () => {
    if (ruleName.trim().length < 3) { setError("Give the rule a name with at least 3 characters."); return; }
    if (ruleAutoApply && !window.confirm("This rule is opted into automatic application. It will only run when you explicitly execute enabled automatic rules.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/pricing/rules", { method: "POST", body: JSON.stringify({
        name: ruleName.trim(), enabled: true, autoApply: ruleAutoApply, priority: Number(rulePriority),
        filters: { ...(ruleCategory ? { category: ruleCategory } : {}), ...(ruleLevel ? { level: ruleLevel } : {}), ...(ruleMode ? { mode: ruleMode } : {}), ...(ruleMinPrice !== "" ? { minPrice: Number(ruleMinPrice) } : {}), ...(ruleMaxPrice !== "" ? { maxPrice: Number(ruleMaxPrice) } : {}) },
        operation: { type: ruleType, amount: Number(ruleAmount), saleHandling: "preserve" }
      }) });
      setRuleName(""); setNotice("Pricing rule saved."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save rule."); }
    finally { setBusy(false); }
  };

  const runRules = async () => {
    if (reason.trim().length < 10) { setError("Enter a reason of at least 10 characters to execute enabled automatic rules."); return; }
    if (!window.confirm("Execute all enabled auto-apply rules by priority? This changes matching course prices and creates an audit record.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/pricing/rules/run", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      setNotice(`Automatic rules finished: ${data.appliedCount} updated, ${data.skippedCount} skipped.`);
      setReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not execute automatic rules."); }
    finally { setBusy(false); }
  };

  const rollback = async (batchId: string) => {
    const rollbackReason = window.prompt("Why are you rolling back this pricing batch? (minimum 10 characters)");
    if (!rollbackReason || rollbackReason.trim().length < 10) return;
    if (!window.confirm("Rollback only courses whose prices still match this batch? Newer changes will be preserved.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch(`/api/admin/pricing/history/${batchId}/rollback`, { method: "POST", body: JSON.stringify({ reason: rollbackReason.trim() }) });
      setNotice(`Rollback complete: ${data.rolledBackCount} restored, ${data.skippedCount} skipped.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Rollback failed."); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Finance & governance</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Course Pricing Studio</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Filter the catalogue, preview bulk price changes, and create explainable recommendations. Nothing changes until you apply a preview or explicitly execute an enabled automatic rule.</p></div>
      <button onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[["Catalogue courses", summary.total, "All non-deleted courses"], ["Paid courses", summary.paid, "Currently configured as paid"], ["Free courses", summary.free, "Currently configured as free"]].map(([label, value, caption]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{Number(value).toLocaleString("en-IN")}</p><p className="mt-1 text-xs text-slate-500">{caption}</p></div>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="flex items-center gap-2"><Tags size={19} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-950">1. Filter the catalogue</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Search<input className={inputClass + " mt-1"} placeholder="Course title or category" value={filters.q} onChange={e => setFilters(v => ({ ...v, q: e.target.value }))} /></label>
        <label className="text-xs font-semibold text-slate-600">Category<select className={inputClass + " mt-1"} value={filters.category} onChange={e => setFilters(v => ({ ...v, category: e.target.value }))}><option value="">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Level<select className={inputClass + " mt-1"} value={filters.level} onChange={e => setFilters(v => ({ ...v, level: e.target.value }))}><option value="">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Pricing mode<select className={inputClass + " mt-1"} value={filters.mode} onChange={e => setFilters(v => ({ ...v, mode: e.target.value }))}><option value="">Free and paid</option><option value="free">Free</option><option value="paid">Paid</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Publication status<select className={inputClass + " mt-1"} value={filters.status} onChange={e => setFilters(v => ({ ...v, status: e.target.value }))}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Current price minimum (₹)<input className={inputClass + " mt-1"} type="number" min="0" value={filters.minPrice} onChange={e => setFilters(v => ({ ...v, minPrice: e.target.value }))} /></label>
        <label className="text-xs font-semibold text-slate-600">Current price maximum (₹)<input className={inputClass + " mt-1"} type="number" min="0" value={filters.maxPrice} onChange={e => setFilters(v => ({ ...v, maxPrice: e.target.value }))} /></label>
      </div>
      <p className="mt-3 text-xs text-slate-500">The preview targets every course matching these filters, up to 500 courses per batch.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Course</th><th className="px-4 py-3">Category / level</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Base price</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500"><RefreshCw className="mr-2 inline animate-spin" size={16} />Loading catalogue…</td></tr> : courses.map(course => <tr key={course._id}><td className="px-4 py-3 font-semibold text-slate-900">{course.title}</td><td className="px-4 py-3 text-slate-600">{course.category} · {course.level}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{course.status || (course.isPublished ? "published" : "draft")}</span></td><td className="px-4 py-3 text-right font-semibold">{money(course.pricing?.price, course.pricing?.currency)}</td></tr>)}</tbody></table></div>
      {!loading && <p className="mt-3 text-xs text-slate-500">Showing {courses.length} of {matchedTotal} matching courses in this filter view. The preview targets all matches (maximum 500 per batch).</p>}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex items-center gap-2"><ArrowDownUp size={19} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-950">2. Bulk price change</h2></div>
        <p className="mt-2 text-sm text-slate-600">Set a fixed price, adjust by a percentage or amount, or switch selected matches between free and paid.</p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">Operation<select className={inputClass + " mt-1"} value={operationType} onChange={e => setOperationType(e.target.value)}>{[["fixed","Set fixed base price"],["percent_increase","Increase by percentage"],["percent_decrease","Decrease by percentage"],["amount_increase","Increase by amount"],["amount_decrease","Decrease by amount"],["set_free","Set as free"],["set_paid","Set as paid"],["set_compare_at","Set comparison-at price (0 clears)"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {!["set_free","set_paid"].includes(operationType) && <label className="block text-xs font-semibold text-slate-600">Amount / percentage<input className={inputClass + " mt-1"} type="number" min="0" max={operationType.startsWith("percent") ? 100 : 1000000} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">Floor price (optional)<input className={inputClass + " mt-1"} type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Ceiling price (optional)<input className={inputClass + " mt-1"} type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} /></label></div>
          <label className="block text-xs font-semibold text-slate-600">Active sale handling<select className={inputClass + " mt-1"} value={saleHandling} onChange={e => setSaleHandling(e.target.value)}><option value="preserve">Preserve (skip invalid sale states)</option><option value="clear">Clear active sale pricing</option><option value="adjust">Adjust sale price to remain below base</option></select></label>
          <button disabled={busy || loading} onClick={() => void makePreview("bulk")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-50"><ArrowDownUp size={17} /> Preview bulk change</button>
        </div>
      </div>
      <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 md:p-6">
        <div className="flex items-center gap-2"><Sparkles size={19} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-950">3. Smart recommendations</h2></div>
        <p className="mt-2 text-sm text-slate-600">Category-specific bands override level bands. Course modules and project lessons adjust the baseline, but every recommendation remains within the configured band.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["Beginner","Intermediate","Advanced"] as const).map(level => <div key={level} className="rounded-xl border border-slate-200 bg-white p-3"><p className="mb-2 text-sm font-bold text-slate-800">{level}</p><label className="text-xs text-slate-500">Minimum ₹<input className={inputClass + " mt-1"} type="number" min="0" value={bands[level].min} onChange={e => setBands(v => ({ ...v, [level]: { ...v[level], min: Number(e.target.value) } }))} /></label><label className="mt-2 block text-xs text-slate-500">Maximum ₹<input className={inputClass + " mt-1"} type="number" min="0" value={bands[level].max} onChange={e => setBands(v => ({ ...v, [level]: { ...v[level], max: Number(e.target.value) } }))} /></label></div>)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">Adjustment per module (%)<input className={inputClass + " mt-1"} type="number" min="0" max="25" value={depthAdjustmentPerModule} onChange={e => setDepthAdjustmentPerModule(e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Adjustment per project (%)<input className={inputClass + " mt-1"} type="number" min="0" max="50" value={projectAdjustment} onChange={e => setProjectAdjustment(e.target.value)} /></label></div>
        {filters.category && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-violet-800">These bands will apply specifically to category “{filters.category}”.</p>}
        <button disabled={busy || loading} onClick={() => void makePreview("recommend")} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50"><Sparkles size={17} /> Generate recommendation preview</button>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-950">4. Review and apply</h2></div>
      {!preview ? <p className="mt-3 text-sm text-slate-500">Generate a bulk or recommendation preview to inspect old and proposed prices here before applying.</p> : <>
        <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Matched</p><p className="text-2xl font-bold">{preview.matchedCount}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Eligible</p><p className="text-2xl font-bold text-emerald-800">{preview.eligibleCount}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Skipped</p><p className="text-2xl font-bold text-amber-800">{preview.skippedCount}</p></div></div>
        <p className="mt-3 text-xs text-slate-500">Preview expires {new Date(preview.expiresAt).toLocaleString()}. Applying will reject courses edited after this preview.</p>
        <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-100"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Course</th><th className="px-3 py-3 text-right">Current</th><th className="px-3 py-3 text-right">Proposed</th><th className="px-3 py-3">Explanation / validation</th></tr></thead><tbody className="divide-y divide-slate-100">{preview.items.map(item => <tr key={item.courseId}><td className="px-3 py-3 font-medium">{item.title}</td><td className="px-3 py-3 text-right">{money(item.before.price, item.before.currency)}</td><td className="px-3 py-3 text-right font-bold">{item.after ? money(item.after.price, item.after.currency) : "—"}</td><td className="px-3 py-3 text-xs text-slate-600">{item.note || (item.after ? "Ready to apply" : "Skipped")}</td></tr>)}</tbody></table></div>
        <label className="mt-4 block text-xs font-semibold text-slate-600">Reason for change (required, 10–500 characters)<textarea className={inputClass + " mt-1 min-h-20"} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Standardize beginner course pricing for the new term" maxLength={500} /></label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row"><button disabled={busy || reason.trim().length < 10} onClick={() => void applyPreview()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={17} /> Confirm and apply preview</button><button disabled={busy} onClick={() => setPreview(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Discard preview</button></div>
      </>}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex items-center gap-2"><Tags size={19} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-950">5. Optional automatic rules</h2></div>
        <p className="mt-2 text-sm text-slate-600">Rules are disabled for automatic application by default. Enabled rules run only when you explicitly execute them, in priority order, and every execution is audited.</p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">Rule name<input className={inputClass + " mt-1"} value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. Beginner Python standard price" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">Category<select className={inputClass + " mt-1"} value={ruleCategory} onChange={e => setRuleCategory(e.target.value)}><option value="">Any category</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Level<select className={inputClass + " mt-1"} value={ruleLevel} onChange={e => setRuleLevel(e.target.value)}><option value="">Any level</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">Current mode<select className={inputClass + " mt-1"} value={ruleMode} onChange={e => setRuleMode(e.target.value)}><option value="">Any mode</option><option value="free">Free</option><option value="paid">Paid</option></select></label><label className="text-xs font-semibold text-slate-600">Action<select className={inputClass + " mt-1"} value={ruleType} onChange={e => setRuleType(e.target.value)}><option value="fixed">Set fixed price</option><option value="percent_increase">Increase percentage</option><option value="percent_decrease">Decrease percentage</option></select></label></div>
          <div className="grid grid-cols-3 gap-3"><label className="text-xs font-semibold text-slate-600">Price min ₹<input className={inputClass + " mt-1"} type="number" min="0" value={ruleMinPrice} onChange={e => setRuleMinPrice(e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Price max ₹<input className={inputClass + " mt-1"} type="number" min="0" value={ruleMaxPrice} onChange={e => setRuleMaxPrice(e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Priority<input className={inputClass + " mt-1"} type="number" min="1" max="10000" value={rulePriority} onChange={e => setRulePriority(e.target.value)} /></label></div>
          <label className="block text-xs font-semibold text-slate-600">Price / percentage<input className={inputClass + " mt-1"} type="number" min="0" max={ruleType.includes("percent") ? 100 : 1000000} value={ruleAmount} onChange={e => setRuleAmount(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={ruleAutoApply} onChange={e => setRuleAutoApply(e.target.checked)} className="mt-1" /><span><strong>Opt in to automatic rule execution</strong><span className="block text-xs text-slate-500">When enabled, this rule may change prices when an administrator explicitly runs enabled rules.</span></span></label>
          <button disabled={busy} onClick={() => void saveRule()} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">Save pricing rule</button>
          <button disabled={busy || !rules.some(rule => rule.enabled && rule.autoApply)} onClick={() => void runRules()} className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">Execute enabled automatic rules</button>
        </div>
        <div className="mt-4 space-y-2">{rules.map(rule => <div key={rule._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold">{rule.name}</p><p className="text-xs text-slate-500">Priority {rule.priority} · {rule.enabled ? "Enabled" : "Disabled"} · {rule.autoApply ? "Auto-apply opted in" : "Manual only"}</p></div><button disabled={busy} onClick={async () => { if (!window.confirm("Delete this pricing rule?")) return; try { await adminFetch("/api/admin/pricing/rules/" + rule._id, { method: "DELETE" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete rule."); } }} className="text-xs font-semibold text-rose-700">Delete</button></div>)}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex items-center gap-2"><Clock3 size={19} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-950">6. Recent pricing history</h2></div>
        <p className="mt-2 text-sm text-slate-600">Applied batches retain before/after snapshots and can be rolled back only when the affected course prices have not changed since.</p>
        <div className="mt-4 space-y-3">{history.length ? history.map(batch => <div key={batch._id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-900">{batch.operation?.type === "recommend" ? "Smart recommendations" : batch.operation?.type === "enabled_auto_rules" ? "Automatic rules" : "Bulk pricing batch"}</p><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{batch.status}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(batch.createdAt).toLocaleString()} · {batch.appliedCount || 0} applied · {batch.skippedCount || 0} skipped</p><p className="mt-2 text-sm text-slate-600">{batch.reason || "No reason supplied"}</p>{["applied","partially_applied"].includes(batch.status) && <button disabled={busy} onClick={() => void rollback(batch._id)} className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Guarded rollback</button>}</div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No pricing batches yet.</p>}</div>
      </div>
    </section>
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Checkout amounts remain server-verified. Pricing changes affect future purchases only; existing payments, enrollments, and subscription entitlements are not rewritten. All changes create course revisions and audit events.</p>
  </div>;
}
