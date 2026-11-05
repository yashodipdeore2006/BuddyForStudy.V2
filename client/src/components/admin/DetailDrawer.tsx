import { useEffect, useRef, type ReactNode } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

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

export type { Density } from "./DataTable";