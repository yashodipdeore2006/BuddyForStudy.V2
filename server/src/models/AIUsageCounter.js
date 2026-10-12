import mongoose from "mongoose";

const aiUsageCounterSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  feature: { type: String, required: true, index: true },
  period: { type: String, enum: ["hour", "day", "month"], required: true, index: true },
  periodStart: { type: Date, required: true, index: true },
  count: { type: Number, default: 0, min: 0 }
}, { timestamps: true, collection: "ai_usage_counters" });

aiUsageCounterSchema.index({ user: 1, feature: 1, period: 1, periodStart: 1 }, { unique: true });

export const AIUsageCounter = mongoose.model("AIUsageCounter", aiUsageCounterSchema);
