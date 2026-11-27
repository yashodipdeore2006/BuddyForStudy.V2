import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import ErrorState from "@/components/ErrorState";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, CreditCard, MessageSquareWarning, ReceiptText, ShieldCheck, XCircle } from "lucide-react";

type RelatedRefund = {
  _id: string;
  amount: number;
  status: string;
  reason?: string;
  createdAt: string;
  processedAt?: string | null;
  adminNote?: string;
};

type RelatedIssue = {
  _id: string;
  category: string;
  description: string;
  status: string;
  adminNote?: string;
  createdAt: string;
  resolvedAt?: string | null;
};

type Transaction = {
  _id: string;
  amount: number;
  currency?: string;
  status: string;
  provider?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  createdAt: string;
  updatedAt?: string;
  paidAt?: string | null;
  course?: { _id?: string; title?: string } | null;
  plan?: { _id?: string; name?: string; billingInterval?: string } | null;
};

type TransactionResponse = {
  payment: Transaction;
  refunds: RelatedRefund[];
  issues: RelatedIssue[];
};

function money(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
  } catch {
    return currency + " " + Number(amount || 0).toFixed(2);
  }
}

function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status: string) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "paid" || normalized === "processed" || normalized === "resolved") return "bg-emerald-50 text-emerald-700";
  if (normalized === "failed" || normalized === "rejected" || normalized === "closed") return "bg-rose-50 text-rose-700";
  if (normalized === "refunded" || normalized === "cancelled") return "bg-slate-100 text-slate-700";
  return "bg-amber-50 text-amber-800";
}

export default function TransactionDetails() {
  const { paymentId = "" } = useParams();
  const [data, setData] = useState<TransactionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTransaction = useCallback(async () => {
    if (!paymentId) {
      setError("A valid transaction reference is required.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<TransactionResponse>(
        `/api/billing/payments/${encodeURIComponent(paymentId)}`,
        { cache: "no-store" }
      );
      if (!response?.payment?._id) throw new Error("Transaction details were not returned.");
      setData(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this transaction.");
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => { void loadTransaction(); }, [loadTransaction]);

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8"><p role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading transaction details…</p></div>;
  }

  if (error || !data?.payment) {
    return <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Transaction details" subtitle="Review the payment record and any related support requests." />
      <div className="mt-6"><ErrorState title="Transaction unavailable" description={error || "This transaction could not be found."} onRetry={() => void loadTransaction()} action={<Link to={routes.billing()} className="btn-secondary">Back to purchases & payments</Link>} /></div>
    </div>;
  }

  const payment = data.payment;
  const title = payment.course?.title || payment.plan?.name || "BuddyForStudy purchase";
  const normalizedStatus = String(payment.status || "pending").toLowerCase();
  const StatusIcon = normalizedStatus === "paid" ? CheckCircle2 : ["failed", "cancelled"].includes(normalizedStatus) ? XCircle : Clock3;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Transaction details"
        subtitle="A secure, account-specific record of this purchase and its related payment support activity."
        action={<Link to={routes.billing()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Purchases & payments</Link>}
      />

      <section aria-labelledby="transaction-summary-heading" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-2xl bg-white p-3 text-slate-600 shadow-sm"><ReceiptText className="h-6 w-6" /></span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Purchase</p>
                <h2 id="transaction-summary-heading" className="mt-1 break-words text-xl font-extrabold text-slate-950">{title}</h2>
                <p className="mt-1 text-xs text-slate-500">Transaction ID · <span className="break-all font-mono">{payment._id}</span></p>
              </div>
            </div>
            <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold capitalize " + statusTone(normalizedStatus)}><StatusIcon className="h-3.5 w-3.5" />{normalizedStatus.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-6 text-sm font-semibold text-slate-500">Recorded amount</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{money(Number(payment.amount || 0), payment.currency || "INR")}</p>
        </div>

        <div className="grid gap-0 sm:grid-cols-2">
          <div className="border-b border-slate-100 p-5 sm:border-r sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Purchase information</p>
            <dl className="mt-4 space-y-4 text-sm">
              <div><dt className="text-slate-500">Item</dt><dd className="mt-1 font-semibold text-slate-900">{title}</dd></div>
              <div><dt className="text-slate-500">Purchase type</dt><dd className="mt-1 font-semibold capitalize text-slate-900">{payment.course ? "Course" : payment.plan ? "Subscription" : "Other"}</dd></div>
              {payment.plan?.billingInterval && <div><dt className="text-slate-500">Billing interval</dt><dd className="mt-1 font-semibold capitalize text-slate-900">{payment.plan.billingInterval}</dd></div>}
            </dl>
            {payment.course?._id && <Link to={routes.course(payment.course._id)} className="mt-4 inline-flex text-sm font-bold text-violet-700 hover:underline">View course</Link>}
            {payment.plan && <Link to={routes.pricing()} className="mt-4 inline-flex text-sm font-bold text-violet-700 hover:underline">View plans</Link>}
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment information</p>
            <dl className="mt-4 space-y-4 text-sm">
              <div><dt className="text-slate-500">Payment provider</dt><dd className="mt-1 font-semibold capitalize text-slate-900">{payment.provider || "—"}</dd></div>
              <div><dt className="text-slate-500">Provider payment reference</dt><dd className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">{payment.providerPaymentId || "Not available"}</dd></div>
              <div><dt className="text-slate-500">Provider order reference</dt><dd className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">{payment.providerOrderId || "Not available"}</dd></div>
            </dl>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-3 sm:p-6">
          <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs text-slate-500">Created</p><p className="mt-1 text-sm font-semibold text-slate-900">{date(payment.createdAt)}</p></div></div>
          <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs text-slate-500">Paid</p><p className="mt-1 text-sm font-semibold text-slate-900">{date(payment.paidAt)}</p></div></div>
          <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs text-slate-500">Last record update</p><p className="mt-1 text-sm font-semibold text-slate-900">{date(payment.updatedAt)}</p></div></div>
        </div>
      </section>

      <section aria-labelledby="refund-history-heading" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-slate-400" /><div><h2 id="refund-history-heading" className="font-extrabold text-slate-950">Refund history</h2><p className="mt-1 text-sm text-slate-500">Refund requests associated with this transaction.</p></div></div>
        {data.refunds.length ? <div className="mt-4 divide-y divide-slate-100">{data.refunds.map((refund) => <article key={refund._id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-slate-900">{money(Number(refund.amount || 0), payment.currency || "INR")}</p><p className="mt-1 text-xs text-slate-500">Requested {date(refund.createdAt)}{refund.processedAt ? " · Processed " + date(refund.processedAt) : ""}</p>{refund.reason && <p className="mt-2 text-sm text-slate-600">{refund.reason}</p>}{refund.adminNote && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Support update: {refund.adminNote}</p>}</div><span className={"inline-flex h-fit rounded-full px-3 py-1 text-xs font-bold capitalize " + statusTone(refund.status)}>{refund.status.replace(/_/g, " ")}</span></article>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No refund requests are associated with this transaction.</p>}
      </section>

      <section aria-labelledby="payment-support-heading" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><MessageSquareWarning className="mt-0.5 h-5 w-5 text-slate-400" /><div><h2 id="payment-support-heading" className="font-extrabold text-slate-950">Payment support</h2><p className="mt-1 text-sm text-slate-500">Support reports and their latest updates for this transaction.</p></div></div>
        {data.issues.length ? <div className="mt-4 divide-y divide-slate-100">{data.issues.map((issue) => <article key={issue._id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold capitalize text-slate-900">{issue.category.replace(/_/g, " ")}</p><span className={"rounded-full px-3 py-1 text-xs font-bold capitalize " + statusTone(issue.status)}>{issue.status.replace(/_/g, " ")}</span></div><p className="mt-1 text-xs text-slate-500">Reported {date(issue.createdAt)}{issue.resolvedAt ? " · Resolved " + date(issue.resolvedAt) : ""}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{issue.description}</p>{issue.adminNote && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Support update: {issue.adminNote}</p>}</article>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No support reports are associated with this transaction.</p>}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="flex items-center gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0" />Only the signed-in account that owns this transaction can view these details.</p>
        <Link to={routes.billing()} className="inline-flex items-center gap-2 text-sm font-bold text-violet-700 hover:underline"><ArrowLeft className="h-4 w-4" />All purchases & payments</Link>
      </div>
    </div>
  );
}
