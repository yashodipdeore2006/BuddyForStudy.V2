import { AsyncLocalStorage } from "node:async_hooks";

const youtubeMetricsContext = new AsyncLocalStorage();

export function withYouTubeRequestMetrics(metrics, operation) {
  return youtubeMetricsContext.run(metrics, operation);
}

export function getCurrentYouTubeRequestMetrics() {
  return youtubeMetricsContext.getStore() || null;
}

export function recordYouTubeRequest(endpoint, quotaState = "unknown") {
  const metrics = youtubeMetricsContext.getStore();
  if (!metrics) return;
  if (endpoint === "search") metrics.searchCalls += 1;
  metrics.quotaUnits += endpoint === "search" ? 100 : 1;
  metrics.quotaState = quotaState;
}

export function recordYouTubeRequestRefused(endpoint, quotaState = "unknown", cost = 0) {
  const metrics = youtubeMetricsContext.getStore();
  if (!metrics) return;
  metrics.refusedCalls = (Number(metrics.refusedCalls) || 0) + 1;
  metrics.refusedQuotaUnits = (Number(metrics.refusedQuotaUnits) || 0) + Math.max(0, Number(cost) || 0);
  metrics.quotaState = quotaState;
}
