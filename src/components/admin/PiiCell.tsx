import { useId, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function maskPii(value: string, kind: "email" | "phone" | "text") {
  if (kind === "email") { const [local, domain] = value.split("@"); if (!domain) return value ? value[0] + "***" : ""; return (local ? local[0] : "") + "***@" + domain; }
  if (kind === "phone") { const digits = value.replace(/\D/g, ""); return digits.length < 4 ? "***" : "***" + digits.slice(-4); }
  return value ? value[0] + "•••" : "";
}
export function PiiCell({ value, kind = "email", masked = true, maskedValue, identityKey, canReveal = false, onReveal, className = "" }: {
  value: string | null | undefined; kind?: "email" | "phone" | "text"; masked?: boolean; maskedValue?: string; identityKey?: string; canReveal?: boolean;
  onReveal?: (reason: string) => Promise<string | void> | string | void; className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actual = String(value || "");
  const reasonHelpId = useId();
  const revealGeneration = useRef(0);

  // Never retain revealed values or pending reveal responses across record/permission changes.
  useLayoutEffect(() => {
    revealGeneration.current += 1;
    setRevealed(false);
    setRevealedValue(null);
    setReason("");
    setError("");
    setBusy(false);
  }, [actual, kind, canReveal, masked, maskedValue, identityKey]);

  async function reveal() {
    if (!onReveal || busy) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 500) {
      setError("Enter a reason between 10 and 500 characters.");
      return;
    }
    const generation = revealGeneration.current;
    setBusy(true);
    setError("");
    try {
      const result = await onReveal(trimmedReason);
      if (generation !== revealGeneration.current) return;
      if (typeof result === "string") setRevealedValue(result);
      setRevealed(true);
    } catch (e) {
      if (generation === revealGeneration.current) {
        setError(e instanceof Error ? e.message : "Could not reveal this value.");
      }
    } finally {
      if (generation === revealGeneration.current) setBusy(false);
    }
  }
  return <span className={["admin-pii-cell", className].filter(Boolean).join(" ")}>
    <span>{masked && !revealed ? (maskedValue ?? maskPii(actual, kind)) : (revealedValue ?? actual) || "—"}</span>
    {masked && canReveal && !revealed && <span className="admin-pii-cell__reveal"><Eye size={14} aria-hidden="true" /><label className="admin-pii-cell__reason">Reason for reveal<input value={reason} minLength={10} maxLength={500} aria-describedby={reasonHelpId} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" /><span id={reasonHelpId} className="admin-field-help">Use 10–500 characters. {reason.trim().length}/500</span></label><button type="button" aria-label="Reveal personal information" aria-busy={busy} onClick={() => void reveal()} disabled={busy || !onReveal || reason.trim().length < 10 || reason.trim().length > 500}>{busy ? "Revealing…" : "Reveal"}</button>{error && <span role="alert">{error}</span>}</span>}
    {revealed && <button type="button" aria-label="Mask personal information" title="Mask personal information" onClick={() => { setRevealed(false); setRevealedValue(null); setReason(""); }}><EyeOff size={14} /></button>}
  </span>;
}

export type { Density } from "./DataTable";