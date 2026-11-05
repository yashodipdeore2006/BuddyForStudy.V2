import { useMemo } from "react";

type JsonDiffProps = { before: unknown; after: unknown; maxRows?: number };

function flatten(value: unknown, prefix = "", result: Map<string, unknown> = new Map()) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length && prefix) result.set(prefix, value);
    for (const [key, child] of entries) flatten(child, prefix ? prefix + "." + key : key, result);
  } else {
    result.set(prefix || "$", value);
  }
  return result;
}
function display(value: unknown) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
export default function JsonDiff({ before, after, maxRows = 100 }: JsonDiffProps) {
  const entries = useMemo(() => {
    const left = flatten(before);
    const right = flatten(after);
    const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
    return paths.flatMap((path) => {
      const hasBefore = left.has(path);
      const hasAfter = right.has(path);
      const oldValue = left.get(path);
      const newValue = right.get(path);
      if (hasBefore && hasAfter && JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];
      return [{ path, before: oldValue, after: newValue, kind: !hasBefore ? "added" as const : !hasAfter ? "removed" as const : "changed" as const }];
    }).slice(0, maxRows);
  }, [before, after, maxRows]);
  if (!entries.length) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No field-level differences to display.</p>;
  return <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="grid grid-cols-[minmax(100px,0.7fr)_1fr_1fr] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"><span>Field</span><span>Before</span><span>After</span></div>
    {entries.map((entry) => <div key={entry.path} className={"grid grid-cols-[minmax(100px,0.7fr)_1fr_1fr] gap-2 border-t border-slate-100 p-3 text-xs " + (entry.kind === "added" ? "bg-emerald-50/60" : entry.kind === "removed" ? "bg-red-50/60" : "bg-amber-50/40")}>
      <div className="min-w-0"><p className="break-words font-mono font-semibold text-slate-800">{entry.path}</p><span className="mt-1 inline-block rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">{entry.kind}</span></div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-slate-700">{display(entry.before)}</pre>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-slate-700">{display(entry.after)}</pre>
    </div>)}
    {entries.length >= maxRows && <p className="border-t border-slate-100 p-3 text-xs text-slate-500">Diff limited to {maxRows} fields.</p>}
  </div>;
}
