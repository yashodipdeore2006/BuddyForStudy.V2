import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Crown,
  LockKeyhole,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { loadRazorpay } from "@/lib/razorpay";
import { useAuth } from "@/context/AuthContext";

type Plan = {
  _id: string;
  name: string;
  slug?: string;
  price: number;
  currency?: string;
  billingInterval: string;
  description?: string;
  features?: string[];
  isPopular?: boolean;
};

type GateRequest = {
  feature?: string;
  currentPlan?: string;
  message?: string;
  limit?: number;
  used?: number;
};

type Subscription = {
  plan?: string | { _id?: string; name?: string; slug?: string; price?: number };
  status?: string;
};

type ModalMessage = { type: "info" | "error" | "success"; text: string };

const FEATURE_LABELS: Record<string, string> = {
  published_courses: "Full course access",
  course_search: "Course discovery",
  learning_progress: "Learning progress tracking",
  ai_course_builder: "AI course builder",
  personalized_roadmaps: "Personalized learning roadmaps",
  project_based_learning: "Project-based learning",
  advanced_ai_paths: "Advanced AI learning assistant",
  study_planning: "Personalized study planning",
  priority_recommendations: "Priority learning recommendations",
};

const FEATURE_ENTITLEMENT_LABELS: Record<string, string> = {
  published_courses: "Access published courses",
  course_search: "Normal course search",
  learning_progress: "Basic learning progress tracking",
  ai_course_builder: "Build with AI",
  personalized_roadmaps: "Personalized learning roadmaps",
  project_based_learning: "Project-based learning",
  advanced_ai_paths: "Advanced AI learning assistant (summary, notes & lesson Q&A)",
  study_planning: "Personalized study planning",
  priority_recommendations: "Priority learning recommendations",
};

function formatMoney(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

function intervalLabel(interval: string) {
  switch (interval) {
    case "monthly": return "month";
    case "quarterly": return "quarter";
    case "yearly": return "year";
    case "one_time": return "one time";
    default: return interval || "billing period";
  }
}

export default function FeatureUpgradeModal() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState<GateRequest | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);
  const [hoverPlanId, setHoverPlanId] = useState<string | null>(null);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<ModalMessage | null>(null);

  const open = Boolean(request);
  const featureLabel = request?.feature
    ? FEATURE_LABELS[request.feature] || request.feature.replace(/_/g, " ")
    : "this feature";

  const currentPlanId = typeof subscription?.plan === "object"
    ? subscription.plan?._id
    : subscription?.plan;
  const currentPlanName = typeof subscription?.plan === "object"
    ? subscription.plan?.name
    : undefined;
  const currentPlanPrice = typeof subscription?.plan === "object"
    ? Number(subscription.plan?.price || 0)
    : null;

  const currentPlan = useMemo(
    () => plans.find((plan) => plan._id === currentPlanId) ||
      plans.find((plan) => plan.name === (currentPlanName || request?.currentPlan)) ||
      null,
    [plans, currentPlanId, currentPlanName, request?.currentPlan]
  );

  useEffect(() => {
    const handleFeatureGated = (event: Event) => {
      const detail = (event as CustomEvent<GateRequest>).detail || {};
      setRequest(detail);
      setSelectedPlanId("");
      setPreviewPlanId(null);
      setHoverPlanId(null);
      setMessage(null);
    };
    window.addEventListener("bfs:feature-gated", handleFeatureGated);
    return () => window.removeEventListener("bfs:feature-gated", handleFeatureGated);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPlans(true);
    Promise.all([
      apiFetch("/api/billing/plans"),
      session ? apiFetch("/api/billing/me").catch(() => ({ subscription: null })) : Promise.resolve({ subscription: null }),
    ]).then(([planData, subscriptionData]) => {
      if (cancelled) return;
      const ordered = [...(planData.plans || [])].filter((plan: Plan & { isActive?: boolean }) => plan.isActive !== false && plan.billingInterval !== "one_time").sort((a: Plan, b: Plan) => {
        const difference = Number(b.price || 0) - Number(a.price || 0);
        return difference || Number(b.isPopular === true) - Number(a.isPopular === true);
      });
      setPlans(ordered);
      setSubscription(subscriptionData.subscription || null);
      // Default to the most expensive purchasable plan that includes the blocked feature.
      // If none includes it, show the highest priced plan for transparency but disable checkout.
      const requiredFeatureLabel = request?.feature ? FEATURE_ENTITLEMENT_LABELS[request.feature] : undefined;
      const currentSubscription = subscriptionData.subscription as Subscription | null;
      const activePlanId = typeof currentSubscription?.plan === "object"
        ? currentSubscription.plan?._id
        : currentSubscription?.plan;
      const highestPlanWithFeature = requiredFeatureLabel
        ? ordered.find((plan: Plan) =>
            (plan.features || []).includes(requiredFeatureLabel) &&
            Number(plan.price) > 0 &&
            plan._id !== activePlanId
          )
        : ordered.find((plan: Plan) => Number(plan.price) > 0 && plan._id !== activePlanId);
      // Start with the most expensive active plan that unlocks the requested feature.
      // If no configured plan offers it, retain the highest-priced plan but disable checkout.
      setSelectedPlanId(highestPlanWithFeature?._id || ordered[0]?._id || "");
      setPreviewPlanId(null);
      setHoverPlanId(null);
    }).catch((error) => {
      if (!cancelled) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "We couldn't load the available plans. Please try again.",
        });
      }
    }).finally(() => {
      if (!cancelled) setLoadingPlans(false);
    });
    return () => { cancelled = true; };
  }, [open, session, request?.feature]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !checkoutPlanId) setRequest(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, checkoutPlanId]);

  const selectedPlan = plans.find((plan) => plan._id === selectedPlanId) || plans[0] || null;
  const focusedPlanId = hoverPlanId || previewPlanId || selectedPlan?._id;
  const requiredFeatureLabel = request?.feature ? FEATURE_ENTITLEMENT_LABELS[request.feature] : undefined;
  const selectedPlanSupportsFeature = Boolean(
    selectedPlan && (!requiredFeatureLabel || (selectedPlan.features || []).includes(requiredFeatureLabel))
  );
  const isSelectedPlanCurrent = Boolean(selectedPlan && (
    selectedPlan._id === currentPlanId ||
    selectedPlan._id === currentPlan?._id ||
    selectedPlan.name === (currentPlanName || request?.currentPlan)
  ));

  async function subscribe(plan: Plan) {
    if (!session) {
      setRequest(null);
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    if (Number(plan.price) <= 0 || plan._id === currentPlanId || checkoutPlanId) return;

    setCheckoutPlanId(plan._id);
    setMessage(null);
    try {
      const data = await apiFetch("/api/payments/subscription/order", {
        method: "POST",
        body: JSON.stringify({ planId: plan._id }),
      });
      await loadRazorpay();
      const subscriptionId = String(data.subscriptionId || "");
      if (!subscriptionId) throw new Error("The subscription checkout could not be created. Please try again.");

      const reconcile = async (): Promise<boolean> => {
        try {
          const sync = await apiFetch("/api/billing/subscription/sync", {
            method: "POST",
            body: JSON.stringify({ subscriptionId }),
          });
          if (sync.activated) {
            setMessage({ type: "success", text: "Your plan is active. Refreshing your learning access…" });
            // Invalidate cached billing/usage reads before the protected action is retried by the refreshed app.
            window.dispatchEvent(new CustomEvent("bfs:entitlements-updated", { detail: { planId: plan._id } }));
            setRequest(null);
            window.setTimeout(() => window.location.reload(), 800);
            return true;
          }
          setMessage({ type: "info", text: "Payment received. Waiting for subscription confirmation…" });
        } catch {
          // Payment webhooks can finish activation shortly after checkout returns.
        }
        return false;
      };

      const waitForActivation = async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          if (await reconcile()) return;
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
        setMessage({
          type: "info",
          text: "Payment completed, but activation is still being confirmed. Refresh this page in a moment.",
        });
      };

      const checkout = new window.Razorpay({
        key: data.keyId,
        subscription_id: subscriptionId,
        name: "BuddyForStudy",
        description: data.plan?.name || plan.name,
        prefill: { name: session.user.name, email: session.user.email },
        theme: { color: "#8B5CF6" },
        handler: () => {
          setMessage({ type: "success", text: "Payment successful. Confirming your plan…" });
          void waitForActivation();
        },
        modal: {
          ondismiss: () => setMessage({
            type: "info",
            text: "Checkout closed. Your current plan has not changed.",
          }),
        },
      });
      checkout.open();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to start checkout. Please try again.",
      });
    } finally {
      setCheckoutPlanId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1029]/65 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !checkoutPlanId) setRequest(null);
      }}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bfs-upgrade-title"
        aria-describedby="bfs-upgrade-description"
        className="bfs-upgrade-modal relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-2xl"
      >
        <header className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-5 py-6 sm:px-8 sm:py-7">
          <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-violet-300/30 blur-3xl" />
          <button
            type="button"
            aria-label="Close plan selection"
            disabled={Boolean(checkoutPlanId)}
            onClick={() => setRequest(null)}
            className="absolute right-4 top-4 z-10 rounded-full border border-slate-200 bg-white/85 p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
          ><X className="h-4 w-4" /></button>
          <div className="relative flex items-start gap-3 pr-9">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/20"><LockKeyhole className="h-5 w-5" /></div>
            <div>
              <span className="bfs-tag"><Sparkles className="h-3.5 w-3.5" /> Unlock more with BuddyForStudy</span>
              <h2 id="bfs-upgrade-title" className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Take your learning further.</h2>
              <p id="bfs-upgrade-description" className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {request?.limit !== undefined ? (
                  <><strong className="font-semibold text-violet-700">{featureLabel}</strong> has reached its allowance for your current plan{request.limit >= 0 ? ` (${request.used ?? request.limit} of ${request.limit} used)` : ""}. Compare plans for a higher allowance.</>
                ) : (
                  <><strong className="font-semibold text-violet-700">{featureLabel}</strong> isn’t included in your current plan. Compare plans and choose the one that fits your goals.</>
                )}
              </p>
              {(currentPlanName || request?.currentPlan) && <p className="mt-2 text-xs font-medium text-slate-500">Current plan: {currentPlanName || request?.currentPlan}{currentPlanPrice !== null ? ` · ${formatMoney(currentPlanPrice)}` : ""}</p>}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          {message && <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
            message.type === "error" ? "border-red-200 bg-red-50 text-red-700" :
            "border-blue-200 bg-blue-50 text-blue-800"
          }`}>{message.text}</div>}

          {loadingPlans ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-medium text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-violet-600" /> Loading available plans…</div>
          ) : plans.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">No active subscription plans are available right now. Please try again later.</div>
          ) : (
            <>
              <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-violet-500" /> Move over a plan or focus it with your keyboard to preview it.</p>
              <div className="grid gap-4 md:grid-cols-3">
                {plans.map((plan, index) => {
                  const isSelected = selectedPlan?._id === plan._id;
                  const isFocused = focusedPlanId === plan._id;
                  const isCurrent = Boolean(currentPlanId && plan._id === currentPlanId) ||
                    Boolean(currentPlan && currentPlan._id === plan._id) ||
                    (!currentPlanId && plan.name === (request?.currentPlan || ""));
                  const price = Number(plan.price || 0);
                  const isTop = index === 0;
                  const unlocksFeature = !requiredFeatureLabel || (plan.features || []).includes(requiredFeatureLabel);
                  return (
                    <article
                      key={plan._id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Select ${plan.name} plan`}
                      onMouseEnter={() => setHoverPlanId(plan._id)}
                      onMouseLeave={() => { setHoverPlanId(null); setPreviewPlanId(null); }}
                      onClick={() => setSelectedPlanId(plan._id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedPlanId(plan._id);
                        }
                      }}
                      onFocusCapture={() => setPreviewPlanId(plan._id)}
                      onBlur={() => setPreviewPlanId(null)}
                      className={`bfs-plan-card bfs-plan-option relative flex min-h-64 cursor-pointer flex-col rounded-2xl border p-5 transition-all duration-200 ${
                        isFocused
                          ? "bfs-plan-option--selected bfs-plan-option--selected border-violet-500 bg-violet-50/80 shadow-xl shadow-violet-600/10 ring-2 ring-violet-500/25"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30"
                      }`}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <div className="mb-3 flex min-h-7 flex-wrap items-center gap-2">
                        {isTop && <span className="bfs-plan-badge bfs-plan-badge--featured"><Crown className="h-3 w-3" /> Highest access</span>}
                        {!isTop && plan.isPopular && <span className="bfs-plan-badge"><Sparkles className="h-3 w-3" /> Popular</span>}
                        {isCurrent && <span className="bfs-plan-badge bfs-plan-badge--neutral">Current plan</span>}
                        {!isCurrent && requiredFeatureLabel && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${unlocksFeature ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{unlocksFeature ? "Unlocks this feature" : "Feature not included"}</span>}
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-950">{plan.name}</h3>
                      <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{plan.description || "A focused learning plan to keep you moving forward."}</p>
                      <p className="bfs-plan-price mt-3">
                        {formatMoney(price, plan.currency || "INR")}
                        <span className="ml-1 text-xs font-medium text-slate-500">/{intervalLabel(plan.billingInterval)}</span>
                      </p>
                      <ul className="bfs-plan-features mt-4 flex-1 space-y-2 border-t border-slate-200/80 pt-4 text-xs leading-5">
                        {(plan.features || []).slice(0, 6).map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="bfs-plan-check mt-0.5 h-4 w-4 shrink-0 rounded-full p-0.5" /><span>{feature}</span></li>)}
                        {(plan.features || []).length > 6 && <li className="pl-5 font-semibold text-violet-700">+{plan.features!.length - 6} more features</li>}
                      </ul>
                      <div className="mt-5 flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${isFocused ? "text-violet-700" : "text-slate-500"}`}>{isSelected ? "Selected plan" : isFocused ? "Previewing plan" : "Choose plan"}</span>
                        {isSelected && <span aria-label="Selected" className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white"><Check className="h-3.5 w-3.5" /></span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs leading-5 text-slate-500">Hover previews a plan; select it with a click or tap to change your choice. No payment starts until you choose to upgrade. Your current access stays unchanged until the subscription is confirmed.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn-secondary justify-center" onClick={() => setRequest(null)} disabled={Boolean(checkoutPlanId)}>Maybe later</button>
            <button
              type="button"
              className="btn-primary justify-center"
              disabled={!selectedPlan || loadingPlans || Boolean(checkoutPlanId) || isSelectedPlanCurrent || !selectedPlanSupportsFeature || Number(selectedPlan.price) <= 0}
              onClick={() => selectedPlan && void subscribe(selectedPlan)}
            >
              {checkoutPlanId ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{!selectedPlanSupportsFeature ? "Select a plan with this feature" : isSelectedPlanCurrent ? "Current plan" : "Upgrade plan"} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
