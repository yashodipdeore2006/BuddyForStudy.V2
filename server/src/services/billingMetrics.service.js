export const GROSS_COLLECTION_PAYMENT_STATUSES = Object.freeze(["paid", "partially_refunded", "refunded"]);

export function calculateNetRevenue(grossRevenue, processedRefunds) {
  const gross = Number(grossRevenue);
  const refunds = Number(processedRefunds);
  const safeGross = Number.isFinite(gross) ? gross : 0;
  const safeRefunds = Number.isFinite(refunds) ? refunds : 0;
  return Number((safeGross - safeRefunds).toFixed(2));
}
