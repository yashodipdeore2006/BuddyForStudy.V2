import { ApiRateLimit } from "../models/ApiRateLimit.js";

/**
 * Mongo-backed fixed-window store for express-rate-limit. A shared collection
 * keeps counters consistent across API instances; the window is part of the
 * unique key so requests cannot race across a reset boundary.
 */
export class MongoRateLimitStore {
  constructor(namespace, { model = ApiRateLimit, now = () => Date.now() } = {}) {
    if (!namespace || typeof namespace !== "string") {
      throw new TypeError("A non-empty rate-limit namespace is required.");
    }
    this.namespace = namespace;
    this.model = model;
    this.now = now;
    this.windowMs = 60_000;
  }

  init(options) {
    const configuredWindow = Number(options?.windowMs);
    if (!Number.isFinite(configuredWindow) || configuredWindow < 1) {
      throw new TypeError("A positive rate-limit window is required.");
    }
    this.windowMs = configuredWindow;
  }

  getWindow(now = this.now()) {
    const start = Math.floor(now / this.windowMs) * this.windowMs;
    return { start, resetTime: new Date(start + this.windowMs) };
  }

  getDocumentKey(key, windowStart) {
    return this.namespace + ":" + windowStart + ":" + String(key);
  }

  async increment(key) {
    const { start, resetTime } = this.getWindow();
    const documentKey = this.getDocumentKey(key, start);
    const update = {
      $inc: { hits: 1 },
      $setOnInsert: { expiresAt: new Date(resetTime.getTime() + this.windowMs) },
    };
    let record;
    try {
      record = await this.model.findOneAndUpdate(
        { key: documentKey },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      // Two instances can race to create the first counter for a window.
      // The unique key arbitrates; the loser retries as an ordinary increment.
      if (error?.code !== 11000) throw error;
      record = await this.model.findOneAndUpdate(
        { key: documentKey },
        { $inc: { hits: 1 } },
        { new: true },
      );
    }
    if (!record || !Number.isFinite(Number(record.hits))) {
      throw new Error("The shared rate-limit counter could not be updated.");
    }
    return { totalHits: Number(record.hits), resetTime };
  }

  async decrement(key) {
    const { start } = this.getWindow();
    await this.model.updateOne(
      { key: this.getDocumentKey(key, start), hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }

  async resetKey(key) {
    const { start } = this.getWindow();
    await this.model.deleteOne({ key: this.getDocumentKey(key, start) });
  }

  async get(key) {
    const { start, resetTime } = this.getWindow();
    const record = await this.model.findOne({ key: this.getDocumentKey(key, start) }).lean();
    if (!record || !Number.isFinite(Number(record.hits))) return undefined;
    return { totalHits: Number(record.hits), resetTime };
  }
}
