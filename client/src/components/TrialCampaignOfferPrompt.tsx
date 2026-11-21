import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Clock3, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  createTrialClaimIdempotencyKey,
  getTrialOfferDismissalRemainingMs,
  isTrialOfferDismissed,
  rememberTrialOfferDismissal,
} from "@/lib/trialOffer";

type TrialPlan = { id: string; name: string; description?: string; features?: string[]; limits?: Record<string, number> };
type LearnerOffer = {
  campaignId: string;
  title: string;
  description: string;
  startsAt?: string;
  endsAt?: string | null;
  durationDays: number;
  trialPlan: TrialPlan;
  conversion?: { requiresSeparateConsent: true; plan: { id: string; name: string; price: number; currency: string; billingInterval: string } } | null;
};
type OfferResponse = { available?: boolean; offer?: LearnerOffer | null };
type ClaimResponse = { claim?: { status?: string; trialEndsAt?: string | null } };
type ConsentStatus = { requiresLegalAcceptance?: boolean; requiresProfileCompletion?: boolean };

function hasCookieChoice(): boolean {
  try {
    const raw = localStorage.getItem("bfs-cookie-consent-v1");
    if (!raw) return false;
    const choice = JSON.parse(raw) as { version?: unknown; preferences?: unknown };
    return choice.version === "cookie-choice-v1" && Boolean(choice.preferences);
  } catch { return false; }
}
function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;
}
function formatMoney(amount: number, currency: string): string {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
  catch { return currency + " " + amount.toFixed(2); }
}

export default function TrialCampaignOfferPrompt() {
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();
  const userId = session?.user.id || "";
  const isLearner = session?.user.role === "user";
  const excludedRoute = [
    "/login", "/register", "/verify-email", "/verify-login", "/forgot-password",
    "/accept-admin-invitation",
  ].includes(location.pathname) || location.pathname.startsWith("/admin") || location.pathname.startsWith("/legal");

  const [offer, setOffer] = useState<LearnerOffer | null>(null);
  const [visible, setVisible] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimedEndsAt, setClaimedEndsAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const claimedForUser = useRef<string | null>(null);
  const idempotency = useRef<{ campaignId: string; key: string } | null>(null);

  const closePrompt = useCallback(() => {
    if (claiming) return;
    if (!claimed && userId && offer?.campaignId) rememberTrialOfferDismissal(userId, offer.campaignId);
    setVisible(false);
    setError("");
  }, [claiming, claimed, userId, offer]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePrompt();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [visible, closePrompt]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId || !isLearner || excludedRoute || claimedForUser.current === userId) {
      setVisible(false);
      return;
    }
    let active = true;
    let displayTimer: number | undefined;
    let retryTimer: number | undefined;

    const checkOffer = async (attempt = 0) => {
      if (!active) return;
      if (displayTimer !== undefined) window.clearTimeout(displayTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      displayTimer = undefined;
      retryTimer = undefined;
      if (!hasCookieChoice()) { setVisible(false); return; }

      try {
        const [consentData, offerData] = await Promise.all([
          apiFetch<{ status?: ConsentStatus }>("/api/consent/status"),
          apiFetch<OfferResponse>("/api/trials/offer", { cache: "no-store" }),
        ]);
        if (!active) return;
        const consent = consentData.status;
        if (!consent || consent.requiresLegalAcceptance === true || consent.requiresProfileCompletion === true) {
          setVisible(false);
          return;
        }
        const nextOffer = offerData.offer;
        if (offerData.available !== true || !nextOffer?.campaignId || !nextOffer.trialPlan?.id) {
          setOffer(null);
          setVisible(false);
          return;
        }
        if (isTrialOfferDismissed(userId, nextOffer.campaignId)) {
          setVisible(false);
          const remaining = getTrialOfferDismissalRemainingMs(userId, nextOffer.campaignId);
          if (remaining > 0) retryTimer = window.setTimeout(() => void checkOffer(), remaining + 25);
          return;
        }

        idempotency.current = null;
        setClaimed(false);
        setClaimedEndsAt(null);
        setError("");
        setOffer(nextOffer);

        const revealWhenAvailable = (retries: number) => {
          if (!active) return;
          const anotherModalIsOpen = Array.from(
            document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
          ).some((dialog) => dialog.id !== "trial-campaign-offer-dialog");
          if (!anotherModalIsOpen || retries >= 8) { setVisible(true); return; }
          retryTimer = window.setTimeout(() => revealWhenAvailable(retries + 1), 1200);
        };
        displayTimer = window.setTimeout(() => revealWhenAvailable(attempt), 1000);
      } catch {
        if (active) setVisible(false);
      }
    };

    const recheck = () => void checkOffer();
    void checkOffer();
    window.addEventListener("bfs:cookie-consent-updated", recheck);
    window.addEventListener("bfs:account-consent-settled", recheck);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      active = false;
      if (displayTimer !== undefined) window.clearTimeout(displayTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener("bfs:cookie-consent-updated", recheck);
      window.removeEventListener("bfs:account-consent-settled", recheck);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [authLoading, userId, isLearner, excludedRoute]);

  async function claimTrial() {
    if (!offer || !userId || claiming || claimed) return;
    setClaiming(true);
    setError("");
    if (!idempotency.current || idempotency.current.campaignId !== offer.campaignId) {
      idempotency.current = { campaignId: offer.campaignId, key: createTrialClaimIdempotencyKey() };
    }
    try {
      const result = await apiFetch<ClaimResponse>(
        "/api/trials/campaigns/" + encodeURIComponent(offer.campaignId) + "/claim",
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotency.current.key },
          body: JSON.stringify({}),
        }
      );
      if (!result.claim || result.claim.status !== "active") {
        throw new Error("The trial activation could not be confirmed. Refresh your account before trying again.");
      }
      claimedForUser.current = userId;
      setClaimedEndsAt(result.claim.trialEndsAt || null);
      setClaimed(true);
      window.dispatchEvent(new Event("bfs:entitlements-updated"));
      window.dispatchEvent(new CustomEvent("bfs:trial-claimed", {
        detail: { campaignId: offer.campaignId, trialEndsAt: result.claim.trialEndsAt || null },
      }));
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "We couldn't activate your trial. Please try again.");
    } finally { setClaiming(false); }
  }

  if (!visible || !offer) return null;
  const trialEndLabel = formatDate(claimedEndsAt);
  const offerEndLabel = formatDate(offer.endsAt);

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <section
        id="trial-campaign-offer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-campaign-offer-title"
        aria-describedby="trial-campaign-offer-description"
        className="relative my-auto max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-violet-100 bg-white text-slate-900 shadow-2xl"
      >
        <button
          type="button"
          aria-label={claimed ? "Close trial confirmation" : "Close trial offer"}
          disabled={claiming}
          onClick={closePrompt}
          className="absolute right-4 top-4 z-10 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        ><X size={17} aria-hidden="true" /></button>

        {claimed ? (
          <div className="px-6 py-8 text-center sm:px-9 sm:py-10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 size={34} aria-hidden="true" /></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-emerald-700">Trial activated</p>
            <h2 id="trial-campaign-offer-title" className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Your trial is active</h2>
            <p id="trial-campaign-offer-description" className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              {offer.trialPlan.name} is now available on your account for {offer.durationDays} days.
              {trialEndLabel ? " Your trial ends " + trialEndLabel + "." : " You can review its dates in Billing."}
            </p>
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-left">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-900"><ShieldCheck size={17} aria-hidden="true" /> No automatic payment</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">No payment method or recurring authorization was created. A future paid subscription requires your separate consent.</p>
            </div>
            <button type="button" autoFocus onClick={closePrompt} className="btn-primary mt-6 w-full justify-center">Continue learning</button>
          </div>
        ) : (
          <>
            <header className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-6 py-7 pr-14 sm:px-9 sm:py-8">
              <div className="pointer-events-none absolute -right-12 -top-24 h-60 w-60 rounded-full bg-violet-300/30 blur-3xl" />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-violet-800"><Sparkles size={14} aria-hidden="true" /> A learner offer</span>
                <h2 id="trial-campaign-offer-title" className="mt-4 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{offer.title}</h2>
                <p id="trial-campaign-offer-description" className="mt-2 text-sm leading-6 text-slate-600">{offer.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-violet-800">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5"><Clock3 size={14} aria-hidden="true" /> {offer.durationDays} days</span>
                  {offerEndLabel && <span className="rounded-full border border-violet-200 bg-white/80 px-3 py-1.5">Offer ends {offerEndLabel}</span>}
                </div>
              </div>
            </header>
            <div className="space-y-4 px-6 py-5 sm:px-9">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Included during your trial</p>
                <h3 className="mt-2 text-lg font-extrabold text-slate-950">{offer.trialPlan.name}</h3>
                {offer.trialPlan.description && <p className="mt-1 text-sm leading-5 text-slate-600">{offer.trialPlan.description}</p>}
                {offer.trialPlan.features && offer.trialPlan.features.length > 0 && (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {offer.trialPlan.features.slice(0, 6).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /><span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {offer.conversion?.plan && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Optional after your trial</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {offer.conversion.plan.name} · {formatMoney(offer.conversion.plan.price, offer.conversion.plan.currency)}
                    <span className="font-medium text-slate-500"> / {offer.conversion.plan.billingInterval}</span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">This is informational only. Choosing it later requires separate consent and payment-provider authorization.</p>
                </section>
              )}
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <ShieldCheck size={19} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-emerald-900">No payment method required</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">Claiming this trial does not create a payment order or authorize recurring payments. You will not be charged automatically.</p>
                </div>
              </div>
              {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800">{error}</p>}
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-9">
              <button type="button" onClick={closePrompt} disabled={claiming} className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200/70 disabled:opacity-50">Not now</button>
              <button type="button" autoFocus onClick={() => void claimTrial()} disabled={claiming} className="btn-primary min-h-11 justify-center disabled:cursor-not-allowed disabled:opacity-60">
                {claiming ? <><Loader2 size={17} className="animate-spin" /> Activating trial…</> : "Claim free trial"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
