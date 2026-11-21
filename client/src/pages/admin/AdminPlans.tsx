import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Power, Plus, RefreshCcw, Save, Sparkles, Search, CreditCard, CircleDollarSign, Layers3, Pencil, SlidersHorizontal, UsersRound } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { apiFetch } from "@/lib/api";
import { AdminAlert, AdminBadge, AdminCard, AdminEmptyState, AdminPageHeader, AdminTabs } from "@/components/admin/AdminUI";
import { TypedConfirmDialog } from "@/components/admin/TypedConfirmDialog";

type FeatureDefinition = {
  key: string;
  label: string;
};

type Plan = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  billingInterval: string;
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  trialDays?: number;
  sortOrder?: number;
  providerPlanId?: string;
  limits?: Record<string, number>;
  createdAt?: string;
};

type PlanForm = {
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  billingInterval: string;
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  trialDays: number;
  sortOrder: number;
  limits: Record<string, number>;
};

const emptyForm: PlanForm = {
  name: "",
  slug: "",
  description: "",
  price: 0,
  currency: "INR",
  billingInterval: "monthly",
  features: [],
  isActive: true,
  isPopular: false,
  trialDays: 0,
  sortOrder: 0,
  limits: {
    ai_course_builds_per_month: 0,
    advanced_ai_questions_per_month: 0,
    advanced_ai_insights_per_month: 0,
    ai_quiz_generations_per_month: 20,
    youtube_discovery_courses_per_month: 10,
    ai_curated_courses_per_month: 10,
  },
};

const createPlanSteps = [
  { title: "Basics", description: "Name the plan and explain who it is for." },
  { title: "Price & billing", description: "Set the amount, currency, billing interval and catalogue presentation." },
  { title: "Features & limits", description: "Choose the included features and monthly usage limits." },
  { title: "Review", description: "Check what learners will see before creating the plan." }
] as const;

function slugifyPlanName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function formatPlanPrice(price: number, currency: string, interval: string) {
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2
  }).format(Number(price || 0));
  const intervalLabel = interval === "one_time" ? "one time" : interval.replace(/ly$/, "");
  return amount + (interval === "one_time" ? " · one-time" : " / " + intervalLabel);
}

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [availableFeatures, setAvailableFeatures] = useState<FeatureDefinition[]>([]);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<"overview" | "catalogue" | "editor" | "create">("overview");
  const [paymentsEnabled, setPaymentsEnabled] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [planTypeFilter, setPlanTypeFilter] = useState<"all" | "free" | "paid">("all");
  const [intervalFilter, setIntervalFilter] = useState("all");
  const [createStep, setCreateStep] = useState(0);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ kind: "create" | "toggle" | "details" | "limits" | "features"; plan?: Plan } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [data, accessData, publicCatalogue] = await Promise.all([
        adminFetch("/api/admin/plans"),
        adminFetch("/api/admin/access"),
        apiFetch<{ paymentsEnabled?: boolean }>("/api/billing/plans").catch(() => null)
      ]);
      setPermissions(accessData.access?.permissions || []);
      setPlans(data.plans || []);
      setAvailableFeatures(data.availableFeatures || []);
      setPaymentsEnabled(typeof publicCatalogue?.paymentsEnabled === "boolean" ? publicCatalogue.paymentsEnabled : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreatePlan() {
    setError("");
    setActionError("");
    setForm(emptyForm);
    setSlugManuallyEdited(false);
    setCreateStep(0);
    setActiveSection("create");
  }

  function validateCreateStep(step: number) {
    if (step === 0) {
      if (!form.name.trim()) return "Enter a plan name to continue.";
      if (form.name.trim().length > 100) return "Plan name must be 100 characters or fewer.";
      if (!form.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
        return "Enter a valid URL-friendly slug using lowercase letters, numbers and hyphens.";
      }
      if (form.description.trim().length > 500) return "Description must be 500 characters or fewer.";
    }
    if (step === 1) {
      if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) return "Plan price must be zero or greater.";
      if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) return "Currency must be a three-letter code, such as INR.";
      if (!["monthly", "quarterly", "yearly"].includes(form.billingInterval)) return "Subscription plans must use a recurring billing interval.";
      if (!Number.isInteger(Number(form.sortOrder))) return "Display order must be a whole number.";
    }
    if (step === 2) {
      const invalidLimit = Object.entries(form.limits).find(([, value]) => !Number.isInteger(Number(value)) || Number(value) < -1);
      if (invalidLimit) return "Usage limits must be whole numbers. Use 0 to block a feature and -1 for unlimited.";
    }
    return "";
  }

  function continueCreatePlan() {
    const validationMessage = validateCreateStep(createStep);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setError("");
    setCreateStep((step) => Math.min(step + 1, createPlanSteps.length - 1));
  }

  function goBackCreatePlan() {
    setError("");
    setCreateStep((step) => Math.max(step - 1, 0));
  }

  function openConfirmation(action: { kind: "create" | "toggle" | "details" | "limits" | "features"; plan?: Plan }) {
    if (!permissions.includes("plans.manage")) { setError("You do not have permission to manage subscription plans."); return; }
    setError(""); setActionError(""); setConfirmText(""); setActionReason(""); setConfirmAction(action);
  }

  async function create(reason?: string) {
    if (reason === undefined) { openConfirmation({ kind: "create" }); return; }
    const currency = form.currency.trim().toUpperCase();
    if (!form.name.trim() || !form.slug.trim()) {
      setActionError("Plan name and slug are required.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
      setActionError("Use a URL-friendly slug with lowercase letters, numbers and hyphens.");
      return;
    }
    if (!Number.isFinite(form.price) || form.price < 0 || !/^[A-Z]{3}$/.test(currency)) {
      setActionError("Enter a non-negative price and a valid three-letter currency code.");
      return;
    }

    setSavingPlan("creating");
    try {
      setError("");
      await adminFetch("/api/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          currency,
          features: form.features,
          limits: form.limits,
          reason,
        }),
      });
      setForm(emptyForm);
      setSlugManuallyEdited(false);
      setCreateStep(0);
      setActiveSection("catalogue");
      setConfirmAction(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to create plan");
    } finally {
      setSavingPlan(null);
    }
  }

  async function toggle(plan: Plan, reason?: string) {
    if (reason === undefined) { openConfirmation({ kind: "toggle", plan }); return; }
    setSavingPlan(plan._id);
    try {
      setError("");
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !plan.isActive, reason }),
      });
      setConfirmAction(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to update plan");
    } finally {
      setSavingPlan(null);
    }
  }

  function toggleCreateFeature(feature: string) {
    setForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  }

  function togglePlanFeature(planId: string, feature: string) {
    setPlans((current) =>
      current.map((plan) => {
        if (plan._id !== planId) return plan;

        const features = plan.features || [];
        return {
          ...plan,
          features: features.includes(feature)
            ? features.filter((item) => item !== feature)
            : [...features, feature],
        };
      })
    );
  }

  function setAllPlanFeatures(planId: string, enabled: boolean) {
    setPlans((current) =>
      current.map((plan) =>
        plan._id === planId
          ? {
              ...plan,
              features: enabled ? availableFeatures.map((feature) => feature.label) : [],
            }
          : plan
      )
    );
  }

  function updatePlanLimit(planId: string, key: string, value: number) {
    setPlans((current) => current.map((plan) =>
      plan._id === planId
        ? { ...plan, limits: { ...(plan.limits || {}), [key]: value } }
        : plan
    ));
  }

  function planLimit(plan: Plan, key: string, fallback = 0) {
    const value = Number(plan.limits?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  async function savePlanDetails(plan: Plan, reason?: string) {
    if (reason === undefined) { openConfirmation({ kind: "details", plan }); return; }
    setSavingPlan(plan._id);
    setError("");
    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({
          description: plan.description || "",
          price: Math.max(Number(plan.price) || 0, 0),
          currency: String(plan.currency || "INR").trim().toUpperCase(),
          billingInterval: plan.billingInterval,
          trialDays: Math.max(Number(plan.trialDays || 0), 0),
          sortOrder: Number(plan.sortOrder || 0),
          isPopular: Boolean(plan.isPopular),
          reason,
        }),
      });
      setEditingPlan(null);
      setConfirmAction(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to save plan");
    } finally {
      setSavingPlan(null);
    }
  }

  async function savePlanLimits(plan: Plan, reason?: string) {
    if (reason === undefined) { openConfirmation({ kind: "limits", plan }); return; }
    setSavingPlan(plan._id);
    setError("");
    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ limits: plan.limits || {}, reason }),
      });
      setConfirmAction(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to save plan limits");
    } finally {
      setSavingPlan(null);
    }
  }

  async function saveFeatures(plan: Plan, reason?: string) {
    if (reason === undefined) { openConfirmation({ kind: "features", plan }); return; }
    setSavingPlan(plan._id);
    setError("");

    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ features: plan.features || [], reason }),
      });
      setConfirmAction(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to save plan features");
    } finally {
      setSavingPlan(null);
    }
  }



  const canManagePlans = permissions.includes("plans.manage");
  const isFreeCandidate = (plan: Plan) => plan.slug === "free" || Number(plan.price) === 0;
  const freePlanCandidates = plans
    .filter((plan) => plan.isActive && isFreeCandidate(plan))
    .slice()
    .sort((left, right) => {
      const orderDifference = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      if (orderDifference !== 0) return orderDifference;
      const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return leftCreated - rightCreated;
    });
  const defaultFreePlan = freePlanCandidates[0] || null;
  const freePlanCount = plans.filter(isFreeCandidate).length;
  const paidPlanCount = plans.filter((plan) => Number(plan.price) > 0 && plan.slug !== "free").length;
  const activePlanCount = plans.filter((plan) => plan.isActive).length;
  const inactivePlanCount = plans.length - activePlanCount;
  const selectedPlan = plans.find((plan) => plan._id === editingPlan) || null;
  const sortedPlans = plans.slice().sort((left, right) =>
    Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
    new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
  );
  const filteredPlans = sortedPlans.filter((plan) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query || [plan.name, plan.slug, plan.description]
      .some((value) => String(value || "").toLowerCase().includes(query));
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? plan.isActive : !plan.isActive);
    const matchesType = planTypeFilter === "all" ||
      (planTypeFilter === "free" ? isFreeCandidate(plan) : Number(plan.price) > 0 && plan.slug !== "free");
    const matchesInterval = intervalFilter === "all" || plan.billingInterval === intervalFilter;
    return matchesQuery && matchesStatus && matchesType && matchesInterval;
  });
  const openPlanEditor = (plan: Plan) => {
    setEditingPlan(plan._id);
    setActiveSection("editor");
    setError("");
    setActionError("");
  };
  const workspaceItems = [
    { value: "overview" as const, label: "Overview" },
    { value: "catalogue" as const, label: `Catalogue (${plans.length})` },
    { value: "editor" as const, label: "Plan editor", disabled: !selectedPlan },
    ...(canManagePlans ? [{ value: "create" as const, label: "Create plan" }] : [])
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Commercial configuration"
        title="Subscription plans"
        description="Manage the plans learners can compare, the features they unlock and the limits applied to each subscription."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
            </button>
            <button type="button" className="btn-primary" onClick={startCreatePlan} disabled={!canManagePlans}>
              <Plus className="h-4 w-4" /> Create plan
            </button>
          </div>
        }
      />

      {error && <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
      {!canManagePlans && (
        <AdminAlert tone="info" title="View-only access">
          Your administrator role can inspect subscription plans but cannot create, edit or change availability.
        </AdminAlert>
      )}

      {confirmAction && <TypedConfirmDialog
        open
        title={confirmAction.kind === "create" ? "Create subscription plan" : confirmAction.kind === "toggle" ? (confirmAction.plan?.isActive ? "Disable subscription plan" : "Enable subscription plan") : confirmAction.kind === "details" ? "Save plan details" : confirmAction.kind === "limits" ? "Save plan limits" : "Save plan features"}
        description={confirmAction.kind === "create" ? "Create a new subscription offering with the current price, features and limits." : `Confirm changes to ${confirmAction.plan?.name || "this subscription plan"}.`}
        consequence={actionError || (confirmAction.kind === "toggle" ? "Changing plan availability affects whether new learners can select this plan. Existing subscriptions and entitlements are not cancelled by disabling it." : confirmAction.kind === "details" ? "This updates plan pricing and public-facing details. Existing provider billing terms remain protected." : confirmAction.kind === "limits" ? "This changes usage limits for subscribers." : confirmAction.kind === "features" ? "This changes which features subscribers can access." : "The new plan will be created with the values currently entered.")}
        confirmLabel={confirmAction.kind === "create" ? "Create plan" : confirmAction.kind === "toggle" ? "Confirm availability change" : "Save changes"}
        requiredText={confirmAction.kind === "create" ? "CREATE PLAN" : String(confirmAction.plan?.name || "")}
        value={confirmText} onValueChange={setConfirmText}
        reason={actionReason} onReasonChange={setActionReason}
        loading={Boolean(savingPlan)}
        onClose={() => { if (!savingPlan) { setConfirmAction(null); setActionError(""); } }}
        onConfirm={() => {
          const reason = actionReason.trim();
          if (!confirmAction || reason.length < 10 || reason.length > 500) return;
          if (confirmAction.kind === "create") void create(reason);
          else if (confirmAction.plan && confirmAction.kind === "toggle") void toggle(confirmAction.plan, reason);
          else if (confirmAction.plan && confirmAction.kind === "details") void savePlanDetails(confirmAction.plan, reason);
          else if (confirmAction.plan && confirmAction.kind === "limits") void savePlanLimits(confirmAction.plan, reason);
          else if (confirmAction.plan && confirmAction.kind === "features") void saveFeatures(confirmAction.plan, reason);
        }}
      />}

      <AdminTabs
        ariaLabel="Subscription plan work areas"
        value={activeSection}
        onChange={(value) => {
          if (value === "create") startCreatePlan();
          else setActiveSection(value);
        }}
        items={workspaceItems}
      />

      {activeSection === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Total plans", value: plans.length, detail: "All configured offers", icon: <Layers3 size={18} /> },
              { label: "Active plans", value: activePlanCount, detail: "Visible in the public catalogue", icon: <Check size={18} /> },
              { label: "Inactive plans", value: inactivePlanCount, detail: "Hidden from new selection", icon: <Power size={18} /> },
              { label: "Free plans", value: freePlanCount, detail: "Free or designated by slug", icon: <UsersRound size={18} /> },
              { label: "Paid plans", value: paidPlanCount, detail: "Plans with a recurring price", icon: <CircleDollarSign size={18} /> }
            ].map((item) => (
              <AdminCard key={item.label} className="min-w-0">
                <div className="flex items-center justify-between text-slate-500"><span className="text-sm font-medium">{item.label}</span>{item.icon}</div>
                <p className="mt-3 text-3xl font-bold tabular-nums text-slate-950">{item.value.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
              </AdminCard>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AdminCard>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Checkout control</p><h2 className="mt-1 text-lg font-bold text-slate-950">Global payment availability</h2></div>
                <CreditCard className="text-slate-500" size={20} />
              </div>
              {paymentsEnabled === null ? (
                <div className="mt-4"><AdminBadge tone="warning">Status unavailable</AdminBadge><p className="mt-2 text-sm text-slate-600">The public billing status could not be verified. Refresh to check it again.</p></div>
              ) : paymentsEnabled ? (
                <div className="mt-4"><AdminBadge tone="success">Paid checkout enabled</AdminBadge><p className="mt-2 text-sm text-slate-600">Eligible active paid plans can be selected for checkout, subject to server-side payment checks.</p></div>
              ) : (
                <div className="mt-4"><AdminBadge tone="warning">Paid checkout disabled</AdminBadge><p className="mt-2 text-sm text-slate-600">Learners can still compare active plans and their prices. New paid checkout remains unavailable while the global payment switch is off.</p></div>
              )}
              <p className="mt-4 text-xs text-slate-500">This is a status indicator only. Change the global payment switch in Platform Settings; plan visibility and payment availability are separate controls.</p>
            </AdminCard>

            <AdminCard>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Automatic learner assignment</p><h2 className="mt-1 text-lg font-bold text-slate-950">Default free-assignment plan</h2></div>
                <UsersRound className="text-slate-500" size={20} />
              </div>
              {defaultFreePlan ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><h3 className="text-xl font-extrabold text-slate-950">{defaultFreePlan.name}</h3><AdminBadge tone="success">Selected by assignment rule</AdminBadge></div>
                  <p className="mt-1 text-sm text-slate-600">Slug: {defaultFreePlan.slug} · {formatPlanPrice(defaultFreePlan.price, defaultFreePlan.currency || "INR", defaultFreePlan.billingInterval)}</p>
                  <p className="mt-2 text-xs text-slate-500">Sort order {defaultFreePlan.sortOrder ?? 0}. The assignment service selects the first active matching plan by sort order, then creation time.</p>
                  {freePlanCandidates.length > 1 && <AdminAlert tone="warning" className="mt-3">{freePlanCandidates.length} active plans qualify. This plan wins under the current ordering. Review the candidates to avoid an unintended free-plan assignment.</AdminAlert>}
                </>
              ) : (
                <AdminAlert tone="danger" className="mt-3" title="No active default free plan found">
                  New learners may not receive the normal free-plan subscription. Create or activate a plan with slug “free” or a price of zero.
                </AdminAlert>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => setActiveSection("catalogue")}>Review plan catalogue</button>
                {canManagePlans && <button type="button" className="btn-primary" onClick={startCreatePlan}><Plus className="h-4 w-4" /> Create plan</button>}
              </div>
              {freePlanCandidates.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-600">Eligible free-assignment candidates</p>
                  <ol className="mt-2 space-y-1.5">
                    {freePlanCandidates.map((plan, index) => <li key={plan._id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-700">{index + 1}. {plan.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">Order {plan.sortOrder ?? 0}{index === 0 ? " · Selected" : ""}</span>
                    </li>)}
                  </ol>
                </div>
              )}
            </AdminCard>
          </div>

          <AdminCard>
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Plan management shortcuts</h2><p className="mt-1 text-sm text-slate-600">Go directly to the work area for the change you need.</p></div><button type="button" className="text-sm font-semibold text-violet-700" onClick={() => setActiveSection("catalogue")}>Open catalogue →</button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-violet-300" onClick={() => setActiveSection("catalogue")}><Layers3 className="text-violet-700" size={20}/><span className="mt-2 block font-semibold text-slate-900">Browse and filter plans</span><span className="mt-1 block text-xs text-slate-500">Search by name, slug, status, pricing type and billing interval.</span></button>
              <button type="button" className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-violet-300" onClick={startCreatePlan} disabled={!canManagePlans}><Plus className="text-violet-700" size={20}/><span className="mt-2 block font-semibold text-slate-900">Create a subscription plan</span><span className="mt-1 block text-xs text-slate-500">Use the existing guided four-step workflow.</span></button>
            </div>
          </AdminCard>
        </div>
      )}

      {activeSection === "catalogue" && (
        <div className="space-y-4">
          <AdminCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-950">Plan catalogue</h2><p className="mt-1 text-sm text-slate-600">Search and compare the configured plans. Learner visibility follows the active status.</p></div>
              <AdminBadge>{filteredPlans.length} of {plans.length} plans</AdminBadge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">Search plans
                <div className="relative mt-1"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input aria-label="Search plans" className="input-field pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name, slug or description"/></div>
              </label>
              <label className="text-xs font-semibold text-slate-600">Availability
                <select aria-label="Plan availability filter" className="input-field mt-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">All plans</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Pricing type
                <select aria-label="Plan pricing filter" className="input-field mt-1" value={planTypeFilter} onChange={(e) => setPlanTypeFilter(e.target.value as typeof planTypeFilter)}><option value="all">Free and paid</option><option value="free">Free</option><option value="paid">Paid</option></select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Billing interval
                <select aria-label="Plan billing interval filter" className="input-field mt-1" value={intervalFilter} onChange={(e) => setIntervalFilter(e.target.value)}><option value="all">All intervals</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="one_time">Legacy one-time</option></select>
              </label>
            </div>
          </AdminCard>

          {loading ? (
            <AdminCard><div role="status" aria-live="polite" className="py-12 text-center text-sm text-slate-500"><RefreshCcw className="mx-auto mb-3 animate-spin" />Loading plans…</div></AdminCard>
          ) : filteredPlans.length === 0 ? (
            <AdminCard><AdminEmptyState title="No matching plans" description="Change the search or filters to find a subscription plan." icon={<Search size={24}/>} action={<button type="button" className="btn-secondary" onClick={() => {setSearchQuery("");setStatusFilter("all");setPlanTypeFilter("all");setIntervalFilter("all");}}>Clear filters</button>} /></AdminCard>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredPlans.map((plan) => (
                <AdminCard key={plan._id} className="flex min-w-0 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="text-lg font-bold text-slate-950">{plan.name}</h3><p className="mt-1 text-xs text-slate-500">{plan.slug}</p></div>
                    <AdminBadge tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Active" : "Inactive"}</AdminBadge>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-slate-950">{formatPlanPrice(plan.price, plan.currency || "INR", plan.billingInterval)}</p>
                  <p className="mt-1 text-sm text-slate-600">{isFreeCandidate(plan) ? "Free access plan" : "Paid subscription plan"}</p>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-500">{plan.description || "No plan description."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.isPopular && <AdminBadge tone="info">Popular</AdminBadge>}
                    {plan.providerPlanId && <AdminBadge>Provider linked</AdminBadge>}
                    {plan._id === defaultFreePlan?._id && <AdminBadge tone="success">Default free assignment</AdminBadge>}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{plan.features?.length || 0} features</span><span>{plan.trialDays || 0} trial days · Order {plan.sortOrder ?? 0}</span></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary flex-1 justify-center" disabled={!canManagePlans} onClick={() => openPlanEditor(plan)}><Pencil size={15}/> Manage plan</button>
                    {!canManagePlans && <span className="self-center text-xs text-slate-500">View only</span>}
                  </div>
                </AdminCard>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === "editor" && (
        <div className="space-y-4">
          {!selectedPlan ? (
            <AdminCard><AdminEmptyState title="Choose a plan to manage" description="Open the catalogue and select a plan to edit its details, entitlements and usage limits." action={<button type="button" className="btn-primary" onClick={() => setActiveSection("catalogue")}>Open catalogue</button>} /></AdminCard>
          ) : (
            <>
              <AdminCard>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Selected subscription</p><h2 className="mt-1 text-2xl font-extrabold text-slate-950">{selectedPlan.name}</h2><p className="mt-1 text-sm text-slate-500">{selectedPlan.slug} · {formatPlanPrice(selectedPlan.price, selectedPlan.currency || "INR", selectedPlan.billingInterval)}</p></div>
                  <div className="flex flex-wrap gap-2"><AdminBadge tone={selectedPlan.isActive ? "success" : "neutral"}>{selectedPlan.isActive ? "Active · visible" : "Inactive · hidden"}</AdminBadge>{selectedPlan._id === defaultFreePlan?._id && <AdminBadge tone="success">Default free assignment</AdminBadge>}<button type="button" className="btn-secondary" onClick={() => setActiveSection("catalogue")}>Back to catalogue</button></div>
                </div>
              </AdminCard>

              <AdminCard>
                <div className="flex items-center gap-2"><SlidersHorizontal className="text-violet-700" size={19}/><div><h3 className="text-lg font-bold text-slate-950">1. Plan details and billing</h3><p className="text-sm text-slate-500">Public description, price, billing terms and catalogue presentation.</p></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">Learner-facing description<textarea aria-label="Plan description" className="input-field mt-1 min-h-20" value={selectedPlan.description || ""} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item, description:e.target.value} : item))}/></label>
                  <label className="text-xs font-semibold text-slate-600">Price<input aria-label={`Plan price for ${selectedPlan.name}`} className="input-field mt-1" type="number" min="0" step="0.01" value={selectedPlan.price} disabled={Boolean(selectedPlan.providerPlanId)} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item,price:Number(e.target.value)} : item))}/></label>
                  <label className="text-xs font-semibold text-slate-600">Currency<input aria-label={`Plan currency for ${selectedPlan.name}`} className="input-field mt-1 uppercase" maxLength={3} value={selectedPlan.currency || "INR"} disabled={Boolean(selectedPlan.providerPlanId)} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item,currency:e.target.value.toUpperCase()} : item))}/></label>
                  <label className="text-xs font-semibold text-slate-600">Billing interval<select aria-label={`Billing interval for ${selectedPlan.name}`} className="input-field mt-1" value={selectedPlan.billingInterval} disabled={Boolean(selectedPlan.providerPlanId)} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item,billingInterval:e.target.value} : item))}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>{selectedPlan.billingInterval === "one_time" && <option value="one_time" disabled>Legacy one-time (read only)</option>}</select></label>
                  <label className="text-xs font-semibold text-slate-600">Trial days<input className="input-field mt-1" type="number" min="0" max="365" value={selectedPlan.trialDays || 0} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item,trialDays:Number(e.target.value)} : item))}/></label>
                  <label className="text-xs font-semibold text-slate-600">Display order<input className="input-field mt-1" type="number" min="0" step="1" value={selectedPlan.sortOrder || 0} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item,sortOrder:Number(e.target.value)} : item))}/></label>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={Boolean(selectedPlan.isPopular)} onChange={(e) => setPlans((items) => items.map((item) => item._id === selectedPlan._id ? {...item,isPopular:e.target.checked} : item))}/> Mark as popular</label>
                </div>
                {selectedPlan.providerPlanId && <AdminAlert className="mt-4" tone="warning" title="Provider billing terms are locked">This plan is linked to Razorpay. Price, currency and billing interval cannot be changed in place. Create another plan to offer different billing terms. Description, trial metadata, display order and feature settings remain editable.</AdminAlert>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">Saving plan details does not create a provider subscription or start a charge.</p>
                  <button type="button" className="btn-primary" onClick={() => void savePlanDetails(selectedPlan)} disabled={!canManagePlans || savingPlan === selectedPlan._id}><Save size={15}/> Save plan details</button>
                </div>
              </AdminCard>

              <AdminCard>
                <div className="flex items-center gap-2"><Check className="text-violet-700" size={19}/><div><h3 className="text-lg font-bold text-slate-950">2. Feature access</h3><p className="text-sm text-slate-500">Choose the feature entitlements included with this plan.</p></div></div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-700">{selectedPlan.features?.length || 0} of {availableFeatures.length} selected</p><div className="flex gap-2"><button type="button" className="btn-secondary text-xs" onClick={() => setAllPlanFeatures(selectedPlan._id,true)} disabled={!canManagePlans}>Enable all</button><button type="button" className="btn-secondary text-xs" onClick={() => setAllPlanFeatures(selectedPlan._id,false)} disabled={!canManagePlans}>Clear all</button></div></div>
                {availableFeatures.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{availableFeatures.map((feature) => {const checked=(selectedPlan.features || []).includes(feature.label);return <label key={feature.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white"}`}><input type="checkbox" className="mt-0.5" checked={checked} disabled={!canManagePlans} onChange={() => togglePlanFeature(selectedPlan._id,feature.label)}/><span className="text-sm text-slate-700">{feature.label}</span></label>;})}</div> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No subscription feature definitions were returned.</p>}
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-4"><button type="button" className="btn-primary" onClick={() => void saveFeatures(selectedPlan)} disabled={!canManagePlans || savingPlan === selectedPlan._id}><Save size={15}/> Save feature access</button></div>
              </AdminCard>

              <AdminCard>
                <div className="flex items-center gap-2"><UsersRound className="text-violet-700" size={19}/><div><h3 className="text-lg font-bold text-slate-950">3. Monthly usage limits</h3><p className="text-sm text-slate-500">Usage allowance for metered platform features.</p></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["ai_course_builds_per_month", "AI course builds"],
                    ["advanced_ai_questions_per_month", "Advanced AI questions"],
                    ["advanced_ai_insights_per_month", "Advanced AI summaries"],
                    ["ai_quiz_generations_per_month", "AI quiz generations"],
                    ["youtube_discovery_courses_per_month", "YouTube discovery courses"],
                    ["ai_curated_courses_per_month", "AI-curated courses"]
                  ].map(([key,label]) => <label key={key} className="text-xs font-semibold text-slate-600">{label}<input className="input-field mt-1" type="number" min="-1" step="1" value={planLimit(selectedPlan,key,-1)} disabled={!canManagePlans} onChange={(e) => updatePlanLimit(selectedPlan._id,key,Number(e.target.value))}/></label>)}
                </div>
                <p className="mt-3 text-xs text-slate-500">0 = blocked · -1 = unlimited · positive numbers = permitted uses per month.</p>
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-4"><button type="button" className="btn-primary" onClick={() => void savePlanLimits(selectedPlan)} disabled={!canManagePlans || savingPlan === selectedPlan._id}><Save size={15}/> Save usage limits</button></div>
              </AdminCard>

              <AdminCard>
                <div className="flex items-center gap-2"><Power className="text-violet-700" size={19}/><div><h3 className="text-lg font-bold text-slate-950">4. Availability and catalogue display</h3><p className="text-sm text-slate-500">Control new learner selection without silently revoking existing subscription access.</p></div></div>
                <div className="mt-3 flex flex-wrap items-center gap-2"><AdminBadge tone={selectedPlan.isActive ? "success" : "neutral"}>{selectedPlan.isActive ? "Active · visible to new learners" : "Inactive · hidden from new learners"}</AdminBadge>{selectedPlan.isPopular && <AdminBadge tone="info">Popular presentation</AdminBadge>}</div>
                <p className="mt-3 text-sm text-slate-600">Disabling a plan removes it from the public plan catalogue and from default free-plan selection when applicable. Existing subscription entitlements are preserved and are not cancelled by this action.</p>
                {selectedPlan.isActive && selectedPlan._id === defaultFreePlan?._id && <AdminAlert className="mt-3" tone="warning">This is currently the effective default free-assignment plan. Disabling it may leave no active free-assignment candidate or cause another candidate to become the first match.</AdminAlert>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Plan visibility is independent of the global payment switch.</p><button type="button" className={selectedPlan.isActive ? "btn-danger" : "btn-primary"} onClick={() => void toggle(selectedPlan)} disabled={!canManagePlans || savingPlan === selectedPlan._id}><Power size={15}/>{selectedPlan.isActive ? "Disable plan" : "Enable plan"}</button></div>
              </AdminCard>
            </>
          )}
        </div>
      )}

      {activeSection === "create" && (
        <div className="mt-4 space-y-4">
          <AdminAlert tone="info" title="Creating a plan does not enable payments">
            Plan visibility and checkout availability are separate. The global payment switch still controls whether paid checkout can start.
          </AdminAlert>
          <ol aria-label="Plan creation steps" className="grid gap-2 sm:grid-cols-4">
            {createPlanSteps.map((step, index) => {
              const complete = index < createStep;
              const current = index === createStep;
              return (
                <li key={step.title}>
                  <button type="button" onClick={() => { if (index < createStep) { setError(""); setCreateStep(index); } }} disabled={index > createStep} aria-current={current ? "step" : undefined} className={`flex h-full w-full items-center gap-3 rounded-xl border p-3 text-left transition ${current ? "border-violet-300 bg-violet-50" : complete ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"} ${index < createStep ? "cursor-pointer" : "cursor-default"}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${current ? "bg-violet-700 text-white" : complete ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{complete ? <Check className="h-4 w-4" /> : index + 1}</span>
                    <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{step.title}</span><span className="mt-0.5 block text-xs text-slate-500">{current ? "Current step" : complete ? "Completed" : "Next"}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>

          <section className="card p-5 sm:p-6">
            <div className="border-b border-slate-100 pb-4">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Create subscription plan · Step {createStep + 1} of {createPlanSteps.length}</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-950">{createPlanSteps[createStep].title}</h2>
              <p className="mt-1 text-sm text-slate-500">{createPlanSteps[createStep].description}</p>
            </div>

            {createStep === 0 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">Plan name<input aria-label="Plan name" className="input-field mt-1.5" maxLength={100} placeholder="e.g. Pro" value={form.name} onChange={(event) => { const name=event.target.value; setForm((current)=>({...current,name,slug:slugManuallyEdited?current.slug:slugifyPlanName(name)})); }}/></label>
                <label className="block text-sm font-semibold text-slate-700">Plan slug<input aria-label="Plan slug" className="input-field mt-1.5" maxLength={100} placeholder="e.g. pro" value={form.slug} onChange={(event)=>{setSlugManuallyEdited(true);setForm((current)=>({...current,slug:event.target.value.toLowerCase().trim().replace(/\\s+/g,"-")}));}}/><span className="mt-1 block text-xs font-normal text-slate-500">Generated from the plan name. You can edit it before creating the plan.</span></label>
                <label className="block text-sm font-semibold text-slate-700 md:col-span-2">Learner-facing description<textarea aria-label="Plan description" className="input-field mt-1.5 min-h-24" maxLength={500} placeholder="Describe who this plan is for and what it helps them achieve." value={form.description} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))}/></label>
              </div>
            )}
            {createStep === 1 && (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-sm font-semibold text-slate-700">Price<input aria-label="Plan price" className="input-field mt-1.5" type="number" min="0" step="0.01" value={form.price} onChange={(event)=>setForm((current)=>({...current,price:Number(event.target.value)}))}/><span className="mt-1 block text-xs font-normal text-slate-500">Use 0 for a free plan.</span></label>
                  <label className="block text-sm font-semibold text-slate-700">Currency<input aria-label="Plan currency" className="input-field mt-1.5 uppercase" maxLength={3} value={form.currency} onChange={(event)=>setForm((current)=>({...current,currency:event.target.value.toUpperCase()}))} placeholder="INR"/></label>
                  <label className="block text-sm font-semibold text-slate-700">Billing interval<select aria-label="Plan billing interval" className="input-field mt-1.5" value={form.billingInterval} onChange={(event)=>setForm((current)=>({...current,billingInterval:event.target.value}))}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
                  <label className="block text-sm font-semibold text-slate-700">Display order<input aria-label="Plan display order" className="input-field mt-1.5" type="number" step="1" value={form.sortOrder} onChange={(event)=>setForm((current)=>({...current,sortOrder:Number(event.target.value)}))}/><span className="mt-1 block text-xs font-normal text-slate-500">Lower numbers appear first.</span></label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.isActive} onChange={(event)=>setForm((current)=>({...current,isActive:event.target.checked}))}/><span><span className="block text-sm font-semibold text-slate-800">Show this plan to learners</span><span className="mt-1 block text-xs font-normal text-slate-500">Active plans appear in the public catalogue. Payment availability is controlled separately.</span></span></label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.isPopular} onChange={(event)=>setForm((current)=>({...current,isPopular:event.target.checked}))}/><span><span className="block text-sm font-semibold text-slate-800">Mark as popular</span><span className="mt-1 block text-xs font-normal text-slate-500">Highlights this plan on the Pricing page. Use this sparingly.</span></span></label>
                </div>
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">When payments are disabled, learners can still review active plans and their prices; checkout actions remain unavailable.</p>
              </div>
            )}
            {createStep === 2 && (
              <div className="mt-5 space-y-5">
                {availableFeatures.length > 0 ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">Included features</h3><p className="mt-1 text-xs text-slate-500">Choose exactly which platform features this plan unlocks.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{form.features.length} of {availableFeatures.length} selected</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{availableFeatures.map((feature)=>{const checked=form.features.includes(feature.label);return <label key={feature.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${checked?"border-violet-200 bg-violet-50":"border-slate-200 bg-white hover:border-slate-300"}`}><input type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} onChange={()=>toggleCreateFeature(feature.label)}/><span className="text-sm font-semibold text-slate-700">{feature.label}</span></label>;})}</div></div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No subscription feature definitions were returned. Review the platform configuration before publishing.</p>}
                <div className="rounded-2xl border border-slate-200 p-4"><div><h3 className="text-sm font-bold text-slate-900">Monthly usage limits</h3><p className="mt-1 text-xs text-slate-500">Set how much of each metered feature the learner can use each month.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["ai_course_builds_per_month","AI course builds"],["advanced_ai_questions_per_month","Advanced AI questions"],["advanced_ai_insights_per_month","Advanced AI summaries"],["ai_quiz_generations_per_month","AI quiz generations"],["youtube_discovery_courses_per_month","YouTube discovery courses"],["ai_curated_courses_per_month","AI-curated courses"]].map(([key,label])=><label key={key} className="block text-sm font-semibold text-slate-700">{label}<input className="input-field mt-1.5" type="number" min="-1" step="1" value={form.limits[key]??-1} onChange={(event)=>setForm((current)=>({...current,limits:{...current.limits,[key]:Number(event.target.value)}}))}/></label>)}</div><p className="mt-3 text-xs text-slate-500">0 = feature blocked · -1 = unlimited · positive values = allowed uses per month.</p></div>
              </div>
            )}
            {createStep === 3 && (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Learner-facing plan preview</p><h3 className="mt-1 text-2xl font-extrabold text-slate-950">{form.name||"Unnamed plan"}</h3><p className="mt-1 text-sm text-slate-600">{form.description||"No public description added."}</p></div><div className="text-right"><p className="text-xl font-extrabold text-slate-950">{formatPlanPrice(form.price,form.currency,form.billingInterval)}</p><p className="mt-1 text-xs text-slate-500">{form.price===0?"Free plan":"Paid plan"}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><AdminBadge tone={form.isActive?"success":"neutral"}>{form.isActive?"Visible to learners":"Hidden from learners"}</AdminBadge>{form.isPopular&&<AdminBadge tone="info">Popular plan</AdminBadge>}<AdminBadge>Display order {form.sortOrder}</AdminBadge></div></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-900">Included features · {form.features.length}</h3>{form.features.length?<ul className="mt-3 space-y-2 text-sm text-slate-600">{form.features.map((feature)=><li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>{feature}</li>)}</ul>:<p className="mt-2 text-sm text-slate-500">No feature entitlements selected.</p>}</div><div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-900">Usage limits</h3><ul className="mt-3 space-y-2 text-sm text-slate-600">{Object.entries(form.limits).map(([key,value])=><li key={key} className="flex justify-between gap-3"><span>{key.replace(/_per_month$/,"").replace(/_/g," ")}</span><strong>{Number(value)===-1?"Unlimited":Number(value)===0?"Blocked":Number(value)+" / month"}</strong></li>)}</ul></div></div>
                <AdminAlert tone="warning">Creating a plan does not enable payments globally or create a payment-provider subscription. The global payment switch still controls paid checkout.</AdminAlert>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <button type="button" className="btn-secondary" onClick={createStep===0?()=>setActiveSection("catalogue"):goBackCreatePlan}><ChevronLeft className="h-4 w-4"/>{createStep===0?"Cancel":"Back"}</button>
              {createStep<createPlanSteps.length-1?<button type="button" className="btn-primary" onClick={continueCreatePlan}>Continue <ChevronRight className="h-4 w-4"/></button>:<button type="button" className="btn-primary" onClick={()=>void create()} disabled={!canManagePlans||Boolean(savingPlan)}><Plus className="h-4 w-4"/> Create plan</button>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
