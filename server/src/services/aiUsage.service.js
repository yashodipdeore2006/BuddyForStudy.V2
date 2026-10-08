import { AIUsageCounter } from "../models/AIUsageCounter.js";

function startOf(period, now = new Date()) {
  const date = new Date(now);
  if (period === "hour") {
    date.setMinutes(0, 0, 0);
    return date;
  }
  if (period === "day") {
    date.setHours(0, 0, 0, 0);
    return date;
  }
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getUsage(userId, feature, period = "month") {
  const periodStart = startOf(period);
  const counter = await AIUsageCounter.findOne({ user: userId, feature, period, periodStart }).lean();
  return counter?.count || 0;
}

export async function consumeUsage({ userId, feature, period = "month", limit = -1, amount = 1 }) {
  const parsedLimit = Number(limit);
  if (parsedLimit === -1) {
    return { allowed: true, count: await increment(userId, feature, period, amount), limit: -1 };
  }
  if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
    return { allowed: false, count: 0, limit: parsedLimit };
  }
  if (amount <= 0) return { allowed: true, count: await getUsage(userId, feature, period), limit: parsedLimit };

  const periodStart = startOf(period);

  let counter = await AIUsageCounter.findOneAndUpdate(
    { user: userId, feature, period, periodStart, count: { $lte: parsedLimit - amount } },
    { $inc: { count: amount }, $set: { updatedAt: new Date() }, $setOnInsert: { user: userId, feature, period, periodStart } },
    { new: true }
  ).lean();

  if (counter) return { allowed: true, count: counter.count, limit: parsedLimit };

  try {
    counter = await AIUsageCounter.create({
      user: userId,
      feature,
      period,
      periodStart,
      count: amount
    });
    return { allowed: true, count: counter.count, limit: parsedLimit };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    counter = await AIUsageCounter.findOneAndUpdate(
      { user: userId, feature, period, periodStart, count: { $lte: parsedLimit - amount } },
      { $inc: { count: amount } },
      { new: true }
    ).lean();
    if (counter) return { allowed: true, count: counter.count, limit: parsedLimit };
    return {
      allowed: false,
      count: await getUsage(userId, feature, period),
      limit: parsedLimit
    };
  }
}

async function increment(userId, feature, period, amount) {
  const periodStart = startOf(period);
  try {
    const counter = await AIUsageCounter.findOneAndUpdate(
      { user: userId, feature, period, periodStart },
      { $inc: { count: amount } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return counter?.count || amount;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const counter = await AIUsageCounter.findOneAndUpdate(
      { user: userId, feature, period, periodStart },
      { $inc: { count: amount } },
      { new: true }
    ).lean();
    return counter?.count || amount;
  }
}
