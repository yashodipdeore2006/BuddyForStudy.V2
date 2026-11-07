import { env } from "../config/env.js";
import { YouTubeQuotaUsage } from "../models/YouTubeQuotaUsage.js";

// Google's current YouTube Data API quota model separates search.list calls
// from the shared default bucket. Keep a conservative app-side search cap.
export const YOUTUBE_API_COST = Object.freeze({ search: 1, default: 1 });
let testAdapters = null;
const exhaustedInProcessDay = { default: null, search: null };

export class QuotaBudgetError extends Error {
  constructor(state, message = "YouTube quota budget refused this request") {
    super(message);
    this.name = "QuotaBudgetError";
    this.code = "YOUTUBE_QUOTA_BUDGET";
    this.state = state;
  }
}

// Google resets YouTube Data API daily quota at midnight Pacific Time (including DST).
export function getPacificQuotaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function secondsUntilPacificReset(now = new Date()) {
  const currentDay = getPacificQuotaDay(now);
  let high = Math.ceil(now.getTime() / 1000) + 48 * 60 * 60;
  let low = Math.floor(now.getTime() / 1000);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (getPacificQuotaDay(new Date(middle * 1000)) === currentDay) low = middle + 1;
    else high = middle;
  }
  return Math.max(60, low - Math.floor(now.getTime() / 1000));
}

function stateFor(units, exhausted = false) {
  if (exhausted || units >= env.ytDailyQuotaBudget) return "exhausted";
  if (units >= env.ytDailyQuotaBudget * env.ytSoftLimitPct / 100) return "degraded";
  return "ok";
}

function searchStateFor(calls, exhausted = false) {
  if (exhausted || calls >= env.ytSearchDailyLimit) return "exhausted";
  if (calls >= env.ytSearchDailyLimit * env.ytSoftLimitPct / 100) return "degraded";
  return "ok";
}

function combinedState(defaultState, searchState) {
  if (defaultState === "exhausted" || searchState === "exhausted") return "exhausted";
  if (defaultState === "degraded" || searchState === "degraded") return "degraded";
  return "ok";
}

async function readMongo(dayKey) {
  const row = await YouTubeQuotaUsage.findOne({ dayKey }).lean();
  return {
    units: Number(row?.units || 0),
    exhausted: Boolean(row?.exhausted),
    searchCalls: Number(row?.searchCalls || 0),
    searchExhausted: Boolean(row?.searchExhausted)
  };
}

async function readState() {
  const dayKey = getPacificQuotaDay();
  const mongo = await readMongo(dayKey);
  return {
    dayKey,
    ...mongo,
    exhausted: mongo.exhausted || exhaustedInProcessDay.default === dayKey,
    searchExhausted: mongo.searchExhausted || exhaustedInProcessDay.search === dayKey,
    store: "mongo"
  };
}

export async function getState() {
  if (testAdapters?.getState) {
    const state = await testAdapters.getState();
    const defaultState = state.defaultState || state.state || "ok";
    const searchState = state.searchState || state.state || "ok";
    return {
      ...state,
      state: combinedState(defaultState, searchState),
      defaultState,
      searchState,
      searchCalls: Number(state.searchCalls || 0),
      searchLimit: Number(state.searchLimit || env.ytSearchDailyLimit)
    };
  }
  try {
    const current = await readState();
    const defaultState = stateFor(current.units, current.exhausted);
    const searchState = searchStateFor(current.searchCalls, current.searchExhausted);
    return {
      state: combinedState(defaultState, searchState),
      defaultState,
      searchState,
      units: current.units,
      budget: env.ytDailyQuotaBudget,
      searchCalls: current.searchCalls,
      searchLimit: env.ytSearchDailyLimit,
      softLimitPct: env.ytSoftLimitPct,
      resetDay: current.dayKey,
      store: current.store
    };
  } catch {
    // If quota storage is unavailable, fail closed for both provider buckets.
    return {
      state: "degraded",
      defaultState: "degraded",
      searchState: "degraded",
      units: 0,
      budget: env.ytDailyQuotaBudget,
      searchCalls: 0,
      searchLimit: env.ytSearchDailyLimit,
      softLimitPct: env.ytSoftLimitPct,
      resetDay: getPacificQuotaDay(),
      store: "unavailable"
    };
  }
}

async function ensureQuotaRow(dayKey) {
  try {
    await YouTubeQuotaUsage.updateOne(
      { dayKey },
      { $setOnInsert: { units: 0, exhausted: false, searchCalls: 0, searchExhausted: false } },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  // Migrate existing daily rows created before search used its own quota bucket.
  await YouTubeQuotaUsage.updateOne(
    { dayKey, searchCalls: { $exists: false } },
    { $set: { searchCalls: 0, searchExhausted: false } }
  );
}

async function reserveMongoQuota(dayKey, cost, budget, bucket) {
  await ensureQuotaRow(dayKey);
  // Each reservation is atomic, so concurrent app workers cannot overshoot either bucket.
  const filter = bucket === "search"
    ? { dayKey, searchExhausted: { $ne: true }, searchCalls: { $lt: budget } }
    : { dayKey, exhausted: { $ne: true }, units: { $lte: budget - cost } };
  const update = bucket === "search" ? { $inc: { searchCalls: 1 } } : { $inc: { units: cost } };
  const row = await YouTubeQuotaUsage.findOneAndUpdate(filter, update, { new: true }).lean();
  return row ? (bucket === "search" ? Number(row.searchCalls || 0) : Number(row.units || 0)) : null;
}

export async function markQuotaExceeded(bucket = "default") {
  const quotaBucket = bucket === "search" ? "search" : "default";
  if (testAdapters?.markQuotaExceeded) return testAdapters.markQuotaExceeded(quotaBucket);
  const dayKey = getPacificQuotaDay();
  exhaustedInProcessDay[quotaBucket] = dayKey;
  try {
    const update = quotaBucket === "search"
      ? { $set: { searchExhausted: true }, $setOnInsert: { units: 0, exhausted: false, searchCalls: 0 } }
      : { $set: { exhausted: true }, $setOnInsert: { units: 0, searchCalls: 0, searchExhausted: false } };
    await YouTubeQuotaUsage.updateOne({ dayKey }, update, { upsert: true });
  } catch {
    // The process-local latch still blocks this bucket until the Pacific reset.
    console.error("YouTube quota exhaustion could not be persisted; process-local guard remains active");
  }
}

export async function tryConsume(cost, options = {}) {
  const amount = Number(cost);
  if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("Quota cost must be a positive number");
  const bucket = options.bucket === "search" ? "search" : "default";
  if (bucket === "search" && amount !== 1) {
    throw new TypeError("Each YouTube search.list request must reserve exactly one search quota call");
  }

  const before = await getState();
  if (before.store === "unavailable") {
    const error = new QuotaBudgetError("degraded", "Quota storage unavailable; refusing provider request");
    error.details = before;
    throw error;
  }

  const stateBefore = bucket === "search" ? (before.searchState || before.state) : (before.defaultState || before.state);
  const usedBefore = bucket === "search" ? Number(before.searchCalls || 0) : Number(before.units || 0);
  const budget = bucket === "search" ? env.ytSearchDailyLimit : env.ytDailyQuotaBudget;
  if (stateBefore === "exhausted" || usedBefore + amount > budget) {
    const error = new QuotaBudgetError("exhausted");
    error.details = {
      ...before,
      bucket,
      units: usedBefore,
      budget,
      resetDay: before.resetDay || getPacificQuotaDay()
    };
    throw error;
  }

  let units;
  const dayKey = getPacificQuotaDay();
  try {
    if (testAdapters?.consumeBucketWithinBudget) {
      units = await testAdapters.consumeBucketWithinBudget(bucket, amount, budget);
    } else if (bucket === "search" && testAdapters?.consumeSearchWithinBudget) {
      units = await testAdapters.consumeSearchWithinBudget(amount, budget);
    } else if (bucket === "default" && testAdapters?.consumeWithinBudget) {
      units = await testAdapters.consumeWithinBudget(amount, budget);
    } else if (bucket === "default" && testAdapters?.increment) {
      units = await testAdapters.increment(amount);
      if (units > budget) units = null;
    } else {
      units = await reserveMongoQuota(dayKey, amount, budget, bucket);
    }
  } catch {
    const error = new QuotaBudgetError("degraded", "Quota storage unavailable; refusing provider request");
    error.details = { ...before, state: "degraded", store: "unavailable", bucket };
    throw error;
  }

  if (units === null || units === undefined) {
    let latest = before;
    try { latest = await getState(); } catch {}
    const latestUnits = bucket === "search" ? Number(latest.searchCalls ?? before.searchCalls ?? 0) : Number(latest.units ?? before.units ?? budget);
    const error = new QuotaBudgetError("exhausted");
    error.details = {
      ...latest,
      state: "exhausted",
      bucket,
      units: latestUnits,
      budget,
      store: latest.store || "mongo",
      resetDay: latest.resetDay || dayKey
    };
    throw error;
  }

  const bucketState = bucket === "search" ? searchStateFor(units) : stateFor(units);
  return {
    allowed: true,
    cost: amount,
    bucket,
    units,
    state: bucketState,
    ...(bucket === "search" ? { searchCalls: units } : {}),
    resetDay: dayKey
  };
}

export function __setQuotaTestAdapters(adapters = null) { testAdapters = adapters; }

export const __quotaTestHooks = Object.freeze({ stateFor, searchStateFor, combinedState, secondsUntilPacificReset });
