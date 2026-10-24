import { useEffect, useState, type ReactNode } from "react";
import { AdminButton } from "./AdminUI";

export type FilterChip = { key: string; label: string; onRemove: () => void };
export function FilterBar({ children, className = "", searchValue, onSearchChange, searchLabel = "Search", chips = [], onReset, resultCount, debounceMs = 300 }: {
  children?: ReactNode; className?: string; searchValue?: string; onSearchChange?: (value: string) => void;
  searchLabel?: string; chips?: FilterChip[]; onReset?: () => void; resultCount?: number; debounceMs?: number;
}) {
  const [localSearch, setLocalSearch] = useState(searchValue || "");
  useEffect(() => setLocalSearch(searchValue || ""), [searchValue]);
  useEffect(() => {
    if (!onSearchChange) return;
    const timer = window.setTimeout(() => onSearchChange(localSearch), Math.max(0, debounceMs));
    return () => window.clearTimeout(timer);
  }, [localSearch, onSearchChange, debounceMs]);
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

export type { Density } from "./DataTable";