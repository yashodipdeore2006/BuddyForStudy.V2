import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, LoaderCircle, XCircle } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "link";
type ButtonSize = "sm" | "md" | "lg";

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export function AdminButton({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  children,
  ...props
}: AdminButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={["admin-button", `admin-button--${variant}`, `admin-button--${size}`, className].filter(Boolean).join(" ")}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="admin-button__spinner" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function AdminIconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button {...props} type={props.type || "button"} aria-label={label} title={label} className={["admin-icon-button", className].filter(Boolean).join(" ")}>
      {children}
    </button>
  );
}

export function AdminCard({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={["admin-card", className].filter(Boolean).join(" ")}>{children}</section>;
}

type AdminBadgeTone = "neutral" | "success" | "warning" | "danger" | "info";
export function AdminBadge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: AdminBadgeTone; className?: string }) {
  return <span className={["admin-badge", `admin-badge--${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}

type AdminAlertTone = "info" | "success" | "warning" | "danger";
export function AdminAlert({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: AdminAlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertCircle : tone === "danger" ? XCircle : Info;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={["admin-alert", `admin-alert--${tone}`, className].filter(Boolean).join(" ")}>
      <Icon aria-hidden="true" size={18} />
      <div>{title && <p className="admin-alert__title">{title}</p>}<div>{children}</div></div>
    </div>
  );
}

export function AdminSkeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={["admin-skeleton-stack", className].filter(Boolean).join(" ")} role="status" aria-label="Loading content">
      {Array.from({ length: rows }, (_, index) => <span key={index} className="admin-skeleton" />)}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="admin-empty-state">
      <div className="admin-empty-state__icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="admin-empty-state__action">{action}</div>}
    </div>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={["admin-page-header", className].filter(Boolean).join(" ")}>
      <div className="admin-page-header__copy">
        {eyebrow && <p className="admin-page-header__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="admin-page-header__description">{description}</p>}
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </header>
  );
}

export function AdminFilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={["admin-filter-bar", className].filter(Boolean).join(" ")} aria-label="List filters">{children}</section>;
}

export function AdminTableContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={["admin-table-container", className].filter(Boolean).join(" ")}>{children}</div>;
}

type AdminTabItem = { value: string; label: string; disabled?: boolean };
export function AdminTabs({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: AdminTabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="admin-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={value === item.value} disabled={item.disabled} className="admin-tab" onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function AdminPagination({
  page,
  pages,
  total,
  from,
  to,
  limit,
  loading = false,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  limit: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <div className="admin-pagination">
      <label className="admin-page-size">Rows per page
        <select aria-label="Rows per page" className="input-field" value={limit} onChange={(event) => onLimitChange(Number(event.target.value))}>
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span className="admin-pagination-count">Showing {from}–{to} of {total}</span>
      <div className="admin-pagination-actions">
        <button type="button" className="btn-secondary" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span aria-live="polite">Page {page} of {Math.max(1, pages)}</span>
        <button type="button" className="btn-secondary" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}
