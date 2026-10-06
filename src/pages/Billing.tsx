import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useState as useLocalState } from "react";

export default function Billing() {
  const [payments, setPayments] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refundId, setRefundId] = useLocalState<string | null>(null);
  const [refundReason, setRefundReason] = useLocalState("");
  const [refundMessage, setRefundMessage] = useLocalState("");

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
    <div className="card mt-6 overflow-hidden"><div className="border-b border-slate-100 p-6"><h2 className="font-semibold">Payments</h2></div>{payments.length ? <div className="divide-y divide-slate-100">{payments.map((payment)=><div key={payment._id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-medium">{payment.course?.title || payment.plan?.name || "Payment"}</p><p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString()}</p></div><div className="text-right"><p className="font-semibold">{payment.currency} {payment.amount}</p><p className="text-xs text-slate-500">{payment.status}</p>{["paid","partially_refunded"].includes(payment.status) && <button className="mt-2 text-xs font-semibold text-red-600" onClick={()=>{setRefundId(payment._id);setRefundReason("");setRefundMessage("");}}>Request refund</button>}</div>{refundId===payment._id && <div className="w-full rounded-lg bg-slate-50 p-3"><textarea className="w-full rounded border p-2 text-sm" placeholder="Reason (optional)" value={refundReason} onChange={e=>setRefundReason(e.target.value)} /><button className="btn-primary mt-2" onClick={async()=>{try{await apiFetch("/api/billing/refunds",{method:"POST",body:JSON.stringify({paymentId:payment._id,reason:refundReason})});setRefundMessage("Refund request submitted.");setRefundId(null)}catch(e){setRefundMessage(e instanceof Error?e.message:"Unable to submit refund request")}}}>Submit refund request</button>{refundMessage&&<p className="mt-2 text-xs text-slate-600">{refundMessage}</p>}</div>}</div></div>)}</div> : <p className="p-6 text-sm text-slate-500">No payments found.</p>}</div>
  </div>;
}
