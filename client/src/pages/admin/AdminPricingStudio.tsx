import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp, BookOpen, CheckCircle2, Clock3,
  Pencil, RefreshCw, ShieldCheck, Sparkles, Tags, Trash2
} from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminAlert, AdminButton, AdminCard, AdminPagination, AdminTabs } from "@/components/admin/AdminUI";

type Workspace = "overview" | "catalogue" | "bulk" | "rules" | "history";
type CourseRow = {
  _id: string; title: string; category: string; level: "Beginner" | "Intermediate" | "Advanced";
  status?: string; isPublished?: boolean;
  pricing?: { mode?: "free" | "paid"; price?: number; compareAtPrice?: number; currency?: string; saleEnabled?: boolean; salePrice?: number };
  updatedAt?: string;
};
type Pricing = { mode: string; price: number; compareAtPrice: number; currency: string; saleEnabled: boolean; salePrice: number };
type PreviewItem = { courseId: string; title: string; updatedAt: string; before: Pricing; after: Pricing | null; status: string; note?: string };
type PricingPreview = { previewId: string; kind: string; matchedCount: number; eligibleCount: number; skippedCount: number; expiresAt: string; items: PreviewItem[] };
type Rule = {
  _id: string; name: string; enabled: boolean; autoApply: boolean; priority: number;
  filters: { category?: string; level?: string; mode?: string; minPrice?: number; maxPrice?: number };
  operation: { type: string; amount?: number; saleHandling?: string };
  createdAt?: string;
};
type PricingBatchHistory = {
  _id: string; status: string; reason?: string; operation?: { type?: string };
  appliedCount?: number; skippedCount?: number; matchedCount?: number; createdAt: string;
  appliedAt?: string; rolledBackAt?: string; actor?: { name?: string; email?: string };
};
type BatchDetail = PricingBatchHistory & { items: PreviewItem[]; filters?: Record<string, unknown> };
type Band = { min: number; max: number };
type FilterState = { q: string; category: string; level: string; mode: string; status: string; minPrice: string; maxPrice: string };
type RuleForm = {
  name: string; category: string; level: string; mode: string; minPrice: string; maxPrice: string;
  priority: string; type: string; amount: string; autoApply: boolean;
};
const defaultBands: Record<string, Band> = {
  Beginner: { min: 199, max: 499 }, Intermediate: { min: 499, max: 999 }, Advanced: { min: 999, max: 1999 }
};
const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
const money = (amount?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
const operationLabels: Record<string, string> = {
  fixed: "Set fixed price", percent_increase: "Increase by percentage", percent_decrease: "Decrease by percentage",
  amount_increase: "Increase by amount", amount_decrease: "Decrease by amount", set_free: "Set free",
  set_paid: "Set paid", set_compare_at: "Set comparison price", recommend: "Smart recommendations",
  enabled_auto_rules: "Automatic rules"
};
const emptyFilters: FilterState = { q: "", category: "", level: "", mode: "", status: "all", minPrice: "", maxPrice: "" };
const emptyRule: RuleForm = {
  name: "", category: "", level: "", mode: "", minPrice: "", maxPrice: "",
  priority: "100", type: "fixed", amount: "499", autoApply: false
};
const emptyPolicy = {
  enabled: true, mode: "level_bands", fixedPrice: 39, currency: "INR",
  levelBands: { Beginner: { min: 20, max: 39 }, Intermediate: { min: 30, max: 49 }, Advanced: { min: 40, max: 59 } },
  applyTo: ["discovery"] as string[]
};
const cleanFilters = (filters: FilterState) => Object.fromEntries(
  Object.entries(filters).filter(([key, value]) => value !== "" && !(key === "status" && value === "all"))
);

export default function AdminPricingStudio() {
  const [workspace, setWorkspace] = useState<Workspace>("overview");
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, free: 0 });
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [cataloguePage, setCataloguePage] = useState(1);
  const [catalogueLimit, setCatalogueLimit] = useState(25);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(1);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [selectionMode, setSelectionMode] = useState<"selected" | "all_matching">("selected");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [operationType, setOperationType] = useState("fixed");
  const [amount, setAmount] = useState("499");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [saleHandling, setSaleHandling] = useState("preserve");
  const [bands, setBands] = useState<Record<string, Band>>({ ...defaultBands });
  const [depthAdjustmentPerModule, setDepthAdjustmentPerModule] = useState("2");
  const [projectAdjustment, setProjectAdjustment] = useState("5");
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [reason, setReason] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [history, setHistory] = useState<PricingBatchHistory[]>([]);
  const [historyDetail, setHistoryDetail] = useState<BatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedPolicy, setGeneratedPolicy] = useState(emptyPolicy);
  const [policyReason, setPolicyReason] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== "") params.set(key, value); });
    params.set("page", String(cataloguePage));
    params.set("limit", String(catalogueLimit));
    return params.toString();
  }, [filters, cataloguePage, catalogueLimit]);
  const historyQuery = useMemo(() => new URLSearchParams({
    page: String(historyPage), limit: String(historyLimit)
  }).toString(), [historyPage, historyLimit]);
  const selectedCount = selectionMode === "all_matching" ? matchedTotal : selectedCourseIds.length;
  const selectedWithinLimit = selectedCount > 0 && selectedCount <= 500;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogue, ruleData, historyData, policyData] = await Promise.all([
        adminFetch("/api/admin/pricing/courses?" + query),
        adminFetch("/api/admin/pricing/rules"),
        adminFetch("/api/admin/pricing/history?" + historyQuery),
        adminFetch("/api/admin/pricing/generated-policy")
      ]);
      setCourses(catalogue.courses || []);
      setMatchedTotal(Number(catalogue.total || 0));
      setCategories(catalogue.categories || []);
      setSummary(catalogue.summary || { total: 0, paid: 0, free: 0 });
      setRules(ruleData.rules || []);
      setHistory(historyData.batches || []);
      setHistoryTotal(Number(historyData.total || 0));
      setHistoryPages(Math.max(1, Number(historyData.pages || 1)));
      if (policyData?.policy) setGeneratedPolicy((current) => ({
        ...current, ...policyData.policy,
        levelBands: { ...current.levelBands, ...(policyData.policy.levelBands || {}) },
        applyTo: policyData.policy.applyTo || []
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load pricing workspaces.");
    } finally { setLoading(false); }
  }, [query, historyQuery]);

  useEffect(() => { void load(); }, [load]);

  const updateFilters = (patch: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setCataloguePage(1);
    setSelectedCourseIds([]);
    setSelectionMode("selected");
    setPreview(null);
  };
  const toggleCourse = (id: string) => setSelectedCourseIds((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : current.length < 500 ? [...current, id] : current
  );
  const toggleVisibleCourses = (checked: boolean) => setSelectedCourseIds((current) => {
    const visibleIds = courses.map((course) => course._id);
    if (checked) return [...new Set([...current, ...visibleIds])].slice(0, 500);
    return current.filter((id) => !visibleIds.includes(id));
  });
  const selectAllMatching = () => {
    setSelectionMode("all_matching");
    setSelectedCourseIds([]);
    setPreview(null);
  };
  const selectIndividualCourses = () => {
    setSelectionMode("selected");
    setSelectedCourseIds([]);
    setPreview(null);
  };

  const saveGeneratedPolicy = async () => {
    if (policyReason.trim().length < 10) { setError("Enter a reason of at least 10 characters."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/pricing/generated-policy", {
        method: "PUT", body: JSON.stringify({ policy: generatedPolicy, reason: policyReason.trim() })
      });
      setGeneratedPolicy((current) => ({ ...current, ...data.policy }));
      setPolicyReason("");
      setNotice("New-course pricing policy saved. Existing courses were not repriced.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save new-course pricing policy."); }
    finally { setBusy(false); }
  };

  const makePreview = async (kind: "bulk" | "recommend") => {
    if (!selectedWithinLimit) {
      setError(selectedCount > 500 ? "A pricing batch is limited to 500 courses. Narrow the filters or select fewer courses." : "Select at least one course or choose all matching courses.");
      return;
    }
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    try {
      const selection = selectionMode === "all_matching"
        ? { mode: "all_matching" }
        : { mode: "selected", courseIds: selectedCourseIds };
      const body = kind === "bulk"
        ? {
            kind, filters: cleanFilters(filters), selection,
            operation: {
              type: operationType, amount: Number(amount || 0),
              ...(operationType !== "set_compare_at" && minPrice !== "" ? { minPrice: Number(minPrice) } : {}),
              ...(operationType !== "set_compare_at" && maxPrice !== "" ? { maxPrice: Number(maxPrice) } : {}),
              saleHandling
            }
          }
        : {
            kind, filters: cleanFilters(filters), selection,
            profile: {
              ...(filters.category ? { categories: [{ category: filters.category, levels: bands }] } : { levels: bands }),
              depthAdjustmentPerModule: Number(depthAdjustmentPerModule), projectAdjustment: Number(projectAdjustment)
            }
          };
      const data = await adminFetch("/api/admin/pricing/preview", { method: "POST", body: JSON.stringify(body) });
      setPreview(data);
      setNotice("Preview generated. No course prices have changed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate pricing preview."); }
    finally { setBusy(false); }
  };

  const applyPreview = async () => {
    if (!preview) return;
    if (reason.trim().length < 10) { setError("Enter a reason of at least 10 characters before applying."); return; }
    if (!window.confirm("Apply only the course prices shown in this preview? Stale courses will be skipped.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/pricing/apply", {
        method: "POST", body: JSON.stringify({ previewId: preview.previewId, reason: reason.trim() })
      });
      setNotice("Batch complete: " + data.appliedCount + " updated, " + data.skippedCount + " skipped.");
      setPreview(null); setReason(""); setSelectedCourseIds([]); setSelectionMode("selected");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply pricing preview."); }
    finally { setBusy(false); }
  };

  const buildRulePayload = () => ({
    name: ruleForm.name.trim(), enabled: true, autoApply: ruleForm.autoApply,
    priority: Number(ruleForm.priority),
    filters: {
      ...(ruleForm.category ? { category: ruleForm.category } : {}),
      ...(ruleForm.level ? { level: ruleForm.level } : {}),
      ...(ruleForm.mode ? { mode: ruleForm.mode } : {}),
      ...(ruleForm.minPrice !== "" ? { minPrice: Number(ruleForm.minPrice) } : {}),
      ...(ruleForm.maxPrice !== "" ? { maxPrice: Number(ruleForm.maxPrice) } : {})
    },
    operation: { type: ruleForm.type, amount: Number(ruleForm.amount), saleHandling: "preserve" }
  });
  const saveRule = async () => {
    if (ruleForm.name.trim().length < 3) { setError("Give the rule a name with at least 3 characters."); return; }
    if (ruleForm.autoApply && !window.confirm("Opt this rule into the manual, administrator-triggered automatic-rule runner? It will not run in the background.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminFetch(editingRuleId ? "/api/admin/pricing/rules/" + editingRuleId : "/api/admin/pricing/rules", {
        method: editingRuleId ? "PUT" : "POST", body: JSON.stringify(buildRulePayload())
      });
      setRuleForm(emptyRule); setEditingRuleId(null);
      setNotice(editingRuleId ? "Pricing rule updated." : "Pricing rule created.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save pricing rule."); }
    finally { setBusy(false); }
  };
  const editRule = (rule: Rule) => {
    setEditingRuleId(rule._id);
    setRuleForm({
      name: rule.name, category: rule.filters?.category || "", level: rule.filters?.level || "",
      mode: rule.filters?.mode || "", minPrice: rule.filters?.minPrice === undefined ? "" : String(rule.filters.minPrice),
      maxPrice: rule.filters?.maxPrice === undefined ? "" : String(rule.filters.maxPrice),
      priority: String(rule.priority || 100), type: rule.operation?.type || "fixed",
      amount: String(rule.operation?.amount ?? 499), autoApply: Boolean(rule.autoApply)
    });
    setWorkspace("rules");
  };
  const toggleRule = async (rule: Rule) => {
    setBusy(true); setError(""); setNotice("");
    const nextEnabled = !rule.enabled;
    try {
      await adminFetch("/api/admin/pricing/rules/" + rule._id, {
        method: "PUT",
        body: JSON.stringify({
          name: rule.name, enabled: nextEnabled, autoApply: nextEnabled && Boolean(rule.autoApply),
          priority: rule.priority, filters: rule.filters, operation: rule.operation
        })
      });
      setNotice(rule.enabled ? "Rule disabled. Its auto-apply opt-in was cleared." : "Rule enabled.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change rule status."); }
    finally { setBusy(false); }
  };
  const deleteRule = async (rule: Rule) => {
    if (!window.confirm("Delete the pricing rule \"" + rule.name + "\"? This does not change course prices.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/pricing/rules/" + rule._id, { method: "DELETE" });
      if (editingRuleId === rule._id) { setEditingRuleId(null); setRuleForm(emptyRule); }
      setNotice("Pricing rule deleted."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete pricing rule."); }
    finally { setBusy(false); }
  };
  const runRules = async () => {
    if (reason.trim().length < 10) { setError("Enter a reason of at least 10 characters to execute enabled automatic rules."); return; }
    if (!window.confirm("Execute enabled automatic rules by priority now? This changes prices for matching courses and records an audit event.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/pricing/rules/run", {
        method: "POST", body: JSON.stringify({ reason: reason.trim() })
      });
      setNotice("Automatic rules completed: " + data.appliedCount + " updated, " + data.skippedCount + " skipped.");
      setReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not execute automatic rules."); }
    finally { setBusy(false); }
  };
  const openHistoryDetail = async (batchId: string) => {
    setLoadingDetail(true); setHistoryDetail(null); setError("");
    try {
      const data = await adminFetch("/api/admin/pricing/history/" + batchId);
      setHistoryDetail(data.batch || null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load batch details."); }
    finally { setLoadingDetail(false); }
  };
  const rollback = async (batchId: string) => {
    const rollbackReason = window.prompt("Why are you rolling back this pricing batch? (minimum 10 characters)");
    if (!rollbackReason || rollbackReason.trim().length < 10) return;
    if (!window.confirm("Rollback only courses whose prices still match this batch? Newer changes will be preserved.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/pricing/history/" + batchId + "/rollback", {
        method: "POST", body: JSON.stringify({ reason: rollbackReason.trim() })
      });
      setNotice("Rollback complete: " + data.rolledBackCount + " restored, " + data.skippedCount + " skipped.");
      setHistoryDetail(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Rollback failed."); }
    finally { setBusy(false); }
  };
  const activeAutoRules = rules.filter((rule) => rule.enabled && rule.autoApply).length;
  const latestBatch = history[0];
  const selectionDescription = selectionMode === "all_matching"
    ? "All " + matchedTotal.toLocaleString("en-IN") + " courses matching the current filters"
    : selectedCourseIds.length + " individually selected course(s)";

  const workspaceItems = [
    { value: "overview" as const, label: "Overview" },
    { value: "catalogue" as const, label: "Course catalogue" },
    { value: "bulk" as const, label: "Bulk pricing" },
    { value: "rules" as const, label: "Rules & policy" },
    { value: "history" as const, label: "History" }
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Finance & governance</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Course Pricing Studio</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Manage course prices, new-course defaults, pricing rules and audited changes from one workspace.
            Every bulk change starts with a preview; existing subscriptions and enrolments are not rewritten.
          </p>
        </div>
        <AdminButton onClick={() => void load()} disabled={loading || busy} loading={loading} icon={<RefreshCw size={16} />}>Refresh data</AdminButton>
      </header>

      {error && <AdminAlert tone="danger" title="Pricing Studio could not complete that action">{error}</AdminAlert>}
      {notice && <AdminAlert tone="success">{notice}</AdminAlert>}

      <AdminTabs items={workspaceItems} value={workspace} onChange={setWorkspace} ariaLabel="Course pricing workspaces" />

      {workspace === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Courses in catalogue", value: summary.total, hint: "All non-deleted courses", icon: <BookOpen size={19} /> },
              { label: "Paid courses", value: summary.paid, hint: "Configured with a base price", icon: <Tags size={19} /> },
              { label: "Free courses", value: summary.free, hint: "Available without course payment", icon: <CheckCircle2 size={19} /> },
              { label: "Enabled auto rules", value: activeAutoRules, hint: "Only run after an admin action", icon: <ShieldCheck size={19} /> }
            ].map((item) => (
              <AdminCard key={item.label} className="min-w-0">
                <div className="flex items-center justify-between text-slate-500"><span className="text-sm font-medium">{item.label}</span>{item.icon}</div>
                <p className="mt-3 text-3xl font-bold tabular-nums text-slate-950">{Number(item.value).toLocaleString("en-IN")}</p>
                <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
              </AdminCard>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminCard>
              <h2 className="text-lg font-bold text-slate-950">Pricing operations</h2>
              <p className="mt-1 text-sm text-slate-600">Choose the workspace that matches the change you need to make.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <AdminButton variant="secondary" icon={<BookOpen size={16} />} onClick={() => setWorkspace("catalogue")}>Browse catalogue</AdminButton>
                <AdminButton variant="secondary" icon={<ArrowDownUp size={16} />} onClick={() => setWorkspace("bulk")}>Prepare bulk change</AdminButton>
                <AdminButton variant="secondary" icon={<Tags size={16} />} onClick={() => setWorkspace("rules")}>Manage rules & policy</AdminButton>
                <AdminButton variant="secondary" icon={<Clock3 size={16} />} onClick={() => setWorkspace("history")}>Review history</AdminButton>
              </div>
            </AdminCard>
            <AdminCard>
              <h2 className="text-lg font-bold text-slate-950">Latest pricing activity</h2>
              {latestBatch ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{operationLabels[latestBatch.operation?.type || ""] || "Pricing batch"}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{latestBatch.status}</span>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(latestBatch.createdAt).toLocaleString()} · {latestBatch.appliedCount || 0} updated · {latestBatch.skippedCount || 0} skipped</p>
                  <p className="text-sm text-slate-600">{latestBatch.reason || "No reason supplied."}</p>
                  <button type="button" className="text-sm font-semibold text-violet-700" onClick={() => { setWorkspace("history"); void openHistoryDetail(latestBatch._id); }}>Inspect batch details</button>
                </div>
              ) : <p className="mt-3 text-sm text-slate-500">No pricing batches have been applied yet.</p>}
            </AdminCard>
          </div>
          <AdminAlert tone="info" title="Pricing safety model">
            Bulk edits are previewed and capped at 500 courses. Preview records expire after 30 minutes and can be used once by the administrator who created them.
            Rollback restores only courses whose current price still matches the batch snapshot.
          </AdminAlert>
        </div>
      )}

      {workspace === "catalogue" && (
        <div className="space-y-4">
          <AdminCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-950">Course catalogue</h2><p className="mt-1 text-sm text-slate-600">Filter the catalogue, inspect current pricing and build a precise selection.</p></div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{matchedTotal.toLocaleString("en-IN")} matches</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">Search title or category<input className={inputClass} value={filters.q} onChange={(e) => updateFilters({ q: e.target.value })} placeholder="Search courses" /></label>
              <label className="text-xs font-semibold text-slate-600">Category<select className={inputClass} value={filters.category} onChange={(e) => updateFilters({ category: e.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Level<select className={inputClass} value={filters.level} onChange={(e) => updateFilters({ level: e.target.value })}><option value="">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Pricing mode<select className={inputClass} value={filters.mode} onChange={(e) => updateFilters({ mode: e.target.value })}><option value="">Free and paid</option><option value="free">Free</option><option value="paid">Paid</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Publication status<select className={inputClass} value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Minimum base price (₹)<input className={inputClass} type="number" min="0" value={filters.minPrice} onChange={(e) => updateFilters({ minPrice: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-600">Maximum base price (₹)<input className={inputClass} type="number" min="0" value={filters.maxPrice} onChange={(e) => updateFilters({ maxPrice: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Selection scope</p>
                <p className="mt-1 text-xs text-slate-600">{selectionDescription}. Maximum 500 courses per pricing batch.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminButton size="sm" variant={selectionMode === "selected" ? "primary" : "secondary"} onClick={selectIndividualCourses}>Selected courses</AdminButton>
                <AdminButton size="sm" variant={selectionMode === "all_matching" ? "primary" : "secondary"} onClick={selectAllMatching}>All matching courses</AdminButton>
                <AdminButton size="sm" variant="secondary" onClick={() => { setSelectedCourseIds([]); setSelectionMode("selected"); setPreview(null); }}>Clear selection</AdminButton>
              </div>
            </div>
            {selectionMode === "all_matching" && matchedTotal > 500 && <AdminAlert tone="warning" className="mt-3">This filter matches more than 500 courses. Narrow the filters before generating a batch preview.</AdminAlert>}
            {selectedCourseIds.length >= 500 && <p className="mt-2 text-xs text-amber-700" role="status">The 500-course selection limit has been reached.</p>}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input type="checkbox" aria-label="Select all visible courses" checked={selectionMode === "selected" && courses.length > 0 && courses.every((course) => selectedCourseIds.includes(course._id))} disabled={selectionMode !== "selected" || loading} onChange={(e) => toggleVisibleCourses(e.target.checked)} />
                    </th>
                    <th className="px-4 py-3">Course</th><th className="px-4 py-3">Category / level</th>
                    <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Base price</th><th className="px-4 py-3 text-right">Sale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading catalogue…</td></tr> :
                    courses.length ? courses.map((course) => (
                      <tr key={course._id}>
                        <td className="px-4 py-3"><input type="checkbox" aria-label={"Select " + course.title} checked={selectionMode === "all_matching" || selectedCourseIds.includes(course._id)} disabled={selectionMode === "all_matching"} onChange={() => toggleCourse(course._id)} /></td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{course.title}</td>
                        <td className="px-4 py-3 text-slate-600">{course.category} · {course.level}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{course.status || (course.isPublished ? "published" : "draft")}</span></td>
                        <td className="px-4 py-3 text-right font-semibold">{money(course.pricing?.price, course.pricing?.currency)}</td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">{course.pricing?.saleEnabled ? money(course.pricing.salePrice, course.pricing.currency) : "—"}</td>
                      </tr>
                    )) : <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No courses match the current filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <AdminPagination page={cataloguePage} pages={Math.max(1, Math.ceil(matchedTotal / catalogueLimit))} total={matchedTotal} from={matchedTotal ? (cataloguePage - 1) * catalogueLimit + 1 : 0} to={Math.min(cataloguePage * catalogueLimit, matchedTotal)} limit={catalogueLimit} loading={loading} onPageChange={setCataloguePage} onLimitChange={(limit) => { setCatalogueLimit(limit); setCataloguePage(1); }} />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Selected scope: <strong>{selectedCount.toLocaleString("en-IN")}</strong> courses</p>
              <AdminButton onClick={() => setWorkspace("bulk")} disabled={!selectedWithinLimit}>Continue to bulk pricing</AdminButton>
            </div>
          </AdminCard>
        </div>
      )}

      {workspace === "bulk" && (
        <div className="space-y-5">
          <AdminAlert tone="info" title="Review before applying">
            Only the courses represented by the generated preview can be changed. The preview expires after 30 minutes, is single-use, and stale course records are skipped.
          </AdminAlert>
          <AdminCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-950">Target courses</h2><p className="mt-1 text-sm text-slate-600">{selectionDescription}</p></div>
              <AdminButton variant="secondary" onClick={() => setWorkspace("catalogue")}>Change selection</AdminButton>
            </div>
            {selectedCount > 500 && <p className="mt-3 text-sm text-amber-700">Narrow the catalogue filters to 500 matches or fewer before previewing.</p>}
            {!selectedCount && <p className="mt-3 text-sm text-amber-700">No courses selected. Choose courses in the catalogue first.</p>}
          </AdminCard>
          <div className="grid gap-5 lg:grid-cols-2">
            <AdminCard>
              <div className="flex items-center gap-2"><ArrowDownUp size={19} className="text-violet-700" /><h2 className="text-lg font-bold text-slate-950">Bulk price editor</h2></div>
              <p className="mt-2 text-sm text-slate-600">Set, increase, decrease or clear pricing with optional floor and ceiling constraints.</p>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-600">Operation<select className={inputClass} value={operationType} onChange={(e) => setOperationType(e.target.value)}>{[
                  ["fixed", "Set fixed base price"], ["percent_increase", "Increase by percentage"], ["percent_decrease", "Decrease by percentage"],
                  ["amount_increase", "Increase by amount"], ["amount_decrease", "Decrease by amount"], ["set_free", "Set as free"],
                  ["set_paid", "Set as paid"], ["set_compare_at", "Set comparison-at price (0 clears)"]
                ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {operationType !== "set_free" && <label className="block text-xs font-semibold text-slate-600">Amount / percentage<input className={inputClass} type="number" min="0" max={operationType.startsWith("percent") ? 100 : 1000000} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-600">Price floor (optional)<input className={inputClass} type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} /></label>
                  <label className="text-xs font-semibold text-slate-600">Price ceiling (optional)<input className={inputClass} type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></label>
                </div>
                <label className="block text-xs font-semibold text-slate-600">Active sale handling<select className={inputClass} value={saleHandling} onChange={(e) => setSaleHandling(e.target.value)}><option value="preserve">Preserve (skip invalid sale states)</option><option value="clear">Clear active sale pricing</option><option value="adjust">Adjust sale price below the new base price</option></select></label>
                <AdminButton className="w-full" onClick={() => void makePreview("bulk")} disabled={busy || !selectedWithinLimit} loading={busy} icon={<ArrowDownUp size={16} />}>Generate bulk preview</AdminButton>
              </div>
            </AdminCard>
            <AdminCard>
              <div className="flex items-center gap-2"><Sparkles size={19} className="text-violet-700" /><h2 className="text-lg font-bold text-slate-950">Smart price recommendations</h2></div>
              <p className="mt-2 text-sm text-slate-600">Category bands override level bands. Module depth and project count adjust the baseline, while the final recommendation stays inside the configured band.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(["Beginner", "Intermediate", "Advanced"] as const).map((level) => (
                  <div key={level} className="rounded-xl border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-bold">{level}</p>
                    <label className="text-xs text-slate-500">Minimum ₹<input className={inputClass} type="number" min="0" value={bands[level].min} onChange={(e) => setBands((current) => ({ ...current, [level]: { ...current[level], min: Number(e.target.value) } }))} /></label>
                    <label className="mt-2 block text-xs text-slate-500">Maximum ₹<input className={inputClass} type="number" min="0" value={bands[level].max} onChange={(e) => setBands((current) => ({ ...current, [level]: { ...current[level], max: Number(e.target.value) } }))} /></label>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600">Adjustment per module (%)<input className={inputClass} type="number" min="0" max="25" value={depthAdjustmentPerModule} onChange={(e) => setDepthAdjustmentPerModule(e.target.value)} /></label>
                <label className="text-xs font-semibold text-slate-600">Adjustment per project (%)<input className={inputClass} type="number" min="0" max="50" value={projectAdjustment} onChange={(e) => setProjectAdjustment(e.target.value)} /></label>
              </div>
              {filters.category && <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">Recommendation bands will target category “{filters.category}”.</p>}
              <AdminButton className="w-full mt-4" variant="secondary" onClick={() => void makePreview("recommend")} disabled={busy || !selectedWithinLimit} loading={busy} icon={<Sparkles size={16} />}>Generate recommendation preview</AdminButton>
            </AdminCard>
          </div>
          <AdminCard>
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">Preview and approval</h2>{preview && <span className="text-xs text-slate-500">Expires {new Date(preview.expiresAt).toLocaleString()}</span>}</div>
            {!preview ? <p className="mt-3 text-sm text-slate-500">Generate a preview to inspect every before-and-after value. No price is changed by preview generation.</p> : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Matched</p><p className="text-2xl font-bold">{preview.matchedCount}</p></div>
                  <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Eligible</p><p className="text-2xl font-bold text-emerald-800">{preview.eligibleCount}</p></div>
                  <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Skipped</p><p className="text-2xl font-bold text-amber-800">{preview.skippedCount}</p></div>
                </div>
                <div className="mt-4 max-h-[440px] overflow-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Course</th><th className="px-3 py-3 text-right">Current</th><th className="px-3 py-3 text-right">Proposed</th><th className="px-3 py-3">Validation / explanation</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{preview.items.map((item) => <tr key={item.courseId}>
                      <td className="px-3 py-3 font-medium">{item.title}</td><td className="px-3 py-3 text-right">{money(item.before.price, item.before.currency)}</td>
                      <td className="px-3 py-3 text-right font-bold">{item.after ? money(item.after.price, item.after.currency) : "—"}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{item.note || (item.after ? "Ready to apply" : "Skipped")}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <label className="mt-4 block text-xs font-semibold text-slate-600">Reason for pricing change (required, 10–500 characters)<textarea className={inputClass + " min-h-20"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Explain why this pricing batch is necessary." /></label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <AdminButton onClick={() => void applyPreview()} disabled={busy || reason.trim().length < 10} loading={busy} icon={<CheckCircle2 size={16} />}>Confirm and apply preview</AdminButton>
                  <AdminButton variant="secondary" disabled={busy} onClick={() => { setPreview(null); setReason(""); }}>Discard preview</AdminButton>
                </div>
              </>
            )}
          </AdminCard>
        </div>
      )}

      {workspace === "rules" && (
        <div className="space-y-5">
          <AdminCard>
            <h2 className="text-lg font-bold text-slate-950">Pricing rules</h2>
            <p className="mt-1 text-sm text-slate-600">Rules are configuration only. Auto-apply is an opt-in flag, and execution remains an explicit administrator action; there is no background repricing worker.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-semibold text-slate-600">Rule name<input className={inputClass} value={ruleForm.name} onChange={(e) => setRuleForm((v) => ({ ...v, name: e.target.value }))} placeholder="e.g. Beginner Python pricing" /></label>
              <label className="text-xs font-semibold text-slate-600">Category<select className={inputClass} value={ruleForm.category} onChange={(e) => setRuleForm((v) => ({ ...v, category: e.target.value }))}><option value="">Any category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Level<select className={inputClass} value={ruleForm.level} onChange={(e) => setRuleForm((v) => ({ ...v, level: e.target.value }))}><option value="">Any level</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Current pricing mode<select className={inputClass} value={ruleForm.mode} onChange={(e) => setRuleForm((v) => ({ ...v, mode: e.target.value }))}><option value="">Any mode</option><option value="free">Free</option><option value="paid">Paid</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Current price minimum<input className={inputClass} type="number" min="0" value={ruleForm.minPrice} onChange={(e) => setRuleForm((v) => ({ ...v, minPrice: e.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-600">Current price maximum<input className={inputClass} type="number" min="0" value={ruleForm.maxPrice} onChange={(e) => setRuleForm((v) => ({ ...v, maxPrice: e.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-600">Priority (lower runs first)<input className={inputClass} type="number" min="1" max="10000" value={ruleForm.priority} onChange={(e) => setRuleForm((v) => ({ ...v, priority: e.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-600">Action<select className={inputClass} value={ruleForm.type} onChange={(e) => setRuleForm((v) => ({ ...v, type: e.target.value }))}>{[
                ["fixed", "Set fixed price"], ["percent_increase", "Increase percentage"], ["percent_decrease", "Decrease percentage"],
                ["amount_increase", "Increase amount"], ["amount_decrease", "Decrease amount"], ["set_free", "Set free"], ["set_paid", "Set paid"]
              ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {!["set_free"].includes(ruleForm.type) && <label className="text-xs font-semibold text-slate-600">Amount / percentage<input className={inputClass} type="number" min="0" max={ruleForm.type.startsWith("percent") ? 100 : 1000000} value={ruleForm.amount} onChange={(e) => setRuleForm((v) => ({ ...v, amount: e.target.value }))} /></label>}
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={ruleForm.autoApply} onChange={(e) => setRuleForm((v) => ({ ...v, autoApply: e.target.checked }))} /><span><strong>Opt in to automatic rule execution</strong><span className="block text-xs text-slate-500">The rule runs only when an administrator explicitly executes enabled automatic rules.</span></span></label>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminButton onClick={() => void saveRule()} disabled={busy || ruleForm.name.trim().length < 3} loading={busy}>{editingRuleId ? "Save rule changes" : "Create pricing rule"}</AdminButton>
              {editingRuleId && <AdminButton variant="secondary" onClick={() => { setEditingRuleId(null); setRuleForm(emptyRule); }}>Cancel editing</AdminButton>}
            </div>
          </AdminCard>
          <AdminCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-950">Configured rules</h2><p className="mt-1 text-sm text-slate-600">{rules.length} rules · {activeAutoRules} enabled for manual execution</p></div>
              <AdminButton variant="secondary" disabled={busy || activeAutoRules === 0} onClick={() => void runRules()}>Execute enabled automatic rules</AdminButton>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-600">Reason for automatic rule execution (required, 10–500 characters)
              <textarea className={inputClass + " min-h-20"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Explain why these automatic pricing rules are being executed." />
            </label>
            <div className="mt-4 space-y-2">
              {rules.length ? rules.map((rule) => <div key={rule._id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{rule.name}</p><span className={"rounded-full px-2 py-1 text-xs font-semibold " + (rule.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600")}>{rule.enabled ? "Enabled" : "Disabled"}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{rule.autoApply ? "Auto opt-in" : "Manual only"}</span></div>
                  <p className="mt-1 text-xs text-slate-500">Priority {rule.priority} · {operationLabels[rule.operation?.type || ""] || rule.operation?.type} · {rule.filters?.category || "All categories"} · {rule.filters?.level || "All levels"}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <AdminButton size="sm" variant="secondary" onClick={() => editRule(rule)} icon={<Pencil size={14} />}>Edit</AdminButton>
                  <AdminButton size="sm" variant="secondary" onClick={() => void toggleRule(rule)} disabled={busy}>{rule.enabled ? "Disable" : "Enable"}</AdminButton>
                  <AdminButton size="sm" variant="danger-ghost" onClick={() => void deleteRule(rule)} disabled={busy} icon={<Trash2 size={14} />}>Delete</AdminButton>
                </div>
              </div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No pricing rules have been configured.</p>}
            </div>
          </AdminCard>
          <AdminCard>
            <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-violet-700" /><h2 className="text-lg font-bold text-slate-950">New-course pricing policy</h2></div>
            <p className="mt-2 text-sm text-slate-600">Controls the default pricing decision for newly generated Build With AI and YouTube-derived courses. It does not reprice existing courses or publish them.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Policy status<select className={inputClass} value={generatedPolicy.enabled ? "enabled" : "disabled"} onChange={(e) => setGeneratedPolicy((v) => ({ ...v, enabled: e.target.value === "enabled" }))}><option value="enabled">Enabled</option><option value="disabled">Disabled — keep generated-course pricing unchanged</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Pricing strategy<select className={inputClass} value={generatedPolicy.mode} onChange={(e) => setGeneratedPolicy((v) => ({ ...v, mode: e.target.value }))}><option value="free">Free for every new course</option><option value="fixed">Fixed price</option><option value="level_bands">Price by course level</option><option value="rule_based">Use enabled admin pricing rules</option></select></label>
            </div>
            {generatedPolicy.mode === "fixed" && <label className="mt-3 block text-xs font-semibold text-slate-600">Fixed price (INR)<input className={inputClass} type="number" min="0" max="1000000" value={generatedPolicy.fixedPrice} onChange={(e) => setGeneratedPolicy((v) => ({ ...v, fixedPrice: Number(e.target.value) }))} /></label>}
            {generatedPolicy.mode === "level_bands" && <div className="mt-3 grid gap-3 sm:grid-cols-3">{(["Beginner", "Intermediate", "Advanced"] as const).map((level) => <div key={level} className="rounded-xl border border-slate-200 p-3"><p className="mb-2 text-sm font-bold">{level}</p><div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-500">Minimum<input className={inputClass} type="number" min="0" value={generatedPolicy.levelBands[level].min} onChange={(e) => setGeneratedPolicy((v) => ({ ...v, levelBands: { ...v.levelBands, [level]: { ...v.levelBands[level], min: Number(e.target.value) } } }))} /></label><label className="text-xs text-slate-500">Maximum<input className={inputClass} type="number" min="0" value={generatedPolicy.levelBands[level].max} onChange={(e) => setGeneratedPolicy((v) => ({ ...v, levelBands: { ...v.levelBands, [level]: { ...v.levelBands[level], max: Number(e.target.value) } } }))} /></label></div></div>)}</div>}
            <div className="mt-4"><p className="text-xs font-semibold text-slate-600">Apply to generated course types</p><div className="mt-2 flex flex-wrap gap-4">{[
              { id: "ai", label: "Build With AI" }, { id: "discovery", label: "YouTube discovery" }, { id: "module", label: "Extracted modules" }, { id: "normal", label: "Other generated courses" }
            ].map((item) => <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={generatedPolicy.applyTo.includes(item.id)} onChange={(e) => setGeneratedPolicy((v) => ({ ...v, applyTo: e.target.checked ? [...v.applyTo, item.id] : v.applyTo.filter((x) => x !== item.id) }))} />{item.label}</label>)}</div></div>
            <label className="mt-4 block text-xs font-semibold text-slate-600">Reason for policy change (10–500 characters)<textarea className={inputClass + " min-h-20"} maxLength={500} value={policyReason} onChange={(e) => setPolicyReason(e.target.value)} placeholder="Explain why the generated-course pricing policy is changing." /></label>
            <AdminButton className="mt-3" onClick={() => void saveGeneratedPolicy()} disabled={busy || policyReason.trim().length < 10} loading={busy}>Save new-course pricing policy</AdminButton>
            <p className="mt-3 text-xs leading-5 text-slate-500">YouTube discovery price bands are validated by the server (₹20–₹59). Existing course prices are not changed by this policy.</p>
          </AdminCard>
        </div>
      )}

      {workspace === "history" && (
        <div className="space-y-4">
          <AdminCard>
            <h2 className="text-lg font-bold text-slate-950">Pricing batch history</h2>
            <p className="mt-1 text-sm text-slate-600">A paginated audit ledger of applied pricing changes, with administrator, reason, counts and per-course snapshots.</p>
            <div className="mt-4 space-y-2">
              {history.length ? history.map((batch) => <div key={batch._id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{operationLabels[batch.operation?.type || ""] || "Pricing batch"}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{batch.status}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(batch.createdAt).toLocaleString()} · {batch.appliedCount || 0} applied · {batch.skippedCount || 0} skipped · {batch.actor?.name || batch.actor?.email || "Administrator"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{batch.reason || "No reason supplied."}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <AdminButton size="sm" variant="secondary" onClick={() => void openHistoryDetail(batch._id)}>View details</AdminButton>
                  {["applied", "partially_applied"].includes(batch.status) && <AdminButton size="sm" variant="danger-ghost" disabled={busy} onClick={() => void rollback(batch._id)}>Guarded rollback</AdminButton>}
                </div>
              </div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{loading ? "Loading pricing history…" : "No pricing batches have been applied yet."}</p>}
            </div>
            <AdminPagination page={historyPage} pages={historyPages} total={historyTotal} from={historyTotal ? (historyPage - 1) * historyLimit + 1 : 0} to={Math.min(historyPage * historyLimit, historyTotal)} limit={historyLimit} loading={loading} onPageChange={setHistoryPage} onLimitChange={(limit) => { setHistoryLimit(limit); setHistoryPage(1); }} />
          </AdminCard>
          {loadingDetail && <AdminCard><p className="text-sm text-slate-500">Loading batch details…</p></AdminCard>}
          {historyDetail && (
            <AdminCard>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Batch details</h2><p className="mt-1 text-sm text-slate-500">{historyDetail._id} · {historyDetail.actor?.name || historyDetail.actor?.email || "Administrator"}</p></div><AdminButton size="sm" variant="secondary" onClick={() => setHistoryDetail(null)}>Close details</AdminButton></div>
              <p className="mt-2 text-sm text-slate-700">{historyDetail.reason || "No reason supplied."}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Matched</p><p className="text-xl font-bold">{historyDetail.matchedCount || historyDetail.items?.length || 0}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Applied</p><p className="text-xl font-bold text-emerald-800">{historyDetail.appliedCount || 0}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Skipped</p><p className="text-xl font-bold text-amber-800">{historyDetail.skippedCount || 0}</p></div></div>
              <div className="mt-4 max-h-[460px] overflow-auto rounded-xl border border-slate-100"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Course</th><th className="px-3 py-3">Result</th><th className="px-3 py-3 text-right">Before</th><th className="px-3 py-3 text-right">After</th><th className="px-3 py-3">Skipped reason</th></tr></thead><tbody className="divide-y divide-slate-100">{(historyDetail.items || []).map((item, index) => <tr key={item.courseId || index}><td className="px-3 py-3 font-medium">{item.title || "Course removed"}</td><td className="px-3 py-3">{item.status}</td><td className="px-3 py-3 text-right">{money(item.before?.price, item.before?.currency)}</td><td className="px-3 py-3 text-right">{item.after ? money(item.after.price, item.after.currency) : "—"}</td><td className="px-3 py-3 text-xs text-slate-600">{item.note || "—"}</td></tr>)}</tbody></table></div>
            </AdminCard>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Checkout prices remain server-verified. Pricing changes affect future purchases; existing payments, enrollments and plan entitlements are not rewritten. All applied changes create course revisions and audit events.</p>
    </div>
  );
}
