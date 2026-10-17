import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
};

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
        theme: { color: "#2563eb" },
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

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {plans.map((plan, index) => (
          <div
            key={plan._id}
            className={`flex h-full flex-col rounded-[32px] border bg-white p-7 ${index === 0
              ? "border-blue-500 ring-2 ring-blue-100 shadow-lg"
              : "border-slate-200"
              }`}
          >
            {index === 0 && (
              <span className="mb-3 self-start rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                Recommended · Highest access
              </span>
            )}

            <h2 className="text-xl font-medium text-slate-950">
              {plan.name}
            </h2>

            <p className="mt-2 text-3xl font-medium tracking-tight text-slate-950">
              ₹{plan.price}
              <span className="text-sm font-normal text-slate-500">
                /{plan.billingInterval}
              </span>
            </p>

            <p className="mt-3 text-sm text-slate-500">
              {plan.description}
            </p>

            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              {(plan.features || []).map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>

            <button
              type="button"
              disabled={loading === plan._id || Number(plan.price) === 0}
              onClick={() => void subscribe(plan._id)}
              className={`mt-auto mt-6 w-full ${Number(plan.price) === 0 ? "btn-secondary" : "btn-buy"
                }`}
            >
              {Number(plan.price) === 0
                ? "Included"
                : loading === plan._id
                  ? "Opening Checkout..."
                  : "Subscribe"}
            </button>
          </div>
        ))}
      </div>

      {courseId && (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
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
            className="mt-4 inline-flex rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 sm:mt-0"
          >
            View course price and buy
          </Link>
        </section>
      )}
    </div>
  );
}