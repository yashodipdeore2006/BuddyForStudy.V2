import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => { previousFocus?.focus(); };
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  const rows = [
    ["Ctrl/Cmd + K", "Open the command palette"],
    ["/", "Focus global search"],
    ["G then H", "Go to Home"],
    ["G then E", "Go to Explore"],
    ["G then L", "Go to My learning"],
    ["G then S", "Go to Saved"],
    ["C", "Continue your most recent course"],
    ["?", "Show these shortcuts"],
    ["Esc", "Close the current dialog or menu"],
  ];
  return (
    <div className="bfs-command-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bfs-shortcuts-title" aria-describedby="bfs-shortcuts-description" className="bfs-shortcuts-dialog" onKeyDown={handleKeyDown}>
        <header className="bfs-shortcuts-header">
          <div><h2 id="bfs-shortcuts-title">Keyboard shortcuts</h2><p id="bfs-shortcuts-description">Move around BuddyForStudy without losing your place.</p></div>
          <button ref={closeButtonRef} type="button" className="bfs-icon-control" aria-label="Close keyboard shortcuts" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="bfs-shortcuts-list">
          {rows.map(([keys, label]) => <div className="bfs-shortcut-row" key={keys}><span>{label}</span><kbd>{keys}</kbd></div>)}
        </div>
      </section>
    </div>
  );
}
