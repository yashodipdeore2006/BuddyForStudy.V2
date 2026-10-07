import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadRazorpay } from "@/lib/razorpay";
import { useAuth } from "@/context/AuthContext";

export default function Pricing() {
  const { session } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/billing/plans").then((data) => setPlans(data.plans || [])).catch(() => setError("Unable to load plans"));
  }, []);

  async function subscribe(planId: string) {
    const plan = plans.find((item) => item._id === planId);
    if (plan?.price === 0) return;
    if (!session) { window.location.href = "/login"; return; }
    setLoading(planId); setError("");
    try {
      const data = await apiFetch("/api/payments/subscription/order", { method: "POST", body: JSON.stringify({ planId }) });
      await loadRazorpay();
      const checkout = new window.Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "BuddyForStudy",
        description: data.plan.name,
        prefill: { name: session.user.name, email: session.user.email },
        theme: { color: "#2563eb" },
        handler: () => setError("Subscription payment submitted. Activation is finalized by payment reconciliation.")
      });
      checkout.open();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start subscription checkout"); }
    finally { setLoading(null); }
  }

  return <div className="mx-auto max-w-6xl px-4 py-12"><div className="text-center"><h1 className="text-3xl font-bold text-slate-900">Choose your plan</h1><p className="mt-2 text-slate-500">Unlock more from BuddyForStudy.</p></div>
    {error && <div className="mx-auto mt-6 max-w-xl rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="mt-10 grid gap-6 md:grid-cols-3">{plans.map((plan) => <div key={plan._id} className="card p-6"><h2 className="text-xl font-semibold">{plan.name}</h2><p className="mt-2 text-3xl font-bold">₹{plan.price}<span className="text-sm font-normal text-slate-500">/{plan.billingInterval}</span></p><p className="mt-3 text-sm text-slate-500">{plan.description}</p><ul className="mt-5 space-y-2 text-sm text-slate-600">{(plan.features || []).map((f:string)=><li key={f}>✓ {f}</li>)}</ul><button
  disabled={loading===plan._id || plan.price===0}
  onClick={()=>subscribe(plan._id)}
  className={`mt-6 w-full ${plan.price===0 ? "btn-secondary" : "btn-primary"}`}
>
  {plan.price===0 ? "Included" : loading===plan._id ? "Opening Checkout..." : "Subscribe"}
</button></div>)}</div>
  </div>;
}
