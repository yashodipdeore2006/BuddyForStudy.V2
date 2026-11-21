import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Users, ShieldCheck, UserRound, SlidersHorizontal, CheckCircle2, Sparkles, Rocket, PauseCircle, Ban } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminBadge } from "@/components/admin/AdminUI";

type Plan = { _id: string; name: string; price: number; currency: string; billingInterval: string; isActive: boolean };
type AudienceUser = { id: string; name: string; email: string; createdAt?: string; authProvider?: string; emailVerified?: boolean; reason?: string };
type Grant = { _id: string; user?: { name?: string; email?: string }; plan?: { name?: string }; conversionPlan?: { name?: string; price?: number; currency?: string; billingInterval?: string }; campaignName: string; status: string; startsAt: string; endsAt: string; conversionConsentStatus: string; reason: string };

type CampaignEligibility = {
  requireActiveAccount: boolean;
  requireVerifiedEmail: boolean;
  requireNoActiveSubscription: boolean;
  requireNoPreviousTrial: boolean;
};
type CampaignPreset = {
  id: string;
  label: string;
  description: string;
  trialDays: number;
  maxClaims: number;
  eligibility: CampaignEligibility;
  conversionMode: "none" | "consent_required";
  conversionPlanId: string | null;
};
type TrialClaim = { _id: string; status: string; claimedAt: string; activatedAt?: string | null; campaign?: { internalName?: string; status?: string } | null; user?: { name?: string; email?: string } | null; trialPlan?: { name?: string } | null; trialGrant?: { status?: string } | null };
type TrialCampaign = {
  _id: string;
  internalName: string;
  offerTitle: string;
  trialPlan?: { name?: string } | null;
  trialDays: number;
  status: "draft" | "published" | "paused" | "ended";
  startsAt: string;
  endsAt?: string | null;
  maxClaims: number;
  claimedCount: number;
};
type CampaignForm = {
  presetId: string;
  internalName: string;
  internalReason: string;
  offerTitle: string;
  offerDescription: string;
  trialPlanId: string;
  trialDays: number;
  maxClaims: number;
  startsAt: string;
  endsAt: string;
  eligibility: CampaignEligibility;
  conversionMode: "none" | "consent_required";
  conversionPlanId: string;
};
const initialCampaignForm: CampaignForm = {
  presetId: "7_days",
  internalName: "Quick-trial welcome campaign",
  internalReason: "Initial configuration of a reusable learner trial offer.",
  offerTitle: "Explore premium learning",
  offerDescription: "Give eligible learners time to explore premium learning resources and build a study habit. Claiming this trial does not initiate a payment or automatic renewal.",
  trialPlanId: "",
  trialDays: 7,
  maxClaims: 100,
  startsAt: "",
  endsAt: "",
  eligibility: {
    requireActiveAccount: true,
    requireVerifiedEmail: true,
    requireNoActiveSubscription: true,
    requireNoPreviousTrial: true
  },
  conversionMode: "none",
  conversionPlanId: ""
};
const initialFilters = { q: "", emailExact: "", status: "active", role: "user", createdAfter: "", createdBefore: "", registeredAfter: "", registeredBefore: "", authProvider: "any", emailVerified: "yes", planId: "", expiresWithinDays: "", courseId: "", enrollmentStatus: "", progressMin: "", progressMax: "", inactiveDays: "", totalSpendMin: "", courseCountMin: "", planSegment: "", courseSegment: "", phoneVerified: "any", marketingConsent: "any", profileSetup: "any", city: "", learningGoal: "", priorTrial: "never", subscriptionStatus: "none" };
type Filters = typeof initialFilters;
const date = (value?: string) => value ? new Date(value).toLocaleString("en-IN") : "—";

export default function AdminTrialCampaigns() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [claims, setClaims] = useState<TrialClaim[]>([]);
  const [claimStatusFilter, setClaimStatusFilter] = useState("all");
  const [planId, setPlanId] = useState("");
  const [conversionPlanId, setConversionPlanId] = useState("");
  const [campaignName, setCampaignName] = useState("Personal trial grant");
  const [reason, setReason] = useState("");
  const [trialDays, setTrialDays] = useState(7);
  const [targetMode, setTargetMode] = useState<"single" | "group">("single");
  const [singleEmail, setSingleEmail] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState<{ eligibleCount: number; totalEligibleBeforeLimit: number; skippedCount: number; eligible: AudienceUser[]; skipped: AudienceUser[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [grantActionId, setGrantActionId] = useState("");

  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [campaigns, setCampaigns] = useState<TrialCampaign[]>([]);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(initialCampaignForm);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignActionId, setCampaignActionId] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");


  const refreshCampaigns = useCallback(async () => {
    const data = await adminFetch("/api/admin/trials/campaigns?limit=25");
    setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
  }, []);

  const loadCampaignWorkspace = useCallback(async () => {
    setCampaignLoading(true);
    setCampaignError("");
    try {
      const presetData = await adminFetch("/api/admin/trials/campaigns/presets");
      if (!Array.isArray(presetData.presets) || presetData.valuesEditable !== true) {
        throw new Error("The quick-trial preset catalogue is unavailable or read-only.");
      }
      setPresets(presetData.presets);
      await refreshCampaigns();
    } catch (e) {
      setCampaignError(e instanceof Error ? e.message : "Unable to load self-serve trial campaigns.");
    } finally {
      setCampaignLoading(false);
    }
  }, [refreshCampaigns]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCampaignWorkspace(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaignWorkspace]);

  function applyCampaignPreset(presetId: string) {
    const preset = presets.find(item => item.id === presetId);
    if (!preset) return;
    setCampaignForm(current => ({
      ...current,
      presetId: preset.id,
      trialDays: preset.trialDays,
      maxClaims: preset.maxClaims,
      eligibility: { ...preset.eligibility },
      conversionMode: preset.conversionMode,
      conversionPlanId: preset.conversionPlanId || ""
    }));
    setCampaignMessage("");
    setCampaignError("");
  }

  async function createSelfServeCampaign() {
    setCampaignError("");
    setCampaignMessage("");
    const form = campaignForm;
    if (form.internalName.trim().length < 3 || form.internalReason.trim().length < 10
      || form.offerTitle.trim().length < 3 || form.offerDescription.trim().length < 10) {
      setCampaignError("Complete the campaign name, internal reason, offer title and description.");
      return;
    }
    if (!form.trialPlanId) {
      setCampaignError("Select an active trial entitlement plan before saving the campaign.");
      return;
    }
    if (!Number.isInteger(form.trialDays) || form.trialDays < 1 || form.trialDays > 30
      || !Number.isInteger(form.maxClaims) || form.maxClaims < 1 || form.maxClaims > 1000000) {
      setCampaignError("Trial duration must be 1–30 whole days and maximum claims must be a whole number from 1 to 1,000,000.");
      return;
    }
    if (form.conversionMode === "consent_required" && (!form.conversionPlanId || form.conversionPlanId === form.trialPlanId)) {
      setCampaignError("Choose a different active recurring paid plan for the consent-required conversion offer.");
      return;
    }
    const startTime = form.startsAt ? new Date(form.startsAt).getTime() : Date.now();
    const endTime = form.endsAt ? new Date(form.endsAt).getTime() : null;
    if (!Number.isFinite(startTime) || (endTime !== null && (!Number.isFinite(endTime) || endTime <= startTime))) {
      setCampaignError("The campaign end date must be later than its start date.");
      return;
    }

    setCampaignSaving(true);
    try {
      const body = {
        internalName: form.internalName.trim(),
        internalReason: form.internalReason.trim(),
        offerTitle: form.offerTitle.trim(),
        offerDescription: form.offerDescription.trim(),
        trialPlanId: form.trialPlanId,
        trialDays: form.trialDays,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        maxClaims: form.maxClaims,
        eligibility: { ...form.eligibility },
        conversionMode: form.conversionMode,
        conversionPlanId: form.conversionMode === "consent_required" ? form.conversionPlanId : null
      };
      const result = await adminFetch("/api/admin/trials/campaigns", {
        method: "POST",
        body: JSON.stringify(body)
      });
      const createdName = result.campaign?.internalName || form.internalName;
      setCampaignMessage(createdName + " was saved as a draft. It is not live until you publish it.");
      await refreshCampaigns();
    } catch (e) {
      setCampaignError(e instanceof Error ? e.message : "Unable to create the trial campaign.");
    } finally {
      setCampaignSaving(false);
    }
  }

  async function runCampaignLifecycleAction(campaignId: string, action: "publish" | "pause" | "disable") {
    if (action === "disable" && !window.confirm("Disable this campaign? Existing learner claims and entitlements will remain unchanged.")) return;
    setCampaignError("");
    setCampaignMessage("");
    setCampaignActionId(campaignId);
    try {
      await adminFetch("/api/admin/trials/campaigns/" + encodeURIComponent(campaignId) + "/" + action, {
        method: "POST",
        body: JSON.stringify({})
      });
      const resultMessage = action === "publish"
        ? "Campaign published. Eligible learners can now discover it when the campaign is in its active window."
        : action === "pause"
          ? "Campaign paused. New offers are stopped while existing learner claims remain unchanged."
          : "Campaign disabled. Existing learner claims and entitlements remain unchanged.";
      setCampaignMessage(resultMessage);
      await refreshCampaigns();
    } catch (e) {
      setCampaignError(e instanceof Error ? e.message : "Unable to update the campaign lifecycle.");
    } finally {
      setCampaignActionId("");
    }
  }

  const campaignFormValid = Boolean(campaignForm.trialPlanId)
    && campaignForm.internalName.trim().length >= 3
    && campaignForm.internalReason.trim().length >= 10
    && campaignForm.offerTitle.trim().length >= 3
    && campaignForm.offerDescription.trim().length >= 10
    && Number.isInteger(campaignForm.trialDays) && campaignForm.trialDays >= 1 && campaignForm.trialDays <= 30
    && Number.isInteger(campaignForm.maxClaims) && campaignForm.maxClaims >= 1 && campaignForm.maxClaims <= 1000000
    && (campaignForm.conversionMode === "none" || (Boolean(campaignForm.conversionPlanId) && campaignForm.conversionPlanId !== campaignForm.trialPlanId))
    && (!campaignForm.endsAt || new Date(campaignForm.endsAt).getTime() > new Date(campaignForm.startsAt || Date.now()).getTime());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [planData, grantData, claimData] = await Promise.all([adminFetch("/api/admin/plans"), adminFetch("/api/admin/trials/grants?limit=50"), adminFetch("/api/admin/trials/claims?limit=50")]);
      const activePlans = (planData.plans || []).filter((p: Plan) => p.isActive);
      setPlans(activePlans);
      if (!planId && activePlans[0]) setPlanId(activePlans[0]._id);
      setGrants(grantData.grants || []);
      setClaims(claimData.claims || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load trial campaigns."); }
    finally { setLoading(false); }
  }, [planId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(current => ({ ...current, [key]: value }));
    setPreview(null); setConfirmGrant(false);
  }
  const payload = () => {
    const next: Record<string, unknown> = {};
    if (targetMode === "single") {
      next.emailExact = singleEmail.trim().toLowerCase();
      next.emailVerified = "any";
    } else {
      for (const [key, value] of Object.entries(filters)) {
        if (value === "" || (value === "any" && key !== "emailVerified") || key === "emailExact" || key === "q") continue;
        if (key === "emailVerified") next[key] = value;
        else if (["expiresWithinDays", "progressMin", "progressMax", "inactiveDays", "totalSpendMin", "courseCountMin"].includes(key)) next[key] = Number(value);
        else if (key === "createdAfter" || key === "createdBefore") next[key] = value ? new Date(value).toISOString() : "";
        else next[key] = value;
      }
      if (filters.q.trim()) next.q = filters.q.trim();
      next.priorTrial = filters.priorTrial;
      next.subscriptionStatus = filters.subscriptionStatus;
    }
    return { campaignName, reason, trialDays, planId, conversionPlanId, filters: next };
  };
  async function runPreview() {
    setError(""); setMessage(""); setConfirmGrant(false); setLoading(true);
    try { setPreview(await adminFetch("/api/admin/trials/preview", { method: "POST", body: JSON.stringify(payload()) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to preview audience."); }
    finally { setLoading(false); }
  }
  async function revokeGrant(grantId: string) {
    const selected = grants.find((grant) => grant._id === grantId);
    if (!selected || selected.status !== "trialing" || grantActionId) return;
    const revocationReason = window.prompt("Enter a reason for revoking this active trial (10–500 characters):");
    if (revocationReason === null) return;
    if (revocationReason.trim().length < 10 || revocationReason.trim().length > 500) {
      setError("Enter a revocation reason between 10 and 500 characters.");
      return;
    }
    if (!window.confirm("Revoke this trial now? The learner will lose trial entitlements and return to the configured free plan when available.")) return;

    setError("");
    setMessage("");
    setGrantActionId(grantId);
    try {
      await adminFetch("/api/admin/trials/grants/" + encodeURIComponent(grantId) + "/revoke", {
        method: "POST",
        body: JSON.stringify({ reason: revocationReason.trim() })
      });
      setMessage("Trial revoked. The learner's free-plan fallback was restored where appropriate; no payment was initiated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to revoke this trial.");
    } finally {
      setGrantActionId("");
    }
  }

  async function applyGrant() {
    if (!preview || !confirmGrant) return;
    setError(""); setMessage(""); setLoading(true);
    try {
      const result = await adminFetch("/api/admin/trials/grant", { method: "POST", body: JSON.stringify({ ...payload(), confirm: true, idempotencyKey: globalThis.crypto?.randomUUID?.() || "trial-grant-" + Date.now() }) });
      setMessage(`Trial grants processed: ${result.granted || 0} granted, ${result.skipped || 0} skipped. No autopay was initiated.`);
      setPreview(null); setConfirmGrant(false); setReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to grant trials."); }
    finally { setLoading(false); }
  }
  const valid = Boolean(planId) && campaignName.trim().length >= 3 && reason.trim().length >= 10 && trialDays >= 1 && trialDays <= 30 && (targetMode === "single" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(singleEmail.trim()) : true);
  const claimCounts = claims.reduce((counts, claim) => { counts[claim.status] = (counts[claim.status] || 0) + 1; return counts; }, {} as Record<string, number>);
  const activeGrantCount = grants.filter(grant => grant.status === "trialing").length;
  const historyGrantCount = grants.filter(grant => ["expired", "revoked", "converted"].includes(grant.status)).length;
  const filteredClaims = claimStatusFilter === "all" ? claims : claims.filter(claim => claim.status === claimStatusFilter);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
  const labelClass = "block text-xs font-semibold text-slate-600";
  const selectClass = inputClass;
  const selectField = (label: string, key: keyof Filters, options: Array<[string,string]>) => <label className={labelClass}>{label}<select className={selectClass} value={filters[key] as string} onChange={e => changeFilter(key, e.target.value as never)}>{options.map(([value,title]) => <option key={value} value={value}>{title}</option>)}</select></label>;

  return <div className="mx-auto max-w-6xl pb-12">
    <AdminPageHeader eyebrow="Learner access" title="Grant a free trial" description="Create reusable self-serve offers or issue a reviewed trial grant to a specific learner or group." actions={<button className="btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>} />
    <nav aria-label="Trial dashboard sections" className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      {([["overview","Overview"],["campaigns","Campaigns"],["claims","Claims"],["grants","Grants"],["history","History"]] as const).map(([id,label]) => <a key={id} href={"#trial-" + id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-800">{label}</a>)}
    </nav>
    <section id="trial-overview" className="mt-5 scroll-mt-24">
      <h2 className="mb-3 text-base font-bold text-slate-900">Trial operations overview</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Campaigns", campaigns.length], ["Published", campaigns.filter(c => c.status === "published").length],
          ["Recent claims", claims.length], ["Active grants", activeGrantCount], ["Trial history", historyGrantCount]
        ].map(([label,value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-950">{value}</p></div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{["reserved","active","failed","expired","revoked"].map(status => <span key={status} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{status}: {claimCounts[status] || 0}</span>)}</div>
    </section>
    {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}


    <section id="trial-campaigns" className="mt-6 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-700" /><h2 className="font-bold text-slate-900">Self-serve quick-trial campaigns</h2></div>
          <p className="mt-1 text-sm text-slate-500">Create a reusable learner offer from a 7, 14 or 30-day preset. Review and edit every value before saving.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadCampaignWorkspace()} disabled={campaignLoading || campaignSaving}>
          <RefreshCcw className={campaignLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh campaigns
        </button>
      </div>
      {campaignError && <div role="alert" className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:mx-6">{campaignError}</div>}
      {campaignMessage && <div role="status" className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 sm:mx-6">{campaignMessage}</div>}
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-bold text-slate-900">1. Choose a starting preset</h3><p className="text-xs text-slate-500">Preset values are editable and do not publish a campaign.</p></div>
          {campaignLoading && <span className="text-xs text-slate-500">Loading preset catalogue…</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {presets.map(preset => <button
            key={preset.id}
            type="button"
            onClick={() => applyCampaignPreset(preset.id)}
            aria-pressed={campaignForm.presetId === preset.id}
            className={"rounded-xl border p-4 text-left transition " + (campaignForm.presetId === preset.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300")}
          >
            <span className="block text-lg font-bold text-slate-900">{preset.label}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{preset.description}</span>
            <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-violet-700">{preset.maxClaims.toLocaleString("en-IN")} default claims</span>
          </button>)}
          {!campaignLoading && !presets.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-3">No quick-trial presets are available. Refresh or check the administrator trial permission.</p>}
        </div>
        <div className="mt-6"><h3 className="text-sm font-bold text-slate-900">2. Edit campaign settings</h3><p className="mt-1 text-xs text-slate-500">The selected preset only fills starting values. These settings are submitted to the server for validation.</p></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Internal campaign name
            <input className={inputClass} value={campaignForm.internalName} minLength={3} maxLength={120} onChange={e => setCampaignForm(current => ({ ...current, internalName: e.target.value }))} placeholder="e.g. November learner welcome" />
          </label>
          <label className={labelClass}>Trial entitlement plan
            <select className={inputClass} value={campaignForm.trialPlanId} onChange={e => setCampaignForm(current => ({ ...current, trialPlanId: e.target.value }))}>
              <option value="">Select an active plan…</option>
              {plans.map(plan => <option key={plan._id} value={plan._id}>{plan.name} · {plan.price === 0 ? "Free" : plan.currency + " " + plan.price + "/" + plan.billingInterval}</option>)}
            </select>
            <span className="mt-1 block font-normal text-slate-500">Only active plans are listed. The server revalidates the selected plan when saving and publishing.</span>
          </label>
          <label className={labelClass}>Learner-facing offer title
            <input className={inputClass} value={campaignForm.offerTitle} minLength={3} maxLength={120} onChange={e => setCampaignForm(current => ({ ...current, offerTitle: e.target.value }))} />
          </label>
          <label className={labelClass}>Trial duration (days)
            <input className={inputClass} type="number" min={1} max={30} step={1} value={campaignForm.trialDays} onChange={e => setCampaignForm(current => ({ ...current, trialDays: Number(e.target.value) }))} />
          </label>
          <label className={labelClass}>Maximum total claims
            <input className={inputClass} type="number" min={1} max={1000000} step={1} value={campaignForm.maxClaims} onChange={e => setCampaignForm(current => ({ ...current, maxClaims: Number(e.target.value) }))} />
            <span className="mt-1 block font-normal text-slate-500">The server enforces this capacity at claim time.</span>
          </label>
          <label className={labelClass}>Internal reason
            <input className={inputClass} value={campaignForm.internalReason} minLength={10} maxLength={500} onChange={e => setCampaignForm(current => ({ ...current, internalReason: e.target.value }))} />
          </label>
          <label className={labelClass + " sm:col-span-2"}>Learner-facing offer description
            <textarea className={inputClass} rows={3} minLength={10} maxLength={1000} value={campaignForm.offerDescription} onChange={e => setCampaignForm(current => ({ ...current, offerDescription: e.target.value }))} />
          </label>
          <label className={labelClass}>Campaign starts at (optional)
            <input className={inputClass} type="datetime-local" value={campaignForm.startsAt} onChange={e => setCampaignForm(current => ({ ...current, startsAt: e.target.value }))} />
            <span className="mt-1 block font-normal text-slate-500">Leave blank to start from the time the campaign is created.</span>
          </label>
          <label className={labelClass}>Campaign ends at (optional)
            <input className={inputClass} type="datetime-local" value={campaignForm.endsAt} onChange={e => setCampaignForm(current => ({ ...current, endsAt: e.target.value }))} />
            <span className="mt-1 block font-normal text-slate-500">Leave blank for no scheduled end date.</span>
          </label>
          <label className={labelClass}>Conversion offer
            <select className={inputClass} value={campaignForm.conversionMode} onChange={e => setCampaignForm(current => ({ ...current, conversionMode: e.target.value as CampaignForm["conversionMode"], conversionPlanId: e.target.value === "none" ? "" : current.conversionPlanId }))}>
              <option value="none">No conversion offer</option>
              <option value="consent_required">Offer a paid plan after explicit consent</option>
            </select>
            <span className="mt-1 block font-normal text-slate-500">A conversion offer never creates an order or authorizes autopay by itself.</span>
          </label>
          {campaignForm.conversionMode === "consent_required" && <label className={labelClass}>Recurring paid conversion plan
            <select className={inputClass} value={campaignForm.conversionPlanId} onChange={e => setCampaignForm(current => ({ ...current, conversionPlanId: e.target.value }))}>
              <option value="">Select a recurring paid plan…</option>
              {plans.filter(plan => plan.price > 0 && ["monthly", "quarterly", "yearly"].includes(plan.billingInterval)).map(plan => <option key={plan._id} value={plan._id}>{plan.name} · {plan.currency} {plan.price}/{plan.billingInterval}</option>)}
            </select>
          </label>}
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">3. Learner eligibility rules</h3>
          <p className="mt-1 text-xs text-slate-500">The server will re-check eligibility when a learner claims the campaign.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm text-slate-700"><input className="mt-1 h-4 w-4 accent-violet-600" type="checkbox" checked={campaignForm.eligibility.requireActiveAccount} onChange={e => setCampaignForm(current => ({ ...current, eligibility: { ...current.eligibility, requireActiveAccount: e.target.checked } }))} /><span>Require an active learner account</span></label>
            <label className="flex items-start gap-2 text-sm text-slate-700"><input className="mt-1 h-4 w-4 accent-violet-600" type="checkbox" checked={campaignForm.eligibility.requireVerifiedEmail} onChange={e => setCampaignForm(current => ({ ...current, eligibility: { ...current.eligibility, requireVerifiedEmail: e.target.checked } }))} /><span>Require a verified email address</span></label>
            <label className="flex items-start gap-2 text-sm text-slate-700"><input className="mt-1 h-4 w-4 accent-violet-600" type="checkbox" checked={campaignForm.eligibility.requireNoActiveSubscription} onChange={e => setCampaignForm(current => ({ ...current, eligibility: { ...current.eligibility, requireNoActiveSubscription: e.target.checked } }))} /><span>Require no active subscription</span></label>
            <label className="flex items-start gap-2 text-sm text-slate-700"><input className="mt-1 h-4 w-4 accent-violet-600" type="checkbox" checked={campaignForm.eligibility.requireNoPreviousTrial} onChange={e => setCampaignForm(current => ({ ...current, eligibility: { ...current.eligibility, requireNoPreviousTrial: e.target.checked } }))} /><span>Require no previous trial</span></label>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Saving creates a draft only. It does not expose the offer to learners or initiate a payment.</p>
          <button type="button" className="btn-primary justify-center" onClick={() => void createSelfServeCampaign()} disabled={!campaignFormValid || campaignSaving || campaignLoading || !presets.length}>
            <ShieldCheck className="h-4 w-4" />{campaignSaving ? "Saving draft…" : "Save campaign as draft"}
          </button>
        </div>
        <div className="mt-8 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">Existing self-serve campaigns</h3><p className="mt-1 text-xs text-slate-500">Publish, pause or disable a campaign separately from draft creation.</p></div><span className="text-xs text-slate-500">{campaigns.length} shown</span></div>
          {campaignLoading && <p className="mt-4 text-sm text-slate-500">Loading campaigns…</p>}
          {!campaignLoading && !campaigns.length && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No self-serve campaigns have been created yet.</p>}
          {!campaignLoading && campaigns.length > 0 && <div className="mt-4 space-y-3">
            {campaigns.map(campaign => <div key={campaign._id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{campaign.internalName}</p><span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (campaign.status === "published" ? "bg-emerald-50 text-emerald-700" : campaign.status === "ended" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700")}>{campaign.status}</span></div>
                <p className="mt-1 text-sm text-slate-600">{campaign.offerTitle} · {campaign.trialPlan?.name || "Trial plan"} · {campaign.trialDays} days</p>
                <p className="mt-1 text-xs text-slate-500">{campaign.claimedCount || 0} of {campaign.maxClaims} claims · Starts {date(campaign.startsAt)}{campaign.endsAt ? " · Ends " + date(campaign.endsAt) : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(campaign.status === "draft" || campaign.status === "paused") && <button type="button" className="btn-primary" onClick={() => void runCampaignLifecycleAction(campaign._id, "publish")} disabled={campaignActionId === campaign._id}><Rocket className="h-4 w-4" />Publish</button>}
                {campaign.status === "published" && <button type="button" className="btn-secondary" onClick={() => void runCampaignLifecycleAction(campaign._id, "pause")} disabled={campaignActionId === campaign._id}><PauseCircle className="h-4 w-4" />Pause</button>}
                {campaign.status !== "ended" && <button type="button" className="btn-secondary" onClick={() => void runCampaignLifecycleAction(campaign._id, "disable")} disabled={campaignActionId === campaign._id}><Ban className="h-4 w-4" />Disable</button>}
              </div>
            </div>)}
          </div>}
        </div>
      </div>
    </section>

    <section id="trial-claims" className="mt-7 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div><h2 className="font-bold text-slate-900">Campaign claims</h2><p className="mt-1 text-sm text-slate-500">Claim attempts and activation outcomes, separate from trial entitlements.</p></div>
        <label className="text-xs font-semibold text-slate-600">Status <select className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" value={claimStatusFilter} onChange={e=>setClaimStatusFilter(e.target.value)}><option value="all">All</option><option value="reserved">Reserved</option><option value="active">Active</option><option value="failed">Failed</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Learner</th><th className="p-3">Campaign</th><th className="p-3">Plan</th><th className="p-3">Claimed</th><th className="p-3">Status</th><th className="p-3">Grant</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{filteredClaims.map(claim=><tr key={claim._id}><td className="p-3"><p className="font-semibold">{claim.user?.name||"Unknown learner"}</p><p className="text-xs text-slate-500">{claim.user?.email||"—"}</p></td><td className="p-3">{claim.campaign?.internalName||"Campaign unavailable"}</td><td className="p-3">{claim.trialPlan?.name||"—"}</td><td className="p-3 text-xs">{date(claim.claimedAt)}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{claim.status}</span></td><td className="p-3 text-xs">{claim.trialGrant?.status||"—"}</td></tr>)}</tbody>
      </table>{!filteredClaims.length&&<p className="p-8 text-center text-sm text-slate-500">No campaign claims for this status.</p>}</div>
    </section>
    <section id="trial-grants" className="mt-7 scroll-mt-24">
      <div className="mb-3"><h2 className="text-base font-bold text-slate-900">Issue a trial grant</h2><p className="text-sm text-slate-500">Manual grants are independent from campaign claims.</p></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">1</span><div><p className="text-sm font-semibold text-slate-900">Choose learner(s)</p><p className="text-xs text-slate-500">One account or a group</p></div></div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">2</span><div><p className="text-sm font-semibold text-slate-900">Set trial access</p><p className="text-xs text-slate-500">Plan and number of days</p></div></div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">3</span><div><p className="text-sm font-semibold text-slate-900">Review and grant</p><p className="text-xs text-slate-500">Confirm before applying</p></div></div>
    </div>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-slate-900">1. Who should receive the trial?</h2><p className="mt-1 text-sm text-slate-500">For one learner, use their exact account email. Choose a group to target many accounts with filters.</p></div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <button type="button" onClick={() => {setTargetMode("single");setPreview(null);setConfirmGrant(false);}} className={`rounded-xl border p-4 text-left transition ${targetMode==="single" ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300"}`}><span className="flex items-center gap-3"><span className="rounded-lg bg-white p-2 text-violet-700"><UserRound className="h-5 w-5"/></span><span><span className="block text-sm font-semibold text-slate-900">One specific learner</span><span className="mt-1 block text-xs text-slate-500">Grant access to one registered account</span></span></span></button>
        <button type="button" onClick={() => {setTargetMode("group");setPreview(null);setConfirmGrant(false);}} className={`rounded-xl border p-4 text-left transition ${targetMode==="group" ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300"}`}><span className="flex items-center gap-3"><span className="rounded-lg bg-white p-2 text-violet-700"><Users className="h-5 w-5"/></span><span><span className="block text-sm font-semibold text-slate-900">A filtered group</span><span className="mt-1 block text-xs text-slate-500">Grant to all matching eligible learners</span></span></span></button>
      </div>
      {targetMode === "single" ? <div className="px-5 pb-6 sm:px-6"><label className={labelClass}>Learner’s registered email address<input className={inputClass} type="email" autoComplete="email" maxLength={254} value={singleEmail} onChange={e=>{setSingleEmail(e.target.value);setPreview(null);setConfirmGrant(false);}} placeholder="learner@example.com" /><span className="mt-1 block font-normal text-slate-500">Exact match only. The preview will show if the account is eligible. Admin and disabled accounts cannot receive trials.</span></label></div> : <div className="px-5 pb-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>Name or email contains<input className={inputClass} maxLength={100} value={filters.q} onChange={e=>changeFilter("q",e.target.value)} placeholder="Search by name or email"/></label>
          {selectField("Authentication provider","authProvider",[["any","Any provider"],["local","Email/password"],["google","Google"],["local_google","Linked email + Google"]])}
          {selectField("Email verification","emailVerified",[["yes","Verified only"],["no","Unverified only"],["any","Any status"]])}
          {selectField("Previous trial","priorTrial",[["never","Never received a trial"],["any","Allow previous recipients"]])}
          {selectField("Subscription eligibility","subscriptionStatus",[["none","No active subscription"],["expired_or_cancelled","Expired or cancelled"],["any","Any (active still excluded)"]])}
          <label className={labelClass}>Registered after<input className={inputClass} type="date" value={filters.registeredAfter} onChange={e=>changeFilter("registeredAfter",e.target.value)}/></label>
          <label className={labelClass}>Registered before<input className={inputClass} type="date" value={filters.registeredBefore} onChange={e=>changeFilter("registeredBefore",e.target.value)}/></label>
        </div>
        <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900" onClick={()=>setShowAdvanced(v=>!v)}><SlidersHorizontal className="h-4 w-4"/>{showAdvanced ? "Hide advanced filters" : "More audience filters"}<span className="text-slate-400">{showAdvanced ? "−" : "+"}</span></button>
        {showAdvanced && <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"><strong>Account eligibility</strong><p className="mt-1">Active learner accounts only. Disabled accounts and administrators are always excluded.</p></div>
          <label className={labelClass}>Specific subscription plan<select className={selectClass} value={filters.planId} onChange={e=>changeFilter("planId",e.target.value)}><option value="">Any plan</option>{plans.map(p=><option key={p._id} value={p._id}>{p.name} · {p.currency} {p.price}</option>)}</select></label>
          {selectField("Plan segment","planSegment",[["","Any plan type"],["premium","Highest-priced"],["popular","Popular"],["paid","Paid"],["free","Free"]])}
          {selectField("Subscription expires within","expiresWithinDays",[["","Any expiry"],["7","7 days"],["14","14 days"],["30","30 days"],["60","60 days"],["90","90 days"]])}
          {selectField("Inactive for","inactiveDays",[["","Any activity"],["7","7+ days"],["14","14+ days"],["30","30+ days"],["60","60+ days"],["90","90+ days"]])}
          <label className={labelClass}>Specific course ID<input className={inputClass} value={filters.courseId} onChange={e=>changeFilter("courseId",e.target.value)} placeholder="Paste course ID"/></label>
          {selectField("Enrollment status","enrollmentStatus",[["","Any enrollment"],["active","Active"],["completed","Completed"],["cancelled","Cancelled"]])}
          {selectField("Minimum progress","progressMin",[["","Any progress"],["25","25%+"],["50","50%+"],["75","75%+"],["90","90%+"],["100","100%"]])}
          {selectField("Maximum progress","progressMax",[["","Any progress"],["25","Up to 25%"],["50","Up to 50%"],["75","Up to 75%"],["90","Up to 90%"],["100","Up to 100%"]])}
          {selectField("Minimum paid spend","totalSpendMin",[["","Any spend"],["500","₹500+"],["1000","₹1,000+"],["2500","₹2,500+"],["5000","₹5,000+"],["10000","₹10,000+"],["25000","₹25,000+"]])}
          {selectField("Minimum courses enrolled","courseCountMin",[["","Any count"],["1","1+"],["2","2+"],["3","3+"],["4","4+"],["5","5+"],["10","10+"]])}
          {selectField("Course segment","courseSegment",[["","Any course"],["popular","Top 5 popular"],["paid","Paid courses"],["free","Free courses"],["featured","Featured courses"]])}
          {selectField("Phone verification","phoneVerified",[["any","Any status"],["yes","Verified"],["no","Not verified"]])}
          {selectField("Marketing email consent","marketingConsent",[["any","Any consent"],["yes","Consented"],["no","Not consented"]])}
          {selectField("Profile setup","profileSetup",[["any","Any profile"],["complete","Complete (city and learning goal set)"],["skipped","Skipped"],["incomplete","Incomplete (missing city or learning goal)"]])}
          <label className={labelClass}>City contains<input className={inputClass} maxLength={100} value={filters.city} onChange={e=>changeFilter("city",e.target.value)} placeholder="e.g. Nashik"/></label>
          <label className={labelClass}>Learning goal contains<input className={inputClass} maxLength={240} value={filters.learningGoal} onChange={e=>changeFilter("learningGoal",e.target.value)} placeholder="e.g. backend development"/></label>
        </div>}
        <p className="mt-3 text-xs text-slate-500">Filters combine together. Admin accounts and learners with an active subscription are always excluded.</p>
      </div>}
    </section>

    <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-slate-900">2. What access should they receive?</h2><p className="mt-1 text-sm text-slate-500">Choose the entitlement plan and enter exactly how many days the trial should last.</p></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className={labelClass}>Trial plan<select className={inputClass} value={planId} onChange={e=>{setPlanId(e.target.value);setPreview(null);setConfirmGrant(false);}}><option value="">Select a plan…</option>{plans.map(p=><option key={p._id} value={p._id}>{p.name} · {p.price===0 ? "Free" : `${p.currency} ${p.price}`} / ${p.billingInterval}</option>)}</select><span className="mt-1 block font-normal text-slate-500">This is the plan the learner will access during the trial.</span></label>
        <label className={labelClass}>Trial duration<input className={inputClass} type="number" min={1} max={30} step={1} value={trialDays} onChange={e=>{setTrialDays(Number(e.target.value));setPreview(null);setConfirmGrant(false);}}/><span className="mt-1 block font-normal text-slate-500">Choose 1–30 days. Access starts when the grant is applied.</span></label>
        <label className={labelClass}>Campaign label<input className={inputClass} value={campaignName} minLength={3} maxLength={120} onChange={e=>{setCampaignName(e.target.value);setPreview(null);setConfirmGrant(false);}} placeholder="e.g. Support exception — learner trial"/></label>
        <label className={labelClass}>Optional paid conversion offer<select className={inputClass} value={conversionPlanId} onChange={e=>{setConversionPlanId(e.target.value);setPreview(null);setConfirmGrant(false);}}><option value="">No conversion offer</option>{plans.filter(p=>p.price>0&&p.billingInterval!=="one_time").map(p=><option key={p._id} value={p._id}>{p.name} · {p.currency} {p.price}/{p.billingInterval}</option>)}</select><span className="mt-1 block font-normal text-slate-500">Offer only; it never enables autopay or charges the learner.</span></label>
        <label className={`${labelClass} sm:col-span-2`}>Internal reason (required)<textarea className={inputClass} rows={2} minLength={10} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);setConfirmGrant(false);}} placeholder="Record why this learner or group is receiving a trial."/></label>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs text-slate-500">Nothing is granted until you preview and confirm. No payment is initiated.</p><button type="button" className="btn-primary justify-center" onClick={()=>void runPreview()} disabled={loading||!valid}><Users className="h-4 w-4"/>{loading ? "Checking eligibility…" : "Review eligible learner(s)"}</button></div>
    </section>

    {preview && <section className="mt-5 rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-violet-700"/><h2 className="font-bold text-slate-900">3. Review before granting</h2></div><p className="mt-1 text-sm text-slate-500">{targetMode==="single" ? singleEmail.trim() : "Filtered learner group"} · {plans.find(p=>p._id===planId)?.name} · {trialDays} days</p></div><AdminBadge tone="warning">No autopay</AdminBadge></div>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 sm:px-6"><div className="rounded-xl bg-violet-50 p-4"><p className="text-xs font-medium text-violet-700">Eligible</p><p className="mt-1 text-2xl font-bold text-violet-950">{preview.eligibleCount}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-600">Skipped</p><p className="mt-1 text-2xl font-bold text-slate-900">{preview.skippedCount}</p></div><div className="col-span-2 rounded-xl bg-slate-50 p-4 sm:col-span-1"><p className="text-xs font-medium text-slate-600">Duration</p><p className="mt-1 text-2xl font-bold text-slate-900">{trialDays} days</p></div></div>
      {preview.eligible.length>0 && <div className="overflow-x-auto px-5 pb-4 sm:px-6"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="border-b p-3">Learner</th><th className="border-b p-3">Registered</th><th className="border-b p-3">Provider</th><th className="border-b p-3">Email</th></tr></thead><tbody className="divide-y divide-slate-100">{preview.eligible.map(u=><tr key={u.id}><td className="p-3 font-semibold text-slate-900">{u.name||"Learner"}</td><td className="p-3 text-slate-600">{date(u.createdAt)}</td><td className="p-3 text-slate-600">{u.authProvider||"—"}</td><td className="p-3">{u.email}</td></tr>)}</tbody></table></div>}
      {preview.skipped.length>0 && <details className="mx-5 mb-4 rounded-lg border border-slate-200 p-3 sm:mx-6"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Why learners were skipped ({preview.skippedCount})</summary><div className="mt-3 space-y-2">{preview.skipped.map(u=><p key={u.id} className="text-xs text-slate-500">{u.name} · {u.email} — {u.reason}</p>)}</div></details>}
      <div className="border-t border-slate-100 p-5 sm:px-6"><label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmGrant} onChange={e=>setConfirmGrant(e.target.checked)} className="mt-1 h-4 w-4 accent-violet-600"/><span>I confirm granting the <strong>{plans.find(p=>p._id===planId)?.name}</strong> plan for <strong>{trialDays} days</strong> to <strong>{preview.eligibleCount} eligible learner(s)</strong>. This does not authorize recurring payments.</span></label><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="btn-primary" onClick={()=>void applyGrant()} disabled={loading||!confirmGrant||preview.eligibleCount===0}><ShieldCheck className="h-4 w-4"/>Confirm and grant trial</button><button type="button" className="btn-secondary" onClick={()=>{setPreview(null);setConfirmGrant(false);}}>Back to edit</button></div></div>
    </section>}

    <section id="trial-history" className="mt-8 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Trial grant history</h2><p className="mt-1 text-sm text-slate-500">Review current and terminal entitlements, conversion consent, and administrative reason.</p></div>{loading&&!grants.length?<p className="p-8 text-sm text-slate-500">Loading grants…</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Learner</th><th className="p-3">Campaign / plan</th><th className="p-3">Trial period</th><th className="p-3">Status</th><th className="p-3">Conversion</th><th className="p-3">Reason</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{grants.map(g=><tr key={g._id}><td className="p-3"><p className="font-semibold">{g.user?.name||"Unknown user"}</p><p className="text-xs text-slate-500">{g.user?.email}</p></td><td className="p-3"><p>{g.campaignName}</p><p className="text-xs text-slate-500">{g.plan?.name||"Plan"}</p></td><td className="p-3 text-xs"><p>{date(g.startsAt)}</p><p>Ends {date(g.endsAt)}</p></td><td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{g.status}</span></td><td className="p-3">{g.conversionPlan?.name||"None"}<p className="text-xs text-slate-500">{g.conversionConsentStatus.replace(/_/g," ")}</p></td><td className="max-w-56 p-3 text-xs text-slate-500">{g.reason}</td><td className="p-3">{g.status==="trialing" ? <button type="button" className="btn-secondary whitespace-nowrap" onClick={()=>void revokeGrant(g._id)} disabled={grantActionId===g._id || Boolean(grantActionId)}><Ban className="h-3.5 w-3.5"/>{grantActionId===g._id ? "Revoking…" : "Revoke trial"}</button> : <span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table>{!grants.length&&<p className="p-8 text-center text-sm text-slate-500">No trial grants yet.</p>}</div>}</section>
    </section>
    </section>
  </div>;
}
