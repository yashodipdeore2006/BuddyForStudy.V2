import { AsyncLocalStorage } from "node:async_hooks";

const youtubeMetricsContext = new AsyncLocalStorage();

/**
 * Scope diagnostics to one normal-search operation without changing provider
 * behavior. Callers outside this context incur no metrics work beyond one lookup.
 */
export function withYouTubeRequestMetrics(metrics, operation) {
  return youtubeMetricsContext.run(metrics, operation);
}

/**
 * Record one outgoing YouTube Data API request attempt. Phase 0 only observes
 * estimated API costs; it does not enforce a quota budget or retry requests.
 */
export function recordYouTubeRequest(endpoint) {
  const metrics = youtubeMetricsContext.getStore();
  if (!metrics) return;

  if (endpoint === "search") metrics.searchCalls += 1;
  metrics.quotaUnits += endpoint === "search" ? 100 : 1;
}
