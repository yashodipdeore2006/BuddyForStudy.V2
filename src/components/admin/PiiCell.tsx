import { useId, useLayoutEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function maskPii(value: string, kind: "email" | "phone" | "text") {
  if (kind === "email") { const [local, domain] = value.split("@"); if (!domain) return value ? value[0] + "***" : ""; return (local ? local[0] : "") + "***@" + domain; }
  if (kind === "phone") { const digits = value.replace(/\D/g, ""); return digits.length < 4 ? "***" : "***" + digits.slice(-4); }
  return value ? value[0] + "•••" : "";
}
export function PiiCell({ value, kind = "email", masked = true, maskedValue, canReveal = false, onReveal, className = "" }: {
  value: string | null | undefined; kind?: "email" | "phone" | "text"; masked?: boolean; maskedValue?: string; canReveal?: boolean;
  onReveal?: (reason: string) => Promise<string | void> | string | void; className?: string;
}) {
  const [revealed, setRevealed] = useState(false); const [revealedValue, setRevealedValue] = useState<string | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const actual = String(value || "");
  const reasonHelpId = useId();
  // Never carry an expanded PII value across record changes or a permission/masking change.
  useLayoutEffect(() => {
    setRevealed(false);
    setRevealedValue(null);
    setReason("");
    setError("");
  }, [actual, kind, canReveal, masked, maskedValue]);
  async function reveal() { if (!onReveal || busy) return; if (reason.trim().length < 10 || reason.trim().length > 500) { setError("Enter a reason between 10 and 500 characters."); return; } setBusy(true); setError(""); try { const result = await onReveal(reason.trim()); if (typeof result === "string") setRevealedValue(result); setRevealed(true); } catch (e) { setError(e instanceof Error ? e.message : "Could not reveal this value."); } finally { setBusy(false); } }
  return <span className={["admin-pii-cell", className].filter(Boolean).join(" ")}>
    <span>{masked && !revealed ? (maskedValue ?? maskPii(actual, kind)) : (revealedValue ?? actual) || "—"}</span>
    {masked && canReveal && !revealed && <span className="admin-pii-cell__reveal"><Eye size={14} aria-hidden="true" /><label className="admin-pii-cell__reason">Reason for reveal<input value={reason} minLength={10} maxLength={500} aria-describedby={reasonHelpId} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" /><span id={reasonHelpId} className="admin-field-help">Use 10–500 characters. {reason.trim().length}/500</span></label><button type="button" aria-label="Reveal personal information" aria-busy={busy} onClick={() => void reveal()} disabled={busy || !onReveal || reason.trim().length < 10 || reason.trim().length > 500}>{busy ? "Revealing…" : "Reveal"}</button>{error && <span role="alert">{error}</span>}</span>}
    {revealed && <button type="button" aria-label="Mask personal information" title="Mask personal information" onClick={() => { setRevealed(false); setRevealedValue(null); setReason(""); }}><EyeOff size={14} /></button>}
  </span>;
}

export type { Density } from "./DataTable";