import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function Billing() {
  const [payments, setPayments] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetch("/api/billing/payments"), apiFetch("/api/billing/me")])
      .then(([paymentsData, subscriptionData]) => {
        setPayments(paymentsData.payments || []);
        setSubscription(subscriptionData.subscription || null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>;

  return <div className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-3xl font-bold">Billing & Payment History</h1>
    <div className="card mt-6 p-6"><h2 className="font-semibold">Current Subscription</h2>{subscription ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{subscription.plan?.name}</p><p className="text-sm text-slate-500">{subscription.status} · {subscription.plan?.billingInterval}</p></div><span className="badge bg-green-50 text-green-700">{subscription.status}</span></div> : <p className="mt-3 text-sm text-slate-500">No active subscription.</p>}</div>
    <div className="card mt-6 overflow-hidden"><div className="border-b border-slate-100 p-6"><h2 className="font-semibold">Payments</h2></div>{payments.length ? <div className="divide-y divide-slate-100">{payments.map((payment)=><div key={payment._id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-medium">{payment.course?.title || payment.plan?.name || "Payment"}</p><p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString()}</p></div><div className="text-right"><p className="font-semibold">{payment.currency} {payment.amount}</p><p className="text-xs text-slate-500">{payment.status}</p></div></div>)}</div> : <p className="p-6 text-sm text-slate-500">No payments found.</p>}</div>
  </div>;
}
