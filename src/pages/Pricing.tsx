import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Crown, Loader2, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { loadRazorpay } from "@/lib/razorpay";
import { useAuth } from "@/context/AuthContext";

type Plan = {
  _id: string;
  name: string;
  price: number;
  billingInterval: string;
  description?: string;
  features?: string[];
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

type PricingMessage = {
  type: "success" | "info" | "error";
  text: string;
};

export default function Pricing() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("courseId");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<PricingMessage | null>(null);

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
      });
  }, []);

  async function subscribe(planId: string) {
    const plan = plans.find((item) => item._id === planId);

    if (!plan || Number(plan.price) === 0) return;

    if (!session) {
      window.location.href = "/login";
      return;
    }

    setLoading(planId);
    setMessage(null);

    try {
      const data = await apiFetch("/api/payments/subscription/order", {
        method: "POST",
        body: JSON.stringify({ planId }),
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

      {plans.length === 0 && !message && (
        <div className="bfs-plan-empty mt-10 rounded-3xl border p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-violet-500" />
          <h2 className="mt-3 text-xl font-bold">Plans are on their way</h2>
          <p className="mt-2 text-sm text-slate-500">We couldn't find any available subscription plans right now.</p>
        </div>
      )}

      <div className="mt-10 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
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
              <ul className="bfs-plan-features flex-1 space-y-3 text-sm">
                {(plan.features || []).map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <span className="bfs-plan-check mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"><Check className="h-3.5 w-3.5" /></span>
                    <span>{feature}</span>
                  </li>
                ))}
                {!(plan.features || []).length && <li className="text-slate-500">Core learning features included.</li>}
              </ul>
              <button
                type="button"
                disabled={loading === plan._id || Number(plan.price) === 0}
                onClick={() => void subscribe(plan._id)}
                className={`mt-7 w-full ${Number(plan.price) === 0 ? "btn-secondary" : "btn-buy"}`}
              >
                {loading === plan._id ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening checkout…</> : Number(plan.price) === 0 ? "Current free access" : <>Choose plan <ArrowRight className="h-4 w-4" /></>}
              </button>
            </article>
          );
        })}
      </div>

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
            to={`/courses/${encodeURIComponent(courseId)}`}
            className="btn-primary mt-4 sm:mt-0"
          >
            View course price and buy
          </Link>
        </section>
      )}
    </div>
  );
}