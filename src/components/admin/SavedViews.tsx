import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { AdminButton } from "./AdminUI";
import type { Density } from "./DataTable";

export type SavedViewRecord = { id: string; owner?: string; canManage?: boolean; page: string; name: string; filters: Record<string, unknown>; columns: string[]; sort: Record<string, unknown>; density: Density; shared: boolean; createdAt?: string; updatedAt?: string };
export function SavedViews({ page, views, activeId, currentView, onApply, onCreate, onDelete, loading = false, error, className = "" }: {
  page: string; views: SavedViewRecord[]; activeId?: string | null; currentView: { filters: Record<string, unknown>; columns: string[]; sort: Record<string, unknown>; density: Density }; onApply: (view: SavedViewRecord) => void;
  onCreate: (payload: { page: string; name: string; filters: Record<string, unknown>; columns: string[]; sort: Record<string, unknown>; density: Density; shared: boolean }) => Promise<void> | void;
  onDelete: (view: SavedViewRecord) => Promise<void> | void;
  loading?: boolean; error?: string; className?: string;
}) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [shared, setShared] = useState(false); const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || saving) return; setSaving(true);
    try { await onCreate({ page, name: name.trim(), filters: currentView.filters, columns: currentView.columns, sort: currentView.sort, density: currentView.density, shared }); setName(""); setShared(false); setOpen(false); } catch { /* Parent exposes the server error inline. */ } finally { setSaving(false); }
  }
  return <div className={["admin-saved-views", className].filter(Boolean).join(" ")} aria-label="Saved views">
    {views.map((view) => <span className="admin-saved-view-item" key={view.id}>
      <button type="button" className="admin-saved-view" aria-pressed={activeId === view.id} onClick={() => onApply(view)}>{view.name}{view.shared ? " · Team" : ""}</button>
      {view.canManage !== false && <button type="button" className="admin-saved-view-remove" aria-label={"Delete saved view " + view.name} title={"Delete saved view " + view.name} onClick={() => void onDelete(view)}><X size={12} /></button>}
    </span>)}
    <button type="button" className="admin-saved-view admin-saved-view--action" onClick={() => setOpen((value) => !value)}>+ Save current view</button>
    {loading && <span className="admin-saved-views__meta">Loading saved views…</span>}
    {error && <span className="admin-saved-views__error" role="alert">{error}</span>}
    {open && <form className="admin-save-view-form" onSubmit={(event) => void save(event)}>
      <label htmlFor={`saved-view-name-${page}`}>View name</label>
      <input id={`saved-view-name-${page}`} className="input-field" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} required placeholder="e.g. Unverified administrators" />
      <label className="admin-saved-views__share"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /> Share with the admin team</label>
      <AdminButton type="submit" variant="primary" loading={saving}>Save view</AdminButton>
      <AdminButton type="button" variant="secondary" onClick={() => { setOpen(false); setName(""); }}>Cancel</AdminButton>
    </form>}
  </div>;
}

export type { Density } from "./DataTable";