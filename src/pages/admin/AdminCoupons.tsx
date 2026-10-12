import { useEffect, useState } from "react";
import { CalendarClock, Power, Plus, RefreshCcw, Tag } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [couponData, courseData] = await Promise.all([
        adminFetch("/api/admin/coupons"),
        adminFetch("/api/admin/courses?limit=200"),
      ]);
      setCoupons(couponData.coupons || []);
      setCourses(courseData.courses || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load promotions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    const code = String(form.code || "").trim().toUpperCase();
    const value = Number(form.value);
    if (!code || !Number.isFinite(value) || value <= 0) {
      setError("Enter a valid coupon code and discount value.");
      return;
    }
    if (form.type === "percentage" && value > 100) {
      setError("Percentage discount cannot exceed 100%.");
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
          maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount),
          minOrderAmount: Number(form.minOrderAmount || 0),
          usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          course: form.course || null,
          isActive: true,
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

  async function toggle(coupon: any) {
    try {
      await adminFetch("/api/admin/coupons/" + coupon._id, {
        method: "PUT",
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update coupon");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Growth & promotions</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Coupons & Promotions</h1>
          <p className="mt-2 text-slate-500">Create targeted discounts with limits, expiry and course scope.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void load()}><RefreshCcw className="h-4 w-4" /> Refresh</button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card mt-6 p-5">
        <div className="flex items-center gap-2"><Tag className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Create promotion</h2><p className="text-xs text-slate-500">Use caps and expiry dates to prevent accidental open-ended discounts.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input-field" placeholder="Coupon code e.g. WELCOME10" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed ₹</option>
          </select>
          <input className="input-field" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} placeholder="Discount" />
          <input className="input-field" type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} placeholder="Max discount ₹ (optional)" />
          <input className="input-field" type="number" min="0" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })} placeholder="Minimum order ₹" />
          <input className="input-field" type="number" min="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="Usage limit (optional)" />
          <label className="relative"><CalendarClock className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="input-field pl-10" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></label>
          <select className="input-field" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
            <option value="">All courses</option>
            {courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary mt-4" onClick={() => void create()} disabled={saving}>
          {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Coupon
        </button>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Active & past promotions</h2><p className="mt-1 text-xs text-slate-500">{coupons.length} coupon records</p></div>
        {loading ? <div className="p-10 text-center"><RefreshCcw className="mx-auto animate-spin text-blue-600" /></div> : (
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
                <button type="button" className={coupon.isActive ? "btn-secondary" : "btn-primary"} onClick={() => void toggle(coupon)}>
                  <Power className="h-4 w-4" /> {coupon.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
