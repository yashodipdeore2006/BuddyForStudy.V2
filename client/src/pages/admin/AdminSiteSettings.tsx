import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminAlert, AdminBadge, AdminButton, AdminCard, AdminPageHeader, AdminSkeleton } from "@/components/admin/AdminUI";
import { DEFAULT_SITE_SETTINGS, type SiteFooterGroup, type SiteSettings } from "@/types/siteSettings";

type AccessResponse = { access?: { permissions?: string[] } };
type SettingsResponse = { settings?: SiteSettings; updatedAt?: string | null };

const FOOTER_GROUPS: Array<{ value: SiteFooterGroup; label: string }> = [
  { value: "company", label: "Company" },
  { value: "discover", label: "Discover" },
  { value: "plans_support", label: "Plans & support" },
  { value: "policies", label: "Policies" },
];

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  disabled = false,
  type = "text",
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  type?: string;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="input-field w-full"
      />
      {help && <p className="text-xs text-slate-500">{help}</p>}
    </div>
  );
}

export default function AdminSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const canManage = permissions.includes("site_settings.manage");
  const groups = useMemo(() => FOOTER_GROUPS.map((group) => ({
    ...group,
    links: settings.footerLinks.map((link, index) => ({ link, index })).filter(({ link }) => link.group === group.value),
  })), [settings.footerLinks]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsResponse, accessResponse] = await Promise.all([
        adminFetch("/api/admin/site-settings") as Promise<SettingsResponse>,
        adminFetch("/api/admin/access") as Promise<AccessResponse>,
      ]);
      setSettings(settingsResponse.settings || DEFAULT_SITE_SETTINGS);
      setUpdatedAt(settingsResponse.updatedAt || null);
      setPermissions(accessResponse.access?.permissions || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load site settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function updateBrand(key: keyof SiteSettings["brand"], value: string) {
    setSettings((current) => ({ ...current, brand: { ...current.brand, [key]: value } }));
  }

  function updateContact(key: keyof SiteSettings["contact"], value: string) {
    setSettings((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
  }

  function updateSocial(key: keyof SiteSettings["socialLinks"], value: string) {
    setSettings((current) => ({ ...current, socialLinks: { ...current.socialLinks, [key]: value } }));
  }

  function updateFooterLink(index: number, field: "label" | "href" | "group", value: string) {
    setSettings((current) => ({
      ...current,
      footerLinks: current.footerLinks.map((link, currentIndex) =>
        currentIndex === index ? { ...link, [field]: value } as typeof link : link
      ),
    }));
  }

  function moveFooterLink(index: number, offset: -1 | 1) {
    setSettings((current) => {
      const item = current.footerLinks[index];
      if (!item) return current;
      const groupIndices = current.footerLinks
        .map((link, currentIndex) => link.group === item.group ? currentIndex : -1)
        .filter((currentIndex) => currentIndex >= 0);
      const groupPosition = groupIndices.indexOf(index);
      const target = groupIndices[groupPosition + offset];
      if (target === undefined) return current;
      const next = [...current.footerLinks];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, footerLinks: next };
    });
  }

  function addFooterLink(group: SiteFooterGroup) {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "footer-" + Date.now().toString(36);
    setSettings((current) => ({
      ...current,
      footerLinks: [...current.footerLinks, { id, label: "", href: "", group }],
    }));
  }

  function removeFooterLink(index: number) {
    setSettings((current) => ({
      ...current,
      footerLinks: current.footerLinks.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  async function save() {
    if (!canManage) {
      setError("You have read-only access to site settings.");
      return;
    }
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError("Enter a change reason between 10 and 500 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await adminFetch("/api/admin/site-settings", {
        method: "PUT",
        body: JSON.stringify({ settings, reason: reason.trim() }),
      }) as SettingsResponse;
      if (response.settings) setSettings(response.settings);
      setUpdatedAt(response.updatedAt || new Date().toISOString());
      setReason("");
      setStatus("Site identity, contact information, social links and footer navigation have been saved.");
      window.dispatchEvent(new Event("bfs:site-settings-updated"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save site settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="admin-content space-y-5"><AdminPageHeader eyebrow="Website content" title="Site identity & footer" description="Manage the public brand identity and global website details." /><AdminSkeleton rows={7} /></div>;
  }

  return (
    <div className="admin-content space-y-6">
      <AdminPageHeader
        eyebrow="Website content"
        title="Site identity & footer"
        description="Manage the details shared across BuddyForStudy's public pages. Changes are saved centrally and do not require a frontend rebuild."
        actions={<AdminButton variant="secondary" icon={<RefreshCcw size={16} />} onClick={() => void load()}>Refresh</AdminButton>}
      />

      {!canManage && <AdminAlert tone="info" title="Read-only access">You can review the current public settings, but your administrator role does not include permission to change them.</AdminAlert>}
      {error && <AdminAlert tone="danger" title="Unable to complete this action">{error}</AdminAlert>}
      {status && <AdminAlert tone="success" title="Changes saved">{status}</AdminAlert>}

      <AdminCard className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Brand identity</h2><p className="text-sm text-slate-500">The name, message and logo used by the site header and footer.</p></div>
          <AdminBadge tone="info">Public</AdminBadge>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="site-name" label="Platform name" value={settings.brand.siteName} maxLength={80} disabled={!canManage} onChange={(value) => updateBrand("siteName", value)} placeholder="[ADD: approved platform name]" />
          <Field id="site-tagline" label="Tagline" value={settings.brand.tagline} maxLength={160} disabled={!canManage} onChange={(value) => updateBrand("tagline", value)} placeholder="[ADD: approved tagline]" />
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="site-description" className="block text-sm font-semibold text-slate-800">Short description</label>
            <textarea id="site-description" rows={3} maxLength={320} disabled={!canManage} value={settings.brand.description} onChange={(event) => updateBrand("description", event.target.value)} className="input-field w-full" placeholder="[ADD: approved short platform description]" />
            <p className="text-xs text-slate-500">Used as a safe fallback for public page descriptions. Page-specific SEO will be configured with each content editor.</p>
          </div>
          <div className="md:col-span-2">
            <Field id="site-logo" label="Logo image URL or same-site path" value={settings.brand.logoUrl} maxLength={1000} disabled={!canManage} onChange={(value) => updateBrand("logoUrl", value)} placeholder="/buddyforstudy-mascot.webp" help="Use a same-site path such as /assets/logo.svg or a trusted HTTPS image URL. Media-library uploads will be added in a later phase." />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <img src={settings.brand.logoUrl || DEFAULT_SITE_SETTINGS.brand.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
          <div className="min-w-0"><p className="font-semibold text-slate-900">{settings.brand.siteName}</p><p className="truncate text-sm text-slate-500">{settings.brand.tagline}</p></div>
        </div>
      </AdminCard>

      <AdminCard className="space-y-5">
        <div><h2 className="text-lg font-semibold">Public contact details</h2><p className="text-sm text-slate-500">Only values you enter here are displayed publicly. Leave unknown details empty.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="support-email" label="Support email" type="email" value={settings.contact.supportEmail} maxLength={254} disabled={!canManage} onChange={(value) => updateContact("supportEmail", value)} placeholder="[ADD: verified support email]" />
          <Field id="support-phone" label="Support phone" value={settings.contact.supportPhone} maxLength={40} disabled={!canManage} onChange={(value) => updateContact("supportPhone", value)} placeholder="[ADD: official support phone]" />
          <Field id="office-address" label="Office address" value={settings.contact.officeAddress} maxLength={240} disabled={!canManage} onChange={(value) => updateContact("officeAddress", value)} placeholder="[ADD: public office address, or leave empty]" />
          <Field id="business-hours" label="Support hours" value={settings.contact.businessHours} maxLength={160} disabled={!canManage} onChange={(value) => updateContact("businessHours", value)} placeholder="[ADD: verified support hours]" />
        </div>
      </AdminCard>

      <AdminCard className="space-y-5">
        <div><h2 className="text-lg font-semibold">Social profiles</h2><p className="text-sm text-slate-500">Only HTTPS links are accepted. Empty values hide the corresponding social icon.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(settings.socialLinks) as Array<keyof SiteSettings["socialLinks"]>).map((key) => (
            <Field key={key} id={"social-" + key} label={key === "x" ? "X" : key.charAt(0).toUpperCase() + key.slice(1)} type="url" value={settings.socialLinks[key]} maxLength={500} disabled={!canManage} onChange={(value) => updateSocial(key, value)} placeholder={"[ADD: official " + (key === "x" ? "X" : key) + " profile URL]"} />
          ))}
        </div>
      </AdminCard>

      <AdminCard className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-lg font-semibold">Footer navigation</h2><p className="text-sm text-slate-500">Add, edit, remove and reorder public footer links. Internal paths and HTTPS destinations are supported.</p></div>
          <AdminBadge>{settings.footerLinks.length} links</AdminBadge>
        </div>
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.value} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{group.label}</h3>
                <AdminButton size="sm" variant="secondary" icon={<Plus size={15} />} disabled={!canManage || settings.footerLinks.length >= 30} onClick={() => addFooterLink(group.value)}>Add link</AdminButton>
              </div>
              {group.links.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">No links in this section.</p> : group.links.map(({ link, index }) => (
                <div key={link.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_1.5fr_150px_auto] md:items-end">
                  <Field id={"footer-label-" + link.id} label="Label" value={link.label} maxLength={50} disabled={!canManage} onChange={(value) => updateFooterLink(index, "label", value)} placeholder="Link label" />
                  <Field id={"footer-href-" + link.id} label="Destination" value={link.href} maxLength={500} disabled={!canManage} onChange={(value) => updateFooterLink(index, "href", value)} placeholder="/about or https://example.com" />
                  <div className="space-y-1.5"><label htmlFor={"footer-group-" + link.id} className="block text-sm font-semibold text-slate-800">Section</label><select id={"footer-group-" + link.id} value={link.group} disabled={!canManage} onChange={(event) => updateFooterLink(index, "group", event.target.value)} className="input-field w-full">{FOOTER_GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                  <div className="flex gap-1">
                    <button type="button" className="admin-icon-button" aria-label={"Move " + (link.label || "footer link") + " up"} title="Move up" disabled={!canManage || group.links[0]?.index === index} onClick={() => moveFooterLink(index, -1)}><ArrowUp size={16} /></button>
                    <button type="button" className="admin-icon-button" aria-label={"Move " + (link.label || "footer link") + " down"} title="Move down" disabled={!canManage || group.links[group.links.length - 1]?.index === index} onClick={() => moveFooterLink(index, 1)}><ArrowDown size={16} /></button>
                    <button type="button" className="admin-icon-button text-red-600" aria-label={"Remove " + (link.label || "footer link")} title="Remove link" disabled={!canManage} onClick={() => removeFooterLink(index)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </AdminCard>

      {canManage && (
        <AdminCard className="space-y-4">
          <div><h2 className="text-lg font-semibold">Save site settings</h2><p className="text-sm text-slate-500">A reason is required for the audit trail. Public changes take effect through the settings API without rebuilding the frontend.</p></div>
          <div className="space-y-1.5">
            <label htmlFor="site-settings-reason" className="block text-sm font-semibold text-slate-800">Change reason</label>
            <textarea id="site-settings-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="input-field w-full" placeholder="Explain why the public site settings are being changed (10–500 characters)." />
            <p className="text-xs text-slate-500">{reason.trim().length}/500 characters; at least 10 are required.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{updatedAt ? "Last saved " + new Date(updatedAt).toLocaleString() : "Defaults are shown until the first save."}</p>
            <AdminButton variant="primary" icon={<Save size={16} />} loading={saving} disabled={reason.trim().length < 10} onClick={() => void save()}>Save site settings</AdminButton>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
