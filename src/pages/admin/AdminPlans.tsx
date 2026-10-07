import { useEffect, useState } from "react";
import { Check, Power, Plus, RefreshCcw, Save } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

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
};

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [availableFeatures, setAvailableFeatures] = useState<FeatureDefinition[]>([]);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const data = await adminFetch("/api/admin/plans");
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
        }),
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create plan");
    }
  }

  async function toggle(plan: Plan) {
    try {
      setError("");
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !plan.isActive }),
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

  async function saveFeatures(plan: Plan) {
    setSavingPlan(plan._id);
    setError("");

    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ features: plan.features || [] }),
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
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Subscription Plans</h1>
        <p className="mt-2 text-slate-500">
          Manage plan pricing and choose exactly which BuddyForStudy features each plan unlocks.
        </p>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="card mt-6 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Add another plan</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950">Create plan</h2>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <input
            className="input-field"
            placeholder="Plan name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <input
            className="input-field"
            type="number"
            min="0"
            placeholder="Price"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
          <select
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

        <button className="btn-primary mt-4" onClick={() => void create()}>
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="card col-span-full p-12 text-center">
            <RefreshCcw className="mx-auto animate-spin text-slate-400" />
          </div>
        ) : plans.length === 0 ? (
          <div className="card col-span-full p-12 text-center text-sm text-slate-500">
            No plans found.
          </div>
        ) : (
          plans.map((plan) => {
            const selectedFeatureCount = plan.features?.length || 0;

            return (
              <div className="card flex flex-col p-5" key={plan._id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {plan.isPopular && (
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-blue-700">
                        Most popular
                      </span>
                    )}
                    <h3 className="mt-2 text-xl font-extrabold text-slate-950">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{plan.description || "Membership plan"}</p>
                    <p className="mt-3 text-3xl font-extrabold text-slate-950">
                      ₹{plan.price}
                      <span className="text-xs font-normal text-slate-500">
                        {plan.price === 0 ? " · free" : ` / ${plan.billingInterval}`}
                      </span>
                    </p>
                  </div>

                  <button
                    onClick={() => void toggle(plan)}
                    className={plan.isActive ? "btn-secondary" : "btn-danger"}
                  >
                    <Power className="h-4 w-4" />
                    {plan.isActive ? "Disable" : "Enable"}
                  </button>
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
                        onClick={() => setAllPlanFeatures(plan._id, true)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Enable all
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setAllPlanFeatures(plan._id, false)}
                      >
                        Clear all
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void saveFeatures(plan)}
                    disabled={savingPlan === plan._id}
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
      </div>
    </div>
  );
}
