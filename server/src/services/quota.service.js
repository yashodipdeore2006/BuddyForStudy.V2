import { env } from "../config/env.js";
import { cacheGetNumber, cacheIncrementWithExpiry, cacheSetRaw } from "../config/cache.js";
import { YouTubeQuotaUsage } from "../models/YouTubeQuotaUsage.js";

export const YOUTUBE_API_COST = Object.freeze({ search: 100, default: 1 });

export class QuotaBudgetError extends Error {
  constructor(state, message = "YouTube quota budget refused this request") {
    super(message);
    this.name = "QuotaBudgetError";
    this.code = "YOUTUBE_QUOTA_BUDGET";
    this.state = state;
  }
}

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
  const redisKey = `youtube:quota:${dayKey}:units`;
  const exhaustedKey = `youtube:quota:${dayKey}:exhausted`;
  const redisUnits = await cacheGetNumber(redisKey);
  if (redisUnits !== null && Number.isFinite(redisUnits)) {
    const exhausted = (await cacheGetNumber(exhaustedKey)) === 1;
    return { dayKey, units: redisUnits, exhausted, store: "redis" };
  }
  const mongo = await readMongo(dayKey);
  return { dayKey, ...mongo, store: "mongo" };
}

export async function getState() {
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

async function incrementMongo(dayKey, cost) {
  const row = await YouTubeQuotaUsage.findOneAndUpdate(
    { dayKey },
    { $inc: { units: cost }, $setOnInsert: { dayKey, exhausted: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return Number(row?.units || 0);
}

export async function markQuotaExceeded() {
  const dayKey = getPacificQuotaDay();
  const redisKey = `youtube:quota:${dayKey}:exhausted`;
  const ttl = secondsUntilPacificReset();
  const redisStored = await cacheSetRaw(redisKey, 1, ttl);
  try {
    await YouTubeQuotaUsage.updateOne({ dayKey }, { $set: { exhausted: true }, $setOnInsert: { units: 0 } }, { upsert: true });
  } catch {
    if (!redisStored) throw new Error("Unable to persist YouTube quota exhaustion state");
  }
}

export async function tryConsume(cost) {
  const amount = Number(cost);
  if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("Quota cost must be a positive number");
  const before = await getState();
  if (before.state === "exhausted") throw new QuotaBudgetError("exhausted");
  if (before.state === "degraded" && amount >= YOUTUBE_API_COST.search) {
    throw new QuotaBudgetError("degraded", "Search requests are disabled above the soft quota limit");
  }
  if (before.units + amount > before.budget) throw new QuotaBudgetError("exhausted");

  const dayKey = getPacificQuotaDay();
  let units;
  const redisKey = `youtube:quota:${dayKey}:units`;
  const redisUnits = await cacheIncrementWithExpiry(redisKey, amount, secondsUntilPacificReset());
  if (redisUnits !== null) {
    units = redisUnits;
  } else {
    units = await incrementMongo(dayKey, amount);
  }

  const state = stateFor(units);
  if (units > before.budget) throw new QuotaBudgetError("exhausted");
  return { allowed: true, cost: amount, units, state, resetDay: dayKey };
}

export const __quotaTestHooks = Object.freeze({
  stateFor,
  secondsUntilPacificReset
});
