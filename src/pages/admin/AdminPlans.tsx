import { useEffect, useState } from "react";
import { Check, Power, Plus, RefreshCcw, Save, X } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

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

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  price: 0,
  currency: "INR",
  billingInterval: "monthly",
  features: [] as string[],
  isActive: true,
  isPopular: false,
  trialDays: 0,
  sortOrder: 0,
};

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [features, setFeatures] = useState("");
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/plans");
      setPlans(data.plans || []);
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
    const nextFeatures = features.split(",").map((x) => x.trim()).filter(Boolean);
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
          features: nextFeatures,
        }),
      });
      setForm(emptyForm);
      setFeatures("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create plan");
    }
  }

  async function toggle(plan: Plan) {
    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update plan");
    }
  }

  function addFeature(planId: string) {
    const value = (featureDrafts[planId] || "").trim();
    if (!value) return;

    setPlans((current) => current.map((plan) =>
      plan._id === planId && !plan.features.includes(value)
        ? { ...plan, features: [...plan.features, value] }
        : plan
    ));
    setFeatureDrafts((current) => ({ ...current, [planId]: "" }));
  }

  function removeFeature(planId: string, feature: string) {
    setPlans((current) => current.map((plan) =>
      plan._id === planId
        ? { ...plan, features: plan.features.filter((item) => item !== feature) }
        : plan
    ));
  }

  async function saveFeatures(plan: Plan) {
    setSavingPlan(plan._id);
    setError("");
    try {
      await adminFetch(`/api/admin/plans/${plan._id}`, {
        method: "PUT",
        body: JSON.stringify({ features: plan.features }),
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
          Manage Free, Pro and Premium plans and control the features shown for each one.
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

        <input
          className="input-field mt-3"
          placeholder="Features, comma separated"
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
        />

        <button className="btn-primary mt-3" onClick={() => void create()}>
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
          plans.map((plan) => (
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Plan features</p>
                    <p className="mt-1 text-xs text-slate-500">Add or remove features for this plan only.</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                    {plan.features?.length || 0}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(plan.features || []).map((feature) => (
                    <span
                      key={feature}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <Check className="h-3.5 w-3.5 text-green-600" />
                      <span className="max-w-[190px] truncate">{feature}</span>
                      <button
                        type="button"
                        onClick={() => removeFeature(plan._id, feature)}
                        className="rounded-full p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${feature}`}
                        title={`Remove ${feature}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}

                  {!plan.features?.length && (
                    <p className="text-xs text-slate-400">No features configured.</p>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    className="input-field min-w-0 flex-1 bg-white"
                    placeholder="Add a feature"
                    value={featureDrafts[plan._id] || ""}
                    onChange={(e) => setFeatureDrafts((current) => ({ ...current, [plan._id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFeature(plan._id);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addFeature(plan._id)}
                    className="btn-secondary whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>

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
          ))
        )}
      </div>
    </div>
  );
}
