export function MoneyCell({ amount, currency = "INR", locale = "en-IN", className = "" }: { amount: number | string | null | undefined; currency?: string; locale?: string; className?: string }) {
  const value = Number(amount);
  if (amount === null || amount === undefined || !Number.isFinite(value)) return <span className={["admin-money-cell", className].filter(Boolean).join(" ")} title="Amount unavailable">—</span>;
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return <span className={["admin-money-cell", className].filter(Boolean).join(" ")} title={`${currency} ${value.toFixed(2)}`}>{formatted}</span>;
}

export type { Density } from "./DataTable";