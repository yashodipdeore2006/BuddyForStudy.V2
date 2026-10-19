import type { ReactNode, TableHTMLAttributes } from "react";
import { ArrowUpDown } from "lucide-react";
import { AdminEmptyState, AdminSkeleton, AdminTableContainer } from "./AdminUI";

export type Density = "compact" | "comfortable";
export type DataTableColumn<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; sortable?: boolean; align?: "left" | "right" | "center"; width?: string };
type DataTableProps<T> = {
  rows?: T[];
  columns?: DataTableColumn<T>[];
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  density?: Density;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  loading?: boolean;
  refreshing?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  pagination?: ReactNode;
  children?: ReactNode;
  className?: string;
  tableProps?: TableHTMLAttributes<HTMLTableElement>;
};
export function DataTable<T>({
  rows, columns, rowKey, onRowClick, selectedIds = [], onSelectionChange, density = "comfortable", sortBy, sortOrder = "asc", onSortChange,
  loading = false, refreshing = false, error, empty, pagination, children, className = "", tableProps
}: DataTableProps<T>) {
  const getKey = rowKey || ((row: T) => String((row as Record<string, unknown>)._id ?? (row as Record<string, unknown>).id));
  const allSelected = Boolean(rows?.length && rows.every((row) => selectedIds.includes(getKey(row))));
  const toggleAll = (checked: boolean) => onSelectionChange?.(checked ? Array.from(new Set([...selectedIds, ...(rows || []).map(getKey)])) : selectedIds.filter((id) => !(rows || []).some((row) => getKey(row) === id)));
  return <section className={["admin-data-table", className].filter(Boolean).join(" ")}>
    {refreshing && <div className="admin-table-progress" role="progressbar" aria-label="Refreshing table data" />}
    {error && <div className="admin-data-table__error" role="alert">{error}</div>}
    {loading ? <div className="admin-data-table__loading"><AdminSkeleton rows={8} /></div> : children ?? (rows && columns ? <>
      <AdminTableContainer><table {...tableProps} className={["admin-data-table__table", `admin-data-table__table--${density}`, tableProps?.className || ""].filter(Boolean).join(" ")}>
        <thead><tr>
          {onSelectionChange && <th scope="col" className="admin-data-table__select"><input type="checkbox" aria-label="Select all rows on this page" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /></th>}
          {columns.map((column) => <th scope="col" key={column.key} aria-sort={column.sortable && sortBy === column.key ? (sortOrder === "asc" ? "ascending" : "descending") : "none"} style={{ width: column.width, textAlign: column.align || "left" }}>{column.sortable && onSortChange ? <button type="button" className="admin-data-table__sort" onClick={() => onSortChange(column.key)}>{column.header}<span aria-hidden="true">{sortBy === column.key ? (sortOrder === "asc" ? "↑" : "↓") : <ArrowUpDown size={13} />}</span></button> : column.header}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={getKey(row)} className={["admin-data-table__row", onRowClick ? "admin-data-table__row--clickable" : "", selectedIds.includes(getKey(row)) ? "admin-data-table__row--selected" : ""].filter(Boolean).join(" ")} onClick={() => onRowClick?.(row)} onKeyDown={(event) => { if (event.target === event.currentTarget && onRowClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row); } }} tabIndex={onRowClick ? 0 : undefined} aria-selected={selectedIds.includes(getKey(row))}>
          {onSelectionChange && <td className="admin-data-table__select" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={"Select row " + getKey(row)} checked={selectedIds.includes(getKey(row))} onChange={(event) => onSelectionChange(event.target.checked ? [...selectedIds, getKey(row)] : selectedIds.filter((id) => id !== getKey(row)))} /></td>}
          {columns.map((column) => <td key={column.key} style={{ textAlign: column.align || "left" }}>{column.render(row)}</td>)}
        </tr>)}</tbody>
      </table></AdminTableContainer>
      {!rows.length && (empty || <AdminEmptyState title="No results" description="No records match the current filters." />)}
    </> : null)}
    {pagination && <div className="admin-data-table__pagination">{pagination}</div>}
  </section>;
}
