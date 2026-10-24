import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Crown, Loader2, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { loadRazorpay } from "@/lib/razorpay";
import { useAuth } from "@/context/AuthContext";
import { routes } from "@/lib/routes";

type Plan = {
  _id: string;
  name: string;
  price: number;
  billingInterval: string;
  description?: string;
  features?: string[];
  limits?: Record<string, number>;
  currency?: string;
  isPopular?: boolean;
};

function formatMoney(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
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

const planLimitDefinitions = [
  ["ai_course_builds_per_month", "AI course builds"],
  ["advanced_ai_questions_per_month", "Advanced AI questions"],
  ["advanced_ai_insights_per_month", "Advanced AI summaries"],
  ["ai_quiz_generations_per_month", "AI quiz generations"],
  ["youtube_discovery_courses_per_month", "YouTube discovery courses"],
  ["ai_curated_courses_per_month", "AI-curated courses"],
] as const;

function formatPlanLimit(value: unknown) {
  if (value === undefined || value === null || value === "") return "Not configured";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not configured";
  if (numeric === -1) return "Unlimited";
  if (numeric === 0) return "Not included";
  return `${numeric.toLocaleString("en-IN")} / month`;
}

type PricingMessage = {
  type: "success" | "info" | "error";
  text: string;
};

type CurrentSubscription = {
  status?: string;
  plan?: { name?: string } | string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};
type TrialConversionOffer = { _id: string; endsAt: string; conversionConsentStatus: string; conversionPlan?: { _id?: string; name?: string; price?: number; currency?: string; billingInterval?: string } | null };

export default function Pricing() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("courseId");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<PricingMessage | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [trialConversion, setTrialConversion] = useState<TrialConversionOffer | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const hasActiveSubscription = Boolean(currentSubscription && ["active", "trialing", "past_due"].includes(String(currentSubscription.status || "")) && (!currentSubscription.currentPeriodEnd || new Date(currentSubscription.currentPeriodEnd).getTime() > Date.now()));

  useEffect(() => {
    apiFetch("/api/billing/plans")
      .then((data) => {
        const sortedPlans = [...(data.plans || [])].sort(
          (a, b) => Number(b.price || 0) - Number(a.price || 0)
        );

        setPlans(sortedPlans);
      })
      .catch(() => {
        setMessage({
          type: "error",
          text: "Unable to load plans",
        });
      })
      .finally(() => setLoadingPlans(false));
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) {
      setCurrentSubscription(null);
      return () => { active = false; };
    }
    Promise.all([apiFetch("/api/billing/me"), apiFetch("/api/billing/trial")])
      .then(([data, trialData]) => {
        if (active) {
          setCurrentSubscription(data.subscription || null);
          const offer = trialData.trial;
          setTrialConversion(offer?.conversionConsentStatus === "pending_user_consent" && offer?.conversionPlan?._id ? offer : null);
        }
      })
      .catch(() => {
        if (active) setCurrentSubscription(null);
      });
    return () => { active = false; };
  }, [session]);

  async function subscribe(planId: string, convertTrial = false) {
    const plan = plans.find((item) => item._id === planId);

    if (!plan || Number(plan.price) === 0) return;
    if (hasActiveSubscription && !convertTrial) {
      setMessage({ type: "info", text: "You already have an active subscription. Manage your current plan in Billing instead of purchasing another plan." });
      return;
    }
    if (convertTrial && (!trialConversion || !consentChecked || trialConversion.conversionPlan?._id !== planId)) {
      setMessage({ type: "error", text: "Review the recurring payment terms and confirm consent before continuing." });
      return;
    }

    if (!session) {
      window.location.href = routes.login();
      return;
    }

    setLoading(planId);
    setMessage(null);

    try {
      const data = await apiFetch("/api/payments/subscription/order", {
        method: "POST",
        body: JSON.stringify({ planId, ...(convertTrial && trialConversion ? { trialConversionGrantId: trialConversion._id, recurringConsent: true } : {}) }),
      });

      await loadRazorpay();

      const subscriptionId = String(data.subscriptionId || "");

      const reconcile = async (): Promise<boolean> => {
        try {
          const sync = await apiFetch("/api/billing/subscription/sync", {
            method: "POST",
            body: JSON.stringify({ subscriptionId }),
          });

          if (sync.activated) {
            setMessage({
              type: "success",
              text: "Payment successful. Your subscription is now active.",
            });
            return true;
          }

          setMessage({
            type: "info",
            text: "Payment received. Waiting for Razorpay to confirm the subscription...",
          });
        } catch {
          // The webhook may activate the subscription shortly.
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
          text: "Payment successful. Subscription activation is still being confirmed; please refresh in a moment.",
        });
      };

      const checkout = new window.Razorpay({
        key: data.keyId,
        subscription_id: subscriptionId,
        name: "BuddyForStudy",
        description: data.plan.name,
        prefill: {
          name: session.user.name,
          email: session.user.email,
        },
        theme: { color: "#7C3AED" },
        handler: () => {
          setMessage({
            type: "success",
            text: "Payment successful. Confirming your subscription...",
          });

          void waitForActivation();
        },
        modal: {
          ondismiss: () => {
            setMessage({
              type: "info",
              text: "Checkout closed. No subscription was activated by this action.",
            });
          },
        },
      });

      checkout.open();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to start subscription checkout",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">
          Choose how you want to learn
        </h1>

        <p className="mt-2 text-slate-500">
          Choose a subscription for broad access, or purchase one course once
          with no subscription required.
        </p>
      </div>

      {message && (
        <div
          className={`mx-auto mt-6 max-w-xl rounded-lg p-3 text-sm ${message.type === "success"
            ? "bg-green-50 text-green-700"
            : message.type === "info"
              ? "bg-blue-50 text-blue-700"
              : "bg-red-50 text-red-700"
            }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      {hasActiveSubscription && !trialConversion && (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left" role="status">
          <p className="font-semibold text-emerald-900">You already have an active subscription{typeof currentSubscription?.plan === "object" && currentSubscription.plan?.name ? ` — ${currentSubscription.plan.name}` : ""}.</p>
          <p className="mt-1 text-sm text-emerald-800">Your included course access is available now. You do not need to subscribe again.</p>
          <Link to={routes.billing()} className="mt-3 inline-flex items-center gap-2 font-semibold text-emerald-900 underline underline-offset-4">Manage subscription <ArrowRight className="h-4 w-4" /></Link>
        </div>
      )}

      {trialConversion && (
        <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-violet-200 bg-violet-50 p-5 text-left" aria-labelledby="trial-conversion-heading">
          <h2 id="trial-conversion-heading" className="text-lg font-bold text-violet-950">Your trial is active — choose whether to continue</h2>
          <p className="mt-2 text-sm text-violet-900">Your trial ends {new Date(trialConversion.endsAt).toLocaleDateString("en-IN")}. Continuing starts a recurring subscription for <strong>{trialConversion.conversionPlan?.name}</strong> at <strong>{formatMoney(Number(trialConversion.conversionPlan?.price || 0), trialConversion.conversionPlan?.currency || "INR")} / {intervalLabel(trialConversion.conversionPlan?.billingInterval || "")}</strong>, subject to Razorpay's authorization flow.</p>
          <label className="mt-4 flex items-start gap-3 text-sm text-violet-950">
            <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} className="mt-1" />
            <span>I want to continue with this paid recurring plan. I understand the stated price and billing interval, and I will authorize recurring payments in Razorpay checkout. I understand that no recurring payment is authorized until I complete that provider flow.</span>
          </label>
          <button type="button" disabled={!consentChecked || !trialConversion.conversionPlan?._id || loading === trialConversion.conversionPlan?._id} onClick={() => trialConversion.conversionPlan?._id && void subscribe(trialConversion.conversionPlan._id, true)} className="btn-primary mt-4 w-full sm:w-auto">
            {loading === trialConversion.conversionPlan?._id ? "Opening checkout…" : "Continue with paid plan"}
          </button>
          <p className="mt-2 text-xs text-violet-800">You can decline this offer in Billing. If you do not authorize recurring payments, you will not be charged through this offer.</p>
        </section>
      )}

      {loadingPlans && (
        <div role="status" aria-live="polite" className="mt-10 flex min-h-40 items-center justify-center gap-3 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-violet-600" /> Loading subscription plans…</div>
      )}
      {!loadingPlans && plans.length === 0 && !message && (
        <div className="bfs-plan-empty mt-10 rounded-3xl border p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-violet-500" />
          <h2 className="mt-3 text-xl font-bold">Plans are on their way</h2>
          <p className="mt-2 text-sm text-slate-500">We couldn't find any available subscription plans right now.</p>
        </div>
      )}

      {!loadingPlans && plans.length > 0 && <div className="mt-10 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = index === 0 || plan.isPopular === true;
          return (
            <article key={plan._id} className={`bfs-plan-card bfs-interactive-card relative flex h-full flex-col p-6 sm:p-7 ${featured ? "bfs-plan-card--featured" : ""}`}>
              <div className="mb-4 flex min-h-7 flex-wrap items-center gap-2">
                {index === 0 && <span className="bfs-plan-badge bfs-plan-badge--featured"><Crown className="h-3.5 w-3.5" /> Highest access</span>}
                {index !== 0 && plan.isPopular && <span className="bfs-plan-badge"><Sparkles className="h-3.5 w-3.5" /> Most popular</span>}
                {Number(plan.price) === 0 && <span className="bfs-plan-badge bfs-plan-badge--neutral">Free</span>}
              </div>
              <h2 className="text-xl font-extrabold text-slate-950">{plan.name}</h2>
              <p className="mt-2 min-h-10 text-sm text-slate-500">{plan.description || "A focused learning plan to help you keep moving forward."}</p>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="bfs-plan-price">{formatMoney(Number(plan.price || 0), plan.currency || "INR")}</span>
                <span className="text-sm font-medium text-slate-500">{Number(plan.price) === 0 ? "forever" : `/${intervalLabel(plan.billingInterval)}`}</span>
              </div>
              <div className="my-5 border-t border-slate-200" />
              <section className="flex-1" aria-label={`${plan.name} included features and usage limits`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Included features</h3>
                <ul className="bfs-plan-features mt-3 space-y-3 text-sm">
                  {(plan.features || []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span className="bfs-plan-check mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"><Check className="h-3.5 w-3.5" /></span>
                      <span>{feature}</span>
                    </li>
                  ))}
                  {!(plan.features || []).length && <li className="text-sm text-slate-500">No feature entitlements are configured for this plan.</li>}
                </ul>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">AI usage limits</h3>
                  <p className="mt-1 text-xs text-slate-500">Per-month allowances configured for this plan.</p>
                  <dl className="mt-3 space-y-2.5">
                    {planLimitDefinitions.map(([key, label]) => (
                      <div key={key} className="flex items-start justify-between gap-3 text-xs">
                        <dt className="min-w-0 text-slate-600">{label}</dt>
                        <dd className="shrink-0 text-right font-semibold text-slate-900">{formatPlanLimit(plan.limits?.[key])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
              <button
                type="button"
                disabled={loading === plan._id || Number(plan.price) === 0 || (hasActiveSubscription && !(trialConversion && trialConversion.conversionPlan?._id === plan._id && consentChecked))}
                onClick={() => void subscribe(plan._id, Boolean(trialConversion && trialConversion.conversionPlan?._id === plan._id))}
                className={`mt-7 w-full ${Number(plan.price) === 0 ? "btn-secondary" : "btn-buy"}`}
              >
                {loading === plan._id ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening checkout…</> : hasActiveSubscription && !(trialConversion && trialConversion.conversionPlan?._id === plan._id) ? "Already subscribed" : Number(plan.price) === 0 ? "Included" : <>Choose plan <ArrowRight className="h-4 w-4" /></>}
              </button>
            </article>
          );
        })}
      </div>}

      {courseId && (
        <section className="bfs-course-purchase-callout mx-auto mt-10 max-w-3xl rounded-3xl border p-6 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="bfs-eyebrow">
              Prefer a one-time purchase?
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Buy just this course
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Pay once for this course, Udemy-style. No subscription required.
            </p>
          </div>

          <Link
            to={routes.course(courseId)}
            className="btn-primary mt-4 sm:mt-0"
          >
            View course price and buy
          </Link>
        </section>
      )}
    </div>
  );
}