import mongoose from "mongoose";

const apiRateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  hits: { type: Number, required: true, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

apiRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ApiRateLimit = mongoose.models.ApiRateLimit
  || mongoose.model("ApiRateLimit", apiRateLimitSchema);
