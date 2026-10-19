import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { AdminButton } from "./AdminUI";

export function TypedConfirmDialog({ open, title, description, consequence, confirmLabel = "Confirm action", requiredText, value, onValueChange, reason, onReasonChange, onConfirm, onClose, loading = false, danger = true, reasonRequired = true }: {
  open: boolean; title: string; description?: ReactNode; consequence?: ReactNode; confirmLabel?: string; requiredText?: string;
  value?: string; onValueChange?: (value: string) => void; reason?: string; onReasonChange?: (value: string) => void;
  onConfirm: () => void; onClose: () => void; loading?: boolean; danger?: boolean; reasonRequired?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(loading);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]') || []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loadingRef.current) { event.stopPropagation(); onCloseRef.current(); return; }
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
  return <div className="admin-typed-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading && !danger) onClose(); }}>
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

export type { Density } from "./DataTable";