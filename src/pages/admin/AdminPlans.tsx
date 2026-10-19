import { useEffect, useState } from "react";
import { Check, Power, Plus, RefreshCcw, Save, Sparkles } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminTabs } from "@/components/admin/AdminUI";

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
  limits?: Record<string, number>;
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

function promptFinanceReason(action: string) {
  const reason = window.prompt("Reason for " + action + " (10–500 characters):")?.trim() || "";
  return reason.length >= 10 && reason.length <= 500 ? reason : null;
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
  const [activeSection, setActiveSection] = useState<"plans" | "create">("plans");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [data, accessData] = await Promise.all([adminFetch("/api/admin/plans"), adminFetch("/api/admin/access")]);
      setPermissions(accessData.access?.permissions || []);
      setPlans(data.plans || []);
      setAvailableFeatures(data.availableFeatures || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const reason = promptFinanceReason("creating this subscription plan");
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    if (!form.name.trim() || !form.slug.trim()) {
      setError("Plan name and slug are required.");
      return;
    }

    try {
      setError("");
      await adminFetch("/api/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          features: form.features,
          limits: form.limits,
          reason,
        }),
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create plan");
    }
  }

  async function toggle(plan: Plan) {
    const reason = promptFinanceReason((plan.isActive ? "disabling " : "enabling ") + plan.name);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    try {
      setError("");
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !plan.isActive, reason }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update plan");
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

  async function savePlanDetails(plan: Plan) {
    const reason = promptFinanceReason("changing plan details for " + plan.name);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setSavingPlan(plan._id);
    setError("");
    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({
          description: plan.description || "",
          price: Math.max(Number(plan.price) || 0, 0),
          billingInterval: plan.billingInterval,
          trialDays: Math.max(Number(plan.trialDays || 0), 0),
          sortOrder: Number(plan.sortOrder || 0),
          isPopular: Boolean(plan.isPopular),
          limits: plan.limits || {},
          reason,
        }),
      });
      setEditingPlan(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save plan");
    } finally {
      setSavingPlan(null);
    }
  }

  async function savePlanLimits(plan: Plan) {
    const reason = promptFinanceReason("changing limits for " + plan.name);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setSavingPlan(plan._id);
    setError("");
    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ limits: plan.limits || {}, reason }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save plan limits");
    } finally {
      setSavingPlan(null);
    }
  }

  async function saveFeatures(plan: Plan) {
    const reason = promptFinanceReason("changing features for " + plan.name);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setSavingPlan(plan._id);
    setError("");

    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ features: plan.features || [], reason }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save plan features");
    } finally {
      setSavingPlan(null);
    }
  }


  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        title="Subscription plans"
        description="Manage plan pricing and choose exactly which BuddyForStudy features each plan unlocks."
        actions={<button type="button" className="btn-primary" onClick={() => setActiveSection("create")} disabled={!permissions.includes("plans.manage")}><Plus className="h-4 w-4" /> Create plan</button>}
      />

      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6">
        <AdminTabs ariaLabel="Subscription plan work areas" value={activeSection} onChange={setActiveSection} items={[{ value: "plans", label: `Plans (${plans.length})` }, { value: "create", label: "Create plan" }]} />
      </div>

      {activeSection === "create" && <div className="card mt-4 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Add another plan</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950">Create plan</h2>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <input
            aria-label="Plan name"
            className="input-field"
            placeholder="Plan name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            aria-label="Plan slug"
            className="input-field"
            placeholder="Slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <input
            aria-label="Plan price"
            className="input-field"
            type="number"
            min="0"
            placeholder="Price"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
          <select
            aria-label="Plan billing interval"
            className="input-field"
            value={form.billingInterval}
            onChange={(e) => setForm({ ...form, billingInterval: e.target.value })}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="one_time">One time</option>
          </select>
        </div>

        {availableFeatures.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Plan features</p>
                <p className="mt-1 text-xs text-slate-500">
                  Tick the features this new plan should include.
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                {form.features.length}/{availableFeatures.length} selected
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {availableFeatures.map((feature) => {
                const checked = form.features.includes(feature.label);

                return (
                  <label
                    key={feature.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                      checked
                        ? "border-blue-200 bg-blue-50/70"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={checked}
                      onChange={() => toggleCreateFeature(feature.label)}
                    />
                    <span className="text-sm font-semibold text-slate-700">{feature.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">AI usage limits / month</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["ai_course_builds_per_month", "AI course builds"],
              ["advanced_ai_questions_per_month", "Advanced AI questions"],
              ["advanced_ai_insights_per_month", "Advanced AI summaries"],
              ["ai_quiz_generations_per_month", "AI quiz generations"],
              ["youtube_discovery_courses_per_month", "YouTube discovery courses"],
              ["ai_curated_courses_per_month", "AI-curated courses"],
            ].map(([key, label]) => (
              <label key={key} className="block text-xs font-semibold text-slate-500">
                {label}
                <input
                  className="input-field mt-1"
                  type="number"
                  min="-1"
                  value={form.limits[key] ?? -1}
                  onChange={(e) => setForm({ ...form, limits: { ...form.limits, [key]: Number(e.target.value) } })}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">0 = blocked by quota; -1 = unlimited.</p>
        </div>

        <button className="btn-primary mt-4" onClick={() => void create()} disabled={!permissions.includes("plans.manage")}>
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>}

      {activeSection === "plans" && <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div role="status" aria-live="polite" aria-label="Loading subscription plans" className="card col-span-full p-12 text-center">
            <RefreshCcw className="mx-auto animate-spin text-slate-400" /><span className="sr-only">Loading subscription plans</span>
          </div>
        ) : plans.length === 0 ? (
          <div role="status" aria-live="polite" className="card col-span-full p-12 text-center text-sm text-slate-500">
            No plans found.
          </div>
        ) : (
          plans.map((plan) => {
            const selectedFeatureCount = plan.features?.length || 0;

            return (
              <div className="card bfs-plan-card bfs-plan-admin-card flex flex-col p-5" key={plan._id}>
                <div className="flex flex-col gap-4">
                  <div className="w-full min-w-0">
                    {plan.isPopular && (
                      <span className="bfs-plan-badge"><Sparkles className="h-3 w-3" /> Most popular</span>
                    )}
                    <h3 className="mt-2 text-xl font-extrabold text-slate-950">{plan.name}</h3>
                    {editingPlan === plan._id ? (
                      <div className="mt-3 space-y-2">
                        <textarea className="input-field min-h-20" value={plan.description || ""} onChange={(e) => setPlans((items) => items.map((item) => item._id === plan._id ? { ...item, description: e.target.value } : item))} placeholder="Plan description" />
                        <div className="grid grid-cols-2 gap-2">
                          <input className="input-field" type="number" min="0" value={plan.price} onChange={(e) => setPlans((items) => items.map((item) => item._id === plan._id ? { ...item, price: Number(e.target.value) } : item))} />
                          <select className="input-field" value={plan.billingInterval} onChange={(e) => setPlans((items) => items.map((item) => item._id === plan._id ? { ...item, billingInterval: e.target.value } : item))}>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                            <option value="one_time">One time</option>
                          </select>
                          <input className="input-field" type="number" min="0" value={plan.trialDays || 0} onChange={(e) => setPlans((items) => items.map((item) => item._id === plan._id ? { ...item, trialDays: Number(e.target.value) } : item))} placeholder="Trial days" />
                          <input className="input-field" type="number" min="0" value={plan.sortOrder || 0} onChange={(e) => setPlans((items) => items.map((item) => item._id === plan._id ? { ...item, sortOrder: Number(e.target.value) } : item))} placeholder="Sort order" />
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={Boolean(plan.isPopular)} onChange={(e) => setPlans((items) => items.map((item) => item._id === plan._id ? { ...item, isPopular: e.target.checked } : item))} /> Mark as most popular</label>
                      </div>
                    ) : (
                      <>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{plan.description || "Membership plan"}</p>
                        <p className="mt-3 text-3xl font-extrabold text-slate-950">₹{plan.price}<span className="text-xs font-normal text-slate-500">{plan.price === 0 ? " · free" : " / " + plan.billingInterval}</span></p>
                        <p className="mt-1 text-xs text-slate-400">Trial {plan.trialDays || 0} days · Sort {plan.sortOrder || 0}</p>
                        <div className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">AI usage limits / month</p>
                          <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                            {[
                              ["ai_course_builds_per_month", "AI course builds"],
                              ["advanced_ai_questions_per_month", "Advanced AI questions"],
                              ["advanced_ai_insights_per_month", "Advanced AI summaries"],
                              ["ai_quiz_generations_per_month", "AI quiz generations"],
                              ["youtube_discovery_courses_per_month", "YouTube discovery courses"],
                              ["ai_curated_courses_per_month", "AI-curated courses"],
                            ].map(([key, label]) => (
                              <label key={key} className="block min-w-0">
                                <span className="block leading-5 text-slate-600">{label}</span>
                                <input className="input-field mt-1" type="number" min="-1" value={planLimit(plan, key, -1)} onChange={(e) => updatePlanLimit(plan._id, key, Number(e.target.value))} />
                              </label>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[10px] text-slate-400">0 = blocked; -1 = unlimited. Changes apply to new course additions.</p>
                            <button type="button" onClick={() => void savePlanLimits(plan)} disabled={!permissions.includes("plans.manage") || savingPlan === plan._id} className="btn-secondary">
                              {savingPlan === plan._id ? "Saving limits..." : "Save limits"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setEditingPlan(editingPlan === plan._id ? null : plan._id)} className="btn-secondary" disabled={!permissions.includes("plans.manage")}>
                      {editingPlan === plan._id ? "Close editor" : "Edit plan"}
                    </button>
                    <button onClick={() => void toggle(plan)} className={plan.isActive ? "btn-secondary" : "btn-danger"} disabled={!permissions.includes("plans.manage")}>
                      <Power className="h-4 w-4" />
                      {plan.isActive ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
                        Feature access
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Tick a feature to enable it for this plan.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                      {selectedFeatureCount}/{availableFeatures.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {availableFeatures.map((feature) => {
                      const checked = (plan.features || []).includes(feature.label);

                      return (
                        <label
                          key={feature.key}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                            checked
                              ? "border-blue-200 bg-white"
                              : "border-transparent bg-white/60 hover:border-slate-200"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={checked}
                            onChange={() => togglePlanFeature(plan._id, feature.label)}
                          />
                          <span className={checked ? "text-sm font-semibold text-slate-700" : "text-sm text-slate-500"}>
                            {feature.label}
                          </span>
                        </label>
                      );
                    })}

                    {!availableFeatures.length && (
                      <p className="text-xs text-slate-400">No subscription features configured.</p>
                    )}
                  </div>

                  {availableFeatures.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setAllPlanFeatures(plan._id, true)} disabled={!permissions.includes("plans.manage")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Enable all
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setAllPlanFeatures(plan._id, false)} disabled={!permissions.includes("plans.manage")}
                      >
                        Clear all
                      </button>
                    </div>
                  )}

                  {editingPlan === plan._id && (
                    <button
                      type="button"
                      onClick={() => void savePlanDetails(plan)}
                      disabled={!permissions.includes("plans.manage") || savingPlan === plan._id}
                      className="btn-secondary mt-2 w-full justify-center"
                    >
                      <Save className="h-4 w-4" />
                      {savingPlan === plan._id ? "Saving plan..." : "Save plan details"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void saveFeatures(plan)}
                    disabled={!permissions.includes("plans.manage") || savingPlan === plan._id}
                    className="btn-primary mt-3 w-full justify-center"
                  >
                    {savingPlan === plan._id ? (
                      <>
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                        Saving features...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Features
                      </>
                    )}
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>}
    </div>
  );
}
