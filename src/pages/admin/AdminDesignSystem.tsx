import { useState } from "react";
import { CheckCircle2, Info, Search, ShieldCheck, Users } from "lucide-react";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminSkeleton,
} from "@/components/admin/AdminUI";

export default function AdminDesignSystem() {
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Workspace foundations"
        title="Admin design system"
        description="Reference gallery for shared tokens, controls, feedback states and accessible interaction patterns."
      />

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Color tokens</h2><p>Semantic colors stay consistent across all admin modules.</p></div>
        <div className="admin-token-grid">
          {[
            ["Canvas", "--bg", "admin-token-swatch--canvas"], ["Surface", "--surface", "admin-token-swatch--surface"], ["Subtle surface", "--surface-2", "admin-token-swatch--surface-2"],
            ["Border", "--border", "admin-token-swatch--border"], ["Primary accent", "--accent", "admin-token-swatch--accent"], ["Success", "--success", "admin-token-swatch--success"],
            ["Warning", "--warning", "admin-token-swatch--warning"], ["Danger", "--danger", "admin-token-swatch--danger"], ["Information", "--info", "admin-token-swatch--info"],
          ].map(([label, token, swatchClass]) => <AdminCard key={token} className="admin-token-card">
            <span className={`admin-token-swatch ${swatchClass}`} aria-hidden="true" />
            <strong>{label}</strong><code>{token}</code>
          </AdminCard>)}
        </div>
      </section>

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Typography and spacing</h2><p>Use the shared type scale, spacing rhythm, and semantic elevation tokens.</p></div>
        <div className="admin-gallery-grid">
          <AdminCard>
            <div className="admin-type-sample">
              <span className="admin-type-label">Display / --fs-3xl</span>
              <p className="admin-type-sample--3xl">Dashboard metrics</p>
            </div>
            <div className="admin-type-sample">
              <span className="admin-type-label">Page title / --fs-2xl</span>
              <p className="admin-type-sample--2xl">Subscription plans</p>
            </div>
            <div className="admin-type-sample">
              <span className="admin-type-label">Body / --fs-md</span>
              <p className="admin-type-sample--md">Manage access, pricing and learner support using clear, consistent controls.</p>
            </div>
            <div className="admin-type-sample">
              <span className="admin-type-label">Caption / --fs-xs</span>
              <p className="admin-type-sample--xs">Updated 18 Oct 2026 · Production</p>
            </div>
          </AdminCard>
          <AdminCard>
            <div className="admin-token-scale-grid">
              {[
                ["4px", "--s-1", "admin-space-1"], ["8px", "--s-2", "admin-space-2"], ["12px", "--s-3", "admin-space-3"],
                ["16px", "--s-4", "admin-space-4"], ["24px", "--s-5", "admin-space-5"], ["32px", "--s-6", "admin-space-6"],
              ].map(([label, token, sampleClass]) => <div className="admin-space-sample" key={token}><span>{label}</span><code>{token}</code><span className={`admin-space-bar ${sampleClass}`} aria-hidden="true" /></div>)}
            </div>
            <div className="admin-elevation-samples">
              <span className="admin-elevation-sample admin-elevation-sample--sm">Small elevation</span>
              <span className="admin-elevation-sample admin-elevation-sample--md">Medium elevation</span>
              <span className="admin-elevation-sample admin-elevation-sample--lg">Large elevation</span>
            </div>
          </AdminCard>
        </div>
      </section>

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Buttons and status</h2><p>One primary action per view; destructive actions are explicit.</p></div>
        <AdminCard>
          <div className="admin-gallery-row">
            <AdminButton variant="primary" onClick={() => setSaved(true)} icon={<CheckCircle2 size={16} />}>{saved ? "Changes saved" : "Save changes"}</AdminButton>
            <AdminButton variant="secondary" onClick={() => setSaved(false)}>Cancel</AdminButton>
            <AdminButton variant="ghost">More options</AdminButton>
            <AdminButton variant="danger" onClick={() => setSaved(false)}>Delete record</AdminButton>
            <AdminButton variant="secondary" disabled>Disabled</AdminButton>
          </div>
          <div className="admin-gallery-row">
            <AdminBadge tone="success">Active</AdminBadge><AdminBadge tone="warning">Pending review</AdminBadge>
            <AdminBadge tone="danger">Suspended</AdminBadge><AdminBadge tone="info">New</AdminBadge><AdminBadge>Archived</AdminBadge>
          </div>
          {saved && <AdminAlert tone="success" title="Changes saved">The sample action completed successfully.</AdminAlert>}
        </AdminCard>
      </section>

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Feedback states</h2><p>Loading, success, warning, and recoverable error states are visible and labelled.</p></div>
        <div className="admin-gallery-grid">
          <AdminCard><h3>Success</h3><AdminAlert tone="success" title="Changes saved">Your updates are available now.</AdminAlert></AdminCard>
          <AdminCard><h3>Warning</h3><AdminAlert tone="warning" title="Review required">Check the details before continuing.</AdminAlert></AdminCard>
          <AdminCard><h3>Recoverable error</h3><AdminAlert tone="danger" title="Couldn’t load records">Check your connection and retry the request.</AdminAlert><AdminButton variant="secondary" onClick={() => setSaved(false)}>Retry</AdminButton></AdminCard>
          <AdminCard><h3>Loading skeleton</h3><AdminSkeleton rows={4} /></AdminCard>
        </div>
      </section>

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Navigation and list patterns</h2><p>Tabs represent views of one page. Density is a user preference.</p></div>
        <AdminCard>
          <div className="admin-gallery-tabs" role="tablist" aria-label="Sample record views">
            {[["overview", "Overview"], ["activity", "Activity"], ["billing", "Billing"]].map(([value, label]) =>
              <button key={value} type="button" role="tab" aria-selected={activeTab === value} className="admin-gallery-tab" onClick={() => setActiveTab(value)}>{label}</button>
            )}
          </div>
          <div className="admin-gallery-row admin-gallery-toolbar">
            <label className="admin-gallery-search"><Search size={16} /><input type="search" placeholder="Search records" aria-label="Search sample records" /></label>
            <label className="admin-page-size">Density
              <select className="input-field" value={density} onChange={(event) => setDensity(event.target.value as "compact" | "comfortable")}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select>
            </label>
          </div>
          <div className={`admin-gallery-table admin-gallery-table--${density}`}>
            <div className="admin-gallery-table-row admin-gallery-table-row--head"><span>Name</span><span>Status</span><span>Owner</span><span>Updated</span></div>
            <div className="admin-gallery-table-row"><span>Learning path refresh</span><AdminBadge tone="success">Published</AdminBadge><span>Content team</span><span>18 Oct 2026</span></div>
            <div className="admin-gallery-table-row"><span>Payment reconciliation</span><AdminBadge tone="warning">Needs review</AdminBadge><span>Finance</span><span>17 Oct 2026</span></div>
          </div>
          <p className="admin-gallery-note">Current tab: {activeTab}. Sample data is illustrative and does not call production APIs.</p>
        </AdminCard>
      </section>

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Empty state</h2><p>Never leave a list blank when there is no data.</p></div>
        <AdminCard>
          <AdminEmptyState title="No saved views yet" description="Create a saved view to reuse filters, sorting and table density." icon={<Users size={28} />} action={<AdminButton variant="primary" onClick={() => setSaved(true)}>Create saved view</AdminButton>} />
        </AdminCard>
      </section>

      <section className="admin-gallery-section">
        <div className="admin-gallery-section-heading"><h2>Accessibility checks</h2><p>Controls expose labels, visible focus states, and keyboard interaction.</p></div>
        <AdminCard>
          <ul className="admin-gallery-checklist">
            <li><CheckCircle2 size={16} />Semantic buttons and labelled inputs</li>
            <li><CheckCircle2 size={16} />Status includes text, not color alone</li>
            <li><CheckCircle2 size={16} />Visible focus ring and reduced-motion support</li>
            <li><Info size={16} />Switch the admin theme in the top bar to inspect dark mode.</li>
            <li><ShieldCheck size={16} />This page is restricted by the existing settings permission.</li>
          </ul>
        </AdminCard>
      </section>
    </div>
  );
}
