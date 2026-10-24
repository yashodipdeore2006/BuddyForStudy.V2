import { env } from "../config/env.js";
import { recordYouTubeRequest, getCurrentYouTubeRequestMetrics } from "./youtubeRequestMetrics.js";
import { tryConsume, getState, markQuotaExceeded, QuotaBudgetError } from "./quota.service.js";

const COST = Object.freeze({ search: 100, default: 1 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = () => Math.floor(Math.random() * 101);

export async function youtubeRequest(endpoint, params = {}) {
  const cost = COST[endpoint] || COST.default;
  if (!env.youtubeApiKey) {
    const error = new Error("YOUTUBE_API_KEY is missing");
    error.status = 503;
    throw error;
  }

  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key: env.youtubeApiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });

  for (let attempt = 0; ; attempt += 1) {
    let budget;
    try {
      budget = await tryConsume(cost);
      recordYouTubeRequest(endpoint, budget.state);
    } catch (error) {
      if (error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") {
        recordYouTubeRequest(endpoint, error.state);
        const request = getCurrentYouTubeRequestMetrics();
      console.info("YouTube request refused", { requestId: request?.requestId || null, skillId: request?.skillId || null, endpoint, quotaState: error.state, quotaCost: cost });
      }
      throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("YouTube request timed out after 8000ms")), 8000);
    try {
      const response = await fetch(url, {
        headers: { "x-goog-api-key": env.youtubeApiKey },
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || data?.error?.message || "unknown error";
        if (response.status === 403 && /quotaExceeded|dailyLimitExceeded/i.test(String(reason))) {
          await markQuotaExceeded();
          throw new QuotaBudgetError("exhausted", "Google reported YouTube API quota exhaustion");
        }
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await sleep((attempt === 0 ? 300 : 900) + jitter());
          continue;
        }
        const error = new Error(`YouTube ${endpoint} failed: ${reason}`);
        error.status = response.status === 403 ? 503 : response.status;
        error.code = reason;
        throw error;
      }
      const state = await getState();
      const request = getCurrentYouTubeRequestMetrics();
      console.info("YouTube request completed", {
        requestId: request?.requestId || null, skillId: request?.skillId || null,
        endpoint, quotaState: state.state, requestQuotaState: budget.state,
        quotaUnits: state.units, quotaCost: cost, attempt: attempt + 1
      });
      return data;
    } catch (error) {
      if (error instanceof QuotaBudgetError || error?.name === "QuotaBudgetError") throw error;
      const networkFailure = error?.name === "AbortError" || error?.name === "TimeoutError" ||
        error?.name === "TypeError" || /timed out|network|fetch failed|socket/i.test(String(error?.message || ""));
      if (networkFailure && attempt < 2) {
        await sleep((attempt === 0 ? 300 : 900) + jitter());
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
