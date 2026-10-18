import { useEffect, useRef, useState, type FormEvent, type ReactNode, type TableHTMLAttributes } from "react";
import { X, ChevronLeft, ChevronRight, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { AdminButton, AdminBadge, AdminEmptyState, AdminSkeleton, AdminTableContainer } from "./AdminUI";

export type Density = "compact" | "comfortable";
export type StatusDomain = "user" | "course" | "enrollment" | "enrollmentSource" | "payment" | "subscription" | "refund" | "paymentIssue" | "notificationDelivery" | "webhook" | "alertSeverity" | "alertStatus" | "announcement" | "review";
const STATUS_MAP: Record<StatusDomain, Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }>> = {
  user: { active: { label: "Active", tone: "success" }, inactive: { label: "Inactive", tone: "neutral" } },
  course: { published: { label: "Published", tone: "success" }, draft: { label: "Draft", tone: "warning" }, archived: { label: "Archived", tone: "neutral" } },
  enrollment: { active: { label: "Active", tone: "info" }, completed: { label: "Completed", tone: "success" }, cancelled: { label: "Cancelled", tone: "neutral" } },
  enrollmentSource: { self: { label: "Self", tone: "neutral" }, admin: { label: "Admin", tone: "info" } },
  payment: { paid: { label: "Paid", tone: "success" }, created: { label: "Created", tone: "neutral" }, pending: { label: "Pending", tone: "warning" }, failed: { label: "Failed", tone: "danger" }, refunded: { label: "Refunded", tone: "info" }, partially_refunded: { label: "Partially refunded", tone: "info" }, cancelled: { label: "Cancelled", tone: "neutral" } },
  subscription: { active: { label: "Active", tone: "success" }, trialing: { label: "Trialing", tone: "info" }, past_due: { label: "Past due", tone: "warning" }, cancelled: { label: "Cancelled", tone: "neutral" }, expired: { label: "Expired", tone: "neutral" } },
  refund: { pending: { label: "Pending", tone: "warning" }, approved: { label: "Approved", tone: "info" }, rejected: { label: "Rejected", tone: "danger" }, processed: { label: "Processed", tone: "success" } },
  paymentIssue: { open: { label: "Open", tone: "danger" }, in_review: { label: "In review", tone: "warning" }, resolved: { label: "Resolved", tone: "success" }, closed: { label: "Closed", tone: "neutral" } },
  notificationDelivery: { sent: { label: "Accepted", tone: "success" }, pending: { label: "Pending", tone: "warning" }, failed: { label: "Failed", tone: "danger" }, skipped: { label: "Skipped", tone: "neutral" } },
  webhook: { processed: { label: "Processed", tone: "success" }, processing: { label: "Processing", tone: "info" }, failed: { label: "Failed", tone: "danger" } },
  alertSeverity: { info: { label: "Info", tone: "info" }, warning: { label: "Warning", tone: "warning" }, critical: { label: "Critical", tone: "danger" } },
  alertStatus: { open: { label: "Open", tone: "danger" }, acknowledged: { label: "Acknowledged", tone: "warning" }, resolved: { label: "Resolved", tone: "success" } },
  announcement: { draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Scheduled", tone: "info" }, sending: { label: "Sending", tone: "info" }, sent: { label: "Sent", tone: "success" }, failed: { label: "Failed", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" } },
  review: { visible: { label: "Visible", tone: "success" }, hidden: { label: "Hidden", tone: "neutral" }, reported: { label: "Reported", tone: "warning" } }
};

export function StatusBadge({ domain, value, label }: { domain: StatusDomain; value: string | boolean; label?: string }) {
  const key = typeof value === "boolean" ? (value ? "active" : "inactive") : String(value || "").toLowerCase();
  const status = STATUS_MAP[domain][key] || { label: label || String(value || "Unknown").replace(/_/g, " "), tone: "neutral" as const };
  return <AdminBadge tone={status.tone}>{label || status.label}</AdminBadge>;
}

export type DataTableColumn<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; sortable?: boolean; align?: "left" | "right" | "center"; width?: string };
type DataTableProps<T> = {
  rows?: T[];
  columns?: DataTableColumn<T>[];
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  density?: Density;
  loading?: boolean;
  refreshing?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  pagination?: ReactNode;
  children?: ReactNode;
  className?: string;
  tableProps?: TableHTMLAttributes<HTMLTableElement>;
};
export function DataTable<T>({
  rows, columns, rowKey, onRowClick, selectedIds = [], onSelectionChange, density = "comfortable",
  loading = false, refreshing = false, error, empty, pagination, children, className = "", tableProps
}: DataTableProps<T>) {
  const getKey = rowKey || ((row: T) => String((row as Record<string, unknown>)._id ?? (row as Record<string, unknown>).id));
  const allSelected = Boolean(rows?.length && rows.every((row) => selectedIds.includes(getKey(row))));
  const toggleAll = (checked: boolean) => onSelectionChange?.(checked ? Array.from(new Set([...selectedIds, ...(rows || []).map(getKey)])) : selectedIds.filter((id) => !(rows || []).some((row) => getKey(row) === id)));
  return <section className={["admin-data-table", className].filter(Boolean).join(" ")}>
    {refreshing && <div className="admin-table-progress" role="progressbar" aria-label="Refreshing table data" />}
    {error && <div className="admin-data-table__error" role="alert">{error}</div>}
    {loading ? <div className="admin-data-table__loading"><AdminSkeleton rows={8} /></div> : children ?? (rows && columns ? <>
      <AdminTableContainer><table {...tableProps} className={["admin-data-table__table", `admin-data-table__table--${density}`, tableProps?.className || ""].filter(Boolean).join(" ")}>
        <thead><tr>
          {onSelectionChange && <th scope="col" className="admin-data-table__select"><input type="checkbox" aria-label="Select all rows on this page" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /></th>}
          {columns.map((column) => <th scope="col" key={column.key} style={{ width: column.width, textAlign: column.align || "left" }}>{column.header}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={getKey(row)} className={onRowClick ? "admin-data-table__row--clickable" : undefined} onClick={() => onRowClick?.(row)}>
          {onSelectionChange && <td className="admin-data-table__select" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={"Select row " + getKey(row)} checked={selectedIds.includes(getKey(row))} onChange={(event) => onSelectionChange(event.target.checked ? [...selectedIds, getKey(row)] : selectedIds.filter((id) => id !== getKey(row)))} /></td>}
          {columns.map((column) => <td key={column.key} style={{ textAlign: column.align || "left" }}>{column.render(row)}</td>)}
        </tr>)}</tbody>
      </table></AdminTableContainer>
      {!rows.length && (empty || <AdminEmptyState title="No results" description="No records match the current filters." />)}
    </> : null)}
    {pagination && <div className="admin-data-table__pagination">{pagination}</div>}
  </section>;
}

export type FilterChip = { key: string; label: string; onRemove: () => void };
export function FilterBar({ children, className = "", searchValue, onSearchChange, searchLabel = "Search", chips = [], onReset, resultCount }: {
  children?: ReactNode; className?: string; searchValue?: string; onSearchChange?: (value: string) => void;
  searchLabel?: string; chips?: FilterChip[]; onReset?: () => void; resultCount?: number;
}) {
  const [localSearch, setLocalSearch] = useState(searchValue || "");
  useEffect(() => setLocalSearch(searchValue || ""), [searchValue]);
  useEffect(() => {
    if (!onSearchChange) return;
    const timer = window.setTimeout(() => onSearchChange(localSearch), 300);
    return () => window.clearTimeout(timer);
  }, [localSearch, onSearchChange]);
  return <section className={["admin-filter-bar", className].filter(Boolean).join(" ")} aria-label="List filters">
    {onSearchChange && <label className="admin-filter-bar__search"><span className="sr-only">{searchLabel}</span><input type="search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /><button type="button" aria-label="Clear search" onClick={() => setLocalSearch("")} disabled={!localSearch}>×</button></label>}
    {children}
    {(chips.length > 0 || resultCount !== undefined) && <div className="admin-filter-bar__summary">
      <div className="admin-filter-bar__chips">{chips.map((chip) => <button type="button" key={chip.key} className="admin-filter-chip" onClick={chip.onRemove}>{chip.label} <span aria-hidden="true">×</span></button>)}</div>
      {resultCount !== undefined && <span>{resultCount.toLocaleString()} results</span>}
      {onReset && chips.length > 0 && <AdminButton size="sm" variant="ghost" onClick={onReset}>Clear all</AdminButton>}
    </div>}
  </section>;
}

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
      <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save view"}</button>
      <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setName(""); }}>Cancel</button>
    </form>}
  </div>;
}

export function DetailDrawer({ open, title, subtitle, children, onClose, onPrevious, onNext, footer, wide = false }: {
  open: boolean; title: ReactNode; subtitle?: ReactNode; children: ReactNode; onClose: () => void;
  onPrevious?: () => void; onNext?: () => void; footer?: ReactNode; wide?: boolean;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const root = drawerRef.current;
    const focusable = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const elements = focusable(); if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [open]);
  if (!open) return null;
  return <div className="admin-detail-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={drawerRef} className={["admin-detail-drawer", wide ? "admin-detail-drawer--wide" : ""].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby="admin-detail-drawer-title" tabIndex={-1}>
      <header className="admin-detail-drawer__header"><div><h2 id="admin-detail-drawer-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <div className="admin-detail-drawer__navigation">{onPrevious && <button type="button" aria-label="Previous record" onClick={onPrevious}><ChevronLeft /></button>}{onNext && <button type="button" aria-label="Next record" onClick={onNext}><ChevronRight /></button>}<button type="button" aria-label="Close details" onClick={onClose}><X /></button></div>
      </header>
      <div className="admin-detail-drawer__body">{children}</div>
      {footer && <footer className="admin-detail-drawer__footer">{footer}</footer>}
    </aside>
  </div>;
}

export function TypedConfirmDialog({ open, title, description, consequence, confirmLabel = "Confirm action", requiredText, value, onValueChange, reason, onReasonChange, onConfirm, onClose, loading = false, danger = true, reasonRequired = true }: {
  open: boolean; title: string; description?: ReactNode; consequence?: ReactNode; confirmLabel?: string; requiredText?: string;
  value?: string; onValueChange?: (value: string) => void; reason?: string; onReasonChange?: (value: string) => void;
  onConfirm: () => void; onClose: () => void; loading?: boolean; danger?: boolean; reasonRequired?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]') || []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const elements = focusable(); if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  const typedMatches = !requiredText || value === requiredText;
  const reasonValid = !reasonRequired || Boolean(reason?.trim() && reason.trim().length >= 10 && reason.trim().length <= 500);
  return <div className="admin-typed-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="admin-typed-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-typed-confirm-title" aria-describedby="admin-typed-confirm-description" tabIndex={-1}>
      <div className="admin-typed-confirm__icon"><AlertTriangle aria-hidden="true" /></div>
      <h2 id="admin-typed-confirm-title">{title}</h2>
      {description && <div id="admin-typed-confirm-description" className="admin-typed-confirm__description">{description}</div>}
      {consequence && <div className="admin-typed-confirm__consequence">{consequence}</div>}
      {requiredText && <label className="admin-field-label">Type <strong>{requiredText}</strong> to confirm<input value={value || ""} onChange={(event) => onValueChange?.(event.target.value)} autoComplete="off" /></label>}
      {reasonRequired && <label className="admin-field-label">Reason (required)<textarea value={reason || ""} onChange={(event) => onReasonChange?.(event.target.value)} minLength={10} maxLength={500} rows={3} placeholder="Explain why this action is needed" /><span className="admin-field-help">Use 10–500 characters. {String((reason || "").trim().length)}/500</span></label>}
      <div className="admin-typed-confirm__actions"><AdminButton variant="secondary" onClick={onClose} disabled={loading}>Cancel</AdminButton><AdminButton variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading || !typedMatches || !reasonValid} loading={loading}>{confirmLabel}</AdminButton></div>
    </div>
  </div>;
}

export function MoneyCell({ amount, currency = "INR", locale = "en-IN", className = "" }: { amount: number | string | null | undefined; currency?: string; locale?: string; className?: string }) {
  const value = Number(amount);
  if (amount === null || amount === undefined || !Number.isFinite(value)) return <span className={["admin-money-cell", className].filter(Boolean).join(" ")} title="Amount unavailable">—</span>;
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return <span className={["admin-money-cell", className].filter(Boolean).join(" ")} title={`${currency} ${value.toFixed(2)}`}>{formatted}</span>;
}

function maskPii(value: string, kind: "email" | "phone" | "text") {
  if (kind === "email") { const [local, domain] = value.split("@"); if (!domain) return value ? value[0] + "***" : ""; return (local ? local[0] : "") + "***@" + domain; }
  if (kind === "phone") { const digits = value.replace(/\D/g, ""); return digits.length < 4 ? "***" : "***" + digits.slice(-4); }
  return value ? value[0] + "•••" : "";
}
export function PiiCell({ value, kind = "email", masked = true, canReveal = false, onReveal, className = "" }: {
  value: string | null | undefined; kind?: "email" | "phone" | "text"; masked?: boolean; canReveal?: boolean;
  onReveal?: (reason: string) => Promise<string | void> | string | void; className?: string;
}) {
  const [revealed, setRevealed] = useState(false); const [revealedValue, setRevealedValue] = useState<string | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const actual = String(value || "");
  async function reveal() { if (!onReveal || busy) return; if (reason.trim().length < 10 || reason.trim().length > 500) { setError("Enter a reason between 10 and 500 characters."); return; } setBusy(true); setError(""); try { const result = await onReveal(reason.trim()); if (typeof result === "string") setRevealedValue(result); setRevealed(true); } catch (e) { setError(e instanceof Error ? e.message : "Could not reveal this value."); } finally { setBusy(false); } }
  return <span className={["admin-pii-cell", className].filter(Boolean).join(" ")}>
    <span>{masked && !revealed ? maskPii(actual, kind) : (revealedValue ?? actual) || "—"}</span>
    {masked && canReveal && !revealed && <span className="admin-pii-cell__reveal"><Eye size={14} aria-hidden="true" /><label className="admin-pii-cell__reason">Reason for reveal<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" /></label><button type="button" onClick={() => void reveal()} disabled={busy || !onReveal}>{busy ? "Revealing…" : "Reveal"}</button>{error && <span role="alert">{error}</span>}</span>}
    {revealed && <button type="button" aria-label="Mask personal information" title="Mask personal information" onClick={() => { setRevealed(false); setRevealedValue(null); setReason(""); }}><EyeOff size={14} /></button>}
  </span>;
}
