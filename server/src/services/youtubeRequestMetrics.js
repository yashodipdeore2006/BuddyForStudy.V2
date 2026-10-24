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
