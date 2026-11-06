import { env } from "../config/env.js";
import { YouTubeQuotaUsage } from "../models/YouTubeQuotaUsage.js";

export const YOUTUBE_API_COST = Object.freeze({ search: 100, default: 1 });
let testAdapters = null;
let exhaustedInProcessDay = null;

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

async function readMongo(dayKey) {
  const row = await YouTubeQuotaUsage.findOne({ dayKey }).lean();
  return { units: Number(row?.units || 0), exhausted: Boolean(row?.exhausted) };
}

async function readState() {
  const dayKey = getPacificQuotaDay();
  if (exhaustedInProcessDay === dayKey) return { dayKey, units: env.ytDailyQuotaBudget, exhausted: true, store: "process" };
  // Mongo is the single source of truth for quota reservations. Mixing Redis and
  // Mongo counters can undercount or double-count when one store times out.
  const mongo = await readMongo(dayKey);
  return { dayKey, ...mongo, store: "mongo" };
}

export async function getState() {
  if (testAdapters?.getState) return testAdapters.getState();
  try {
    const current = await readState();
    return { state: stateFor(current.units, current.exhausted), units: current.units,
      budget: env.ytDailyQuotaBudget, softLimitPct: env.ytSoftLimitPct,
      resetDay: current.dayKey, store: current.store };
  } catch {
    // If both counters are unavailable, fail closed rather than overspend.
    return { state: "degraded", units: 0, budget: env.ytDailyQuotaBudget,
      softLimitPct: env.ytSoftLimitPct, resetDay: getPacificQuotaDay(), store: "unavailable" };
  }
}

async function reserveMongoQuota(dayKey, cost, budget) {
  // Ensure the row exists first. Handle concurrent first-use upserts against the
  // unique dayKey index; the following conditional update is the actual reservation.
  try {
    await YouTubeQuotaUsage.updateOne(
      { dayKey },
      // dayKey is supplied by the equality filter on upsert.
      { $setOnInsert: { units: 0, exhausted: false } },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  // The budget check and increment happen in one atomic MongoDB operation.
  // A read-then-$inc sequence can overshoot when multiple app workers race.
  const row = await YouTubeQuotaUsage.findOneAndUpdate(
    { dayKey, exhausted: { $ne: true }, units: { $lte: budget - cost } },
    { $inc: { units: cost } },
    { new: true }
  ).lean();
  return row ? Number(row.units || 0) : null;
}

export async function markQuotaExceeded() {
  if (testAdapters?.markQuotaExceeded) return testAdapters.markQuotaExceeded();
  const dayKey = getPacificQuotaDay();
  exhaustedInProcessDay = dayKey;
  try {
    await YouTubeQuotaUsage.updateOne(
      { dayKey },
      { $set: { exhausted: true }, $setOnInsert: { units: 0 } },
      { upsert: true }
    );
  } catch {
    // The process-local latch still blocks calls until the Pacific reset.
    console.error("YouTube quota exhaustion could not be persisted; process-local guard remains active");
  }
}

export async function tryConsume(cost) {
  const amount = Number(cost);
  if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("Quota cost must be a positive number");
  const before = await getState();
  if (before.store === "unavailable") {
    const error = new QuotaBudgetError("degraded", "Quota storage unavailable; refusing provider request");
    error.details = before;
    throw error;
  }
  if (before.state === "exhausted" || before.units + amount > before.budget) {
    const error = new QuotaBudgetError("exhausted");
    error.details = before;
    throw error;
  }

  // Tests use the same atomic-reservation contract as production. Keep a narrow
  // compatibility seam for older test fixtures while production always uses Mongo.
  let units;
  const dayKey = getPacificQuotaDay();
  try {
    if (testAdapters?.consumeWithinBudget) {
      units = await testAdapters.consumeWithinBudget(amount, before.budget);
    } else if (testAdapters?.increment) {
      units = await testAdapters.increment(amount);
      if (units > before.budget) units = null;
    } else {
      units = await reserveMongoQuota(dayKey, amount, before.budget);
    }
  } catch {
    const error = new QuotaBudgetError("degraded", "Quota storage unavailable; refusing provider request");
    error.details = { ...before, state: "degraded", store: "unavailable" };
    throw error;
  }

  if (units === null || units === undefined) {
    let latest = before;
    try {
      latest = testAdapters?.getState
        ? await testAdapters.getState()
        : { ...await readMongo(dayKey), budget: before.budget, store: "mongo", resetDay: dayKey };
    } catch {}
    const error = new QuotaBudgetError("exhausted");
    error.details = {
      ...latest,
      state: "exhausted",
      units: Number(latest.units ?? before.budget),
      budget: before.budget,
      store: latest.store || "mongo",
      resetDay: latest.resetDay || dayKey
    };
    throw error;
  }

  return { allowed: true, cost: amount, units, state: stateFor(units), resetDay: dayKey };
}

export function __setQuotaTestAdapters(adapters = null) { testAdapters = adapters; }

export const __quotaTestHooks = Object.freeze({ stateFor, secondsUntilPacificReset });
