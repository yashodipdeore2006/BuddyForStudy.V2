import { X } from "lucide-react";

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      <section role="dialog" aria-modal="true" aria-labelledby="bfs-shortcuts-title" className="bfs-shortcuts-dialog">
        <header className="bfs-shortcuts-header">
          <div><h2 id="bfs-shortcuts-title">Keyboard shortcuts</h2><p>Move around BuddyForStudy without losing your place.</p></div>
          <button type="button" className="bfs-icon-control" aria-label="Close keyboard shortcuts" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="bfs-shortcuts-list">
          {rows.map(([keys, label]) => <div className="bfs-shortcut-row" key={keys}><span>{label}</span><kbd>{keys}</kbd></div>)}
        </div>
      </section>
    </div>
  );
}
