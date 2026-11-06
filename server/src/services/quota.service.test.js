import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { __setQuotaTestAdapters, tryConsume, QuotaBudgetError } from "./quota.service.js";

test("degraded soft-limit state still permits search while hard quota remains", async () => {
  let storedUnits = Math.ceil(env.ytDailyQuotaBudget * env.ytSoftLimitPct / 100) + 100;
  __setQuotaTestAdapters({
    getState: async () => ({
      state: "degraded",
      units: storedUnits,
      budget: env.ytDailyQuotaBudget,
      softLimitPct: env.ytSoftLimitPct,
      resetDay: "test-day",
      store: "test"
    }),
    consumeWithinBudget: async (amount, budget) => {
      if (storedUnits + amount > budget) return null;
      storedUnits += amount;
      return storedUnits;
    }
  });

  try {
    const result = await tryConsume(100);
    assert.equal(result.allowed, true);
    assert.equal(result.units, storedUnits);
    assert.equal(result.state, "degraded");
  } finally {
    __setQuotaTestAdapters(null);
  }
});

test("hard daily quota still blocks search requests", async () => {
  __setQuotaTestAdapters({
    getState: async () => ({
      state: "degraded",
      units: env.ytDailyQuotaBudget - 50,
      budget: env.ytDailyQuotaBudget,
      softLimitPct: env.ytSoftLimitPct,
      resetDay: "test-day",
      store: "test"
    })
  });

  try {
    await assert.rejects(
      tryConsume(100),
      (error) => error instanceof QuotaBudgetError && error.state === "exhausted"
    );
  } finally {
    __setQuotaTestAdapters(null);
  }
});

test("an exhausted provider quota remains blocked", async () => {
  __setQuotaTestAdapters({
    getState: async () => ({
      state: "exhausted",
      units: env.ytDailyQuotaBudget,
      budget: env.ytDailyQuotaBudget,
      softLimitPct: env.ytSoftLimitPct,
      resetDay: "test-day",
      store: "test"
    })
  });

  try {
    await assert.rejects(
      tryConsume(100),
      (error) => error instanceof QuotaBudgetError && error.state === "exhausted"
    );
  } finally {
    __setQuotaTestAdapters(null);
  }
});


test("concurrent quota reservations cannot overshoot the hard daily budget", async () => {
  const budget = env.ytDailyQuotaBudget;
  let storedUnits = budget - 200;
  __setQuotaTestAdapters({
    getState: async () => ({
      state: storedUnits >= budget ? "exhausted" : "ok",
      units: storedUnits,
      budget,
      softLimitPct: env.ytSoftLimitPct,
      resetDay: "test-day",
      store: "test"
    }),
    consumeWithinBudget: async (amount, maximum) => {
      // Synchronous compare-and-reserve represents the production atomic DB update.
      if (storedUnits + amount > maximum) return null;
      storedUnits += amount;
      return storedUnits;
    }
  });

  try {
    const outcomes = await Promise.allSettled([tryConsume(100), tryConsume(100), tryConsume(100)]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 2);
    assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
    assert.equal(storedUnits, budget);
  } finally {
    __setQuotaTestAdapters(null);
  }
});
