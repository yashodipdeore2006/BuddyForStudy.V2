import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

export default function Billing() {
  const [payments, setPayments] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundMessage, setRefundMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch("/api/billing/payments"), apiFetch("/api/billing/me")])
      .then(([paymentsData, subscriptionData]) => {
        setPayments(paymentsData.payments || []);
        setSubscription(subscriptionData.subscription || null);
      })
      .catch((error) => setRefundMessage(error instanceof Error ? error.message : "Unable to load billing"))
      .finally(() => setLoading(false));
  }, []);

  async function submitRefund(paymentId: string) {
    try {
      await apiFetch("/api/billing/refunds", {
        method: "POST",
        body: JSON.stringify({ paymentId, reason: refundReason }),
      });
      setRefundMessage("Refund request submitted.");
      setRefundId(null);
      setRefundReason("");
    } catch (error) {
      setRefundMessage(error instanceof Error ? error.message : "Unable to submit refund request");
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title="Billing & Payment History" subtitle="Review your subscription, payment history, and refund requests." />

      {refundMessage && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{refundMessage}</div>
      )}

      <div className="card mt-6 p-6">
        <h2 className="font-semibold">Current Subscription</h2>
        {subscription ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{subscription.plan?.name || "Subscription"}</p>
              <p className="text-sm text-slate-500">
                {subscription.status} · {subscription.plan?.billingInterval || "recurring"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge bg-green-50 text-green-700">{subscription.status}</span>
              {["trialing", "active", "past_due"].includes(subscription.status) && !subscription.cancelAtPeriodEnd && (
                <button
                  className="text-xs font-semibold text-red-600 disabled:opacity-50"
                  disabled={cancelling}
                  onClick={async () => {
                    if (!window.confirm("Cancel auto-renewal for this subscription? Your access will remain active through the current billing period.")) return;
                    setCancelling(true);
                    try {
                      const data = await apiFetch("/api/billing/subscription/cancel", { method: "POST" });
                      setSubscription(data.subscription || subscription);
                      setRefundMessage("Auto-renewal cancelled. Your subscription remains active until the current period ends.");
                    } catch (error) {
                      setRefundMessage(error instanceof Error ? error.message : "Unable to cancel subscription");
                    } finally {
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling ? "Cancelling..." : "Cancel auto-renewal"}
                </button>
              )}
              {subscription.cancelAtPeriodEnd && (
                <span className="text-xs font-medium text-amber-700">Ends at period end</span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No active subscription.</p>
        )}
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-100 p-6"><h2 className="font-semibold">Payments</h2></div>
        {payments.length ? (
          <div className="divide-y divide-slate-100">
            {payments.map((payment) => (
              <div key={payment._id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-medium">{payment.course?.title || payment.plan?.name || "Payment"}</p>
                  <p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{payment.currency} {payment.amount}</p>
                  <p className="text-xs text-slate-500">{payment.status}</p>
                  {["paid", "partially_refunded"].includes(payment.status) && (
                    <button
                      className="mt-2 text-xs font-semibold text-red-600"
                      onClick={() => {
                        setRefundId(payment._id);
                        setRefundReason("");
                        setRefundMessage("");
                      }}
                    >
                      Request refund
                    </button>
                  )}
                </div>

                {refundId === payment._id && (
                  <div className="w-full rounded-lg bg-slate-50 p-3">
                    <textarea
                      className="w-full rounded border p-2 text-sm"
                      placeholder="Reason (optional)"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                    <button className="btn-primary mt-2" onClick={() => submitRefund(payment._id)}>
                      Submit refund request
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-slate-500">No payments found.</p>
        )}
      </div>
    </div>
  );
}
