import { useEffect, useState } from "react";
import { CalendarClock, Power, Plus, RefreshCcw, Tag } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminTabs } from "@/components/admin/AdminUI";
import { TypedConfirmDialog } from "@/components/admin/TypedConfirmDialog";

const emptyForm = {
  code: "",
  type: "percentage",
  value: 10,
  maxDiscount: "",
  minOrderAmount: 0,
  usageLimit: "",
  expiresAt: "",
  course: "",
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [bulkPrefix, setBulkPrefix] = useState("BFS");
  const [bulkCount, setBulkCount] = useState(10);
  const [activeSection, setActiveSection] = useState<"promotions" | "create">("promotions");
  const [confirmAction, setConfirmAction] = useState<{ kind: "create" | "bulk" | "toggle"; coupon?: any } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [couponData, courseData, accessData] = await Promise.all([
        adminFetch("/api/admin/coupons"),
        adminFetch("/api/admin/courses?limit=200"),
        adminFetch("/api/admin/access"),
      ]);
      setPermissions(accessData.access?.permissions || []);
      setCoupons(couponData.coupons || []);
      setCourses(courseData.courses || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load promotions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openConfirmation(action: { kind: "create" | "bulk" | "toggle"; coupon?: any }) {
    if (!permissions.includes("coupons.manage")) { setError("You do not have permission to manage coupons."); return; }
    if (action.kind === "bulk" && (!Number.isInteger(bulkCount) || bulkCount < 1 || bulkCount > 100)) { setError("Choose a batch size from 1 to 100."); return; }
    setError(""); setActionError(""); setConfirmText(""); setActionReason(""); setConfirmAction(action);
  }

  async function create(reason?: string) {
    if (reason === undefined) { openConfirmation({ kind: "create" }); return; }
    const code = String(form.code || "").trim().toUpperCase();
    const value = Number(form.value);
    const maxDiscount = form.maxDiscount === "" ? null : Number(form.maxDiscount);
    const minOrderAmount = Number(form.minOrderAmount || 0);
    const usageLimit = form.usageLimit === "" ? null : Number(form.usageLimit);
    if (!code || !Number.isFinite(value) || value <= 0) {
      setError("Enter a valid coupon code and discount value.");
      return;
    }
    if (form.type === "percentage" && value > 100) {
      setError("Percentage discount cannot exceed 100%.");
      return;
    }
    if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) {
      setError("Maximum discount must be greater than ₹0, or leave it blank.");
      return;
    }
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
      setError("Minimum order cannot be negative.");
      return;
    }
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      setError("Usage limit must be a whole number of at least 1, or leave it blank.");
      return;
    }
    if (form.expiresAt && new Date(form.expiresAt).getTime() <= Date.now()) {
      setError("Expiry date and time must be in the future.");
      return;
    }


    setSaving(true);
    setError("");
    try {
      await adminFetch("/api/admin/coupons", {
        method: "POST",
        body: JSON.stringify({
          code,
          type: form.type,
          value,
          maxDiscount,
          minOrderAmount,
          usageLimit,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          course: form.course || null,
          isActive: true,
          reason,
        }),
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create coupon");
    } finally {
      setSaving(false);
    }
  }

  async function generateBulk() {
    const reason = window.prompt("Reason for bulk coupon generation (10–500 characters):")?.trim() || "";
    if (reason.length < 10 || reason.length > 500) {
      setError("A reason of 10–500 characters is required.");
      return;
    }
    if (!Number.isInteger(bulkCount) || bulkCount < 1 || bulkCount > 100) {
      setError("Choose a batch size from 1 to 100.");
      return;
    }
    setSaving(true); setError("");
    try {
      await adminFetch("/api/admin/coupons/bulk", {
        method: "POST",
        body: JSON.stringify({
          prefix: bulkPrefix, count: bulkCount, type: form.type, value: Number(form.value),
          maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount),
          minOrderAmount: Number(form.minOrderAmount || 0),
          usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          course: form.course || null, reason,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate coupon batch.");
    } finally { setSaving(false); }
  }

  async function toggle(coupon: any) {
    const reason = window.prompt("Reason for " + (coupon.isActive ? "disabling" : "enabling") + " coupon " + coupon.code + " (10–500 characters):")?.trim() || "";
    if (reason.length < 10 || reason.length > 500) {
      setError("A reason of 10–500 characters is required.");
      return;
    }
    try {
      await adminFetch("/api/admin/coupons/" + coupon._id, {
        method: "PUT",
        body: JSON.stringify({ isActive: !coupon.isActive, reason }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update coupon");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Growth and promotions"
        title="Coupons and promotions"
        description="Create targeted discounts with limits, expiry and course scope."
        actions={<button type="button" aria-label="Refresh coupons" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>}
      />

      {!permissions.includes("coupons.manage") && <div role="status" className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">View-only access: your role can review coupons but cannot create or change promotions.</div>}
      {error && <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {confirmAction && <TypedConfirmDialog
        open
        title={confirmAction.kind === "create" ? "Create coupon" : confirmAction.kind === "bulk" ? "Generate coupon batch" : (confirmAction.coupon?.isActive ? "Disable coupon" : "Enable coupon")}
        description={confirmAction.kind === "create" ? "Create a new discount that learners may use at checkout." : confirmAction.kind === "bulk" ? "Generate a batch of unique coupon codes using the current discount settings." : `Change the availability of coupon ${confirmAction.coupon?.code}.`}
        consequence={actionError ? <span role="alert">{actionError}</span> : confirmAction.kind === "bulk" ? `This will create ${bulkCount} coupon records.` : confirmAction.kind === "toggle" ? "This changes whether the coupon can be redeemed." : "The coupon will be created as active."}
        confirmLabel={confirmAction.kind === "create" ? "Create coupon" : confirmAction.kind === "bulk" ? "Generate batch" : (confirmAction.coupon?.isActive ? "Disable coupon" : "Enable coupon")}
        requiredText={confirmAction.kind === "create" ? "CREATE COUPON" : confirmAction.kind === "bulk" ? `GENERATE ${bulkCount} COUPONS` : String(confirmAction.coupon?.code || "")}
        value={confirmText} onValueChange={setConfirmText}
        reason={actionReason} onReasonChange={setActionReason}
        loading={saving}
        onClose={() => { if (!saving) { setConfirmAction(null); setActionError(""); } }}
        onConfirm={() => {
          const reason = actionReason.trim();
          if (!confirmAction || reason.length < 10 || reason.length > 500) return;
          if (confirmAction.kind === "create") void create(reason);
          else if (confirmAction.kind === "bulk") void generateBulk(reason);
          else if (confirmAction.coupon) void toggle(confirmAction.coupon, reason);
        }}
      />}

      <div className="mt-6">
        <AdminTabs
          ariaLabel="Coupon management"
          value={activeSection}
          onChange={setActiveSection}
          items={[
            { value: "promotions" as const, label: `Promotions (${coupons.length})` },
            ...(permissions.includes("coupons.manage") ? [{ value: "create" as const, label: "Create or generate coupons" }] : []),
          ]}
        />
      </div>

      {activeSection === "create" && <>
      <section className="card mt-4 p-5">
        <div className="flex items-center gap-2"><Tag className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Create promotion</h2><p className="text-xs text-slate-500">Use caps and expiry dates to prevent accidental open-ended discounts.</p></div></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700">
            Coupon code
            <input className="input-field mt-1" placeholder="e.g. WELCOME10" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            <span className="mt-1 block text-xs font-normal text-slate-500">The code learners enter at checkout.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Discount type
            <select className="input-field mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed amount (₹)</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">Choose a percentage or fixed-rupee discount.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Discount value
            <input className="input-field mt-1" type="number" min="0.01" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={form.type === "percentage" ? "e.g. 10 for 10%" : "e.g. 100 for ₹100"} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{form.type === "percentage" ? "Enter 1–100; 10 means 10% off." : "Enter the amount to subtract in rupees."}</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Maximum discount (₹) <span className="font-normal text-slate-400">Optional</span>
            <input className="input-field mt-1" type="number" min="0" step="0.01" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} placeholder="e.g. 100" />
            <span className="mt-1 block text-xs font-normal text-slate-500">Caps a percentage discount; leave blank for no cap.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Minimum order (₹)
            <input className="input-field mt-1" type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value === "" ? "" : Number(e.target.value) })} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Minimum eligible purchase; use 0 for no minimum.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Total usage limit <span className="font-normal text-slate-400">Optional</span>
            <input className="input-field mt-1" type="number" min="1" step="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="e.g. 100" />
            <span className="mt-1 block text-xs font-normal text-slate-500">Maximum total redemptions; blank means unlimited.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Expiry date & time <span className="font-normal text-slate-400">Optional</span>
            <span className="relative mt-1 block"><CalendarClock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Expiry date and time" className="input-field pl-10" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></span>
            <span className="mt-1 block text-xs font-normal text-slate-500">Coupon becomes invalid after this time; blank means no expiry.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Course scope
            <select className="input-field mt-1" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
              <option value="">All courses</option>
              {courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">Choose one course or apply the coupon to all courses.</span>
          </label>
        </div>
        <button type="button" className="btn-primary mt-4" onClick={() => void create()} disabled={saving || !permissions.includes("coupons.manage")}>
          {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Coupon
        </button>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-bold">Bulk coupon generation</h2>
        <p className="mt-1 text-xs text-slate-500">Generate up to 100 unique, random codes using the discount settings above. Every generated coupon is audited with your reason.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px_auto]">
          <label className="text-sm font-medium text-slate-700">Code prefix<input className="input-field mt-1" maxLength={20} value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())} placeholder="BFS" /></label>
          <label className="text-sm font-medium text-slate-700">Number of codes<input className="input-field mt-1" type="number" min={1} max={100} value={bulkCount} onChange={(e) => setBulkCount(Number(e.target.value))} /></label>
          <div className="flex items-end"><button type="button" className="btn-primary w-full" onClick={() => void generateBulk()} disabled={saving || !permissions.includes("coupons.manage")}>{saving ? "Generating…" : "Generate batch"}</button></div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Uses the discount type, value, limits, expiry and course scope configured in the creation form above.</p>
      </section></>}

      {activeSection === "promotions" && <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Active & past promotions</h2><p className="mt-1 text-xs text-slate-500">{coupons.length} coupon records</p></div>
        {loading ? <div role="status" aria-live="polite" aria-label="Loading coupons" className="p-10 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /><span className="sr-only">Loading coupons</span></div> : (
          <div className="divide-y divide-slate-100">
            {!coupons.length && <p className="p-8 text-center text-sm text-slate-500">No coupons created yet.</p>}
            {coupons.map((coupon) => (
              <div key={coupon._id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-extrabold">{coupon.code}</span><span className={"badge " + (coupon.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>{coupon.isActive ? "Active" : "Disabled"}</span></div>
                  <p className="mt-1 text-sm text-slate-600">{coupon.type === "percentage" ? coupon.value + "% off" : "₹" + coupon.value + " off"}{coupon.maxDiscount ? " · max ₹" + coupon.maxDiscount : ""}</p>
                  <p className="mt-1 text-xs text-slate-400">Min order ₹{coupon.minOrderAmount || 0} · Used {coupon.usedCount || 0}{coupon.usageLimit ? " / " + coupon.usageLimit : ""}{coupon.expiresAt ? " · expires " + new Date(coupon.expiresAt).toLocaleString() : " · no expiry"}</p>
                  <p className="mt-1 text-xs text-slate-500">{coupon.course?.title ? "Course: " + coupon.course.title : "Applies to all courses"}</p>
                </div>
                <button type="button" className={coupon.isActive ? "btn-secondary" : "btn-primary"} onClick={() => void toggle(coupon)} disabled={!permissions.includes("coupons.manage")}>
                  <Power className="h-4 w-4" /> {coupon.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>}
    </div>
  );
}
