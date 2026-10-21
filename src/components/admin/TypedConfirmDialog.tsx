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
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]'
    ) || []).filter((element) => element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null);
    const first = focusable()[0];
    (first || dialogRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!loadingRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const active = document.activeElement;
      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      if (!dialogRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && (active === firstElement || active === dialogRef.current)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && active === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        (focusable()[0] || dialogRef.current).focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      if (previous?.isConnected && !previous.hasAttribute("disabled")) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  const typedMatches = !requiredText || value === requiredText;
  const reasonValid = !reasonRequired || Boolean(reason?.trim() && reason.trim().length >= 10 && reason.trim().length <= 500);
  return <div className="admin-typed-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading && !danger) onClose(); }}>
    <div ref={dialogRef} className="admin-typed-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-typed-confirm-title" aria-describedby={description ? "admin-typed-confirm-description" : undefined} tabIndex={-1}>
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